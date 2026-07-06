import { Client as ColyseusClient, type Room as ColyseusRoom } from "@colyseus/sdk";
import {
  clonePeer,
  cloneSession,
  createMultiplayerError,
  multiplayerErrorCodes,
  type CreateSessionRequest,
  type JoinSessionRequest,
  type MultiplayerBackendAdapter,
  type MultiplayerBackendCapabilities,
  type MultiplayerBackendConnection,
  type MultiplayerBackendListener,
  type MultiplayerBackendSnapshot,
  type MultiplayerChannel,
  type MultiplayerConnectionSnapshot,
  type MultiplayerMessageEnvelope,
  type MultiplayerPeer,
  type MultiplayerPeerInput,
  type MultiplayerPhase,
  type MultiplayerSession
} from "@gamekit/multiplayer-core";

import {
  cloneEnvelope,
  estimatePayloadBytes,
  isMultiplayerMessageEnvelope,
  isPresencePayload
} from "./messages";
import type {
  ColyseusMessageType,
  ColyseusMultiplayerBackendOptions,
  ColyseusMultiplayerNative,
  GameKitColyseusRoomJoinOptions
} from "./types";

type ColyseusConnectionState = {
  runtimeId: string;
  phase: MultiplayerPhase;
  localPeer?: MultiplayerPeer;
  session?: MultiplayerSession;
  room?: ColyseusRoom;
  listeners: Set<MultiplayerBackendListener>;
  messageUnsubscribe?: () => void;
  presenceUnsubscribe?: () => void;
  leaveHandler?: (code: number, reason?: string) => void;
  dropHandler?: (code: number, reason?: string) => void;
  reconnectHandler?: () => void;
  sent: number;
  received: number;
  invalid: number;
  clock: () => number;
  closed: boolean;
  lastReason?: string;
};

export function createColyseusMultiplayerBackend(
  options: ColyseusMultiplayerBackendOptions
): MultiplayerBackendAdapter {
  const id = options.id ?? "colyseus";
  const messageType = options.messageType ?? "gamekit.message";
  const presenceType = options.presenceType ?? "gamekit.presence";
  const maxPayloadBytes = options.maxPayloadBytes ?? 32 * 1024;
  const client = options.client ?? new ColyseusClient(options.endpoint, options.clientOptions);
  const connections = new Set<ColyseusConnectionState>();
  const providerRoomIds = new Map<string, string>();

  const capabilities: MultiplayerBackendCapabilities = {
    channels: options.channels ?? defaultChannels(maxPayloadBytes),
    reconnect: false,
    maxPayloadBytes,
    metadata: {
      roomName: options.roomName,
      provider: "colyseus"
    }
  };

  const native: ColyseusMultiplayerNative = {
    client,
    endpoint: options.endpoint,
    roomName: options.roomName,
    currentRoom() {
      for (const connection of connections) {
        if (connection.room) {
          return connection.room;
        }
      }

      return undefined;
    }
  };

  function snapshot(): MultiplayerBackendSnapshot {
    return {
      id,
      kind: "colyseus",
      capabilities,
      activeSessions: [...connections].filter((connection) => connection.session).length,
      activeConnections: connections.size,
      metadata: {
        endpoint: redactEndpoint(options.endpoint),
        roomName: options.roomName
      }
    };
  }

  return {
    id,
    kind: "colyseus",
    capabilities,
    async connect(ctx) {
      const state: ColyseusConnectionState = {
        runtimeId: ctx.runtimeId,
        phase: "connected",
        ...(ctx.localPeer ? { localPeer: toPeer(ctx.localPeer, ctx.localPeer.id, "client") } : {}),
        listeners: new Set(),
        sent: 0,
        received: 0,
        invalid: 0,
        clock: ctx.clock ?? (() => Date.now()),
        closed: false
      };
      connections.add(state);

      const connection: MultiplayerBackendConnection = {
        async createSession(request: CreateSessionRequest = {}) {
          assertOpen(state);
          await detachRoom(state, "replaced by createSession");
          state.phase = "connecting";
          const requestedSessionId = request.id;
          const providerRoomId =
            requestedSessionId === undefined ? undefined : toColyseusRoomId(requestedSessionId);
          const room = await client.create(
            options.roomName,
            buildJoinOptions(
              options.createOptions,
              options,
              createRoomJoinInput(
                request,
                request.localPeer ?? ctx.localPeer,
                providerRoomId,
                options.metadata
              )
            )
          );
          const sessionId = requestedSessionId ?? room.roomId;
          providerRoomIds.set(sessionId, room.roomId);
          attachRoom(state, room, messageType, presenceType, maxPayloadBytes);
          state.localPeer = toPeer(
            request.localPeer ?? ctx.localPeer,
            room.sessionId,
            request.localPeer?.role ?? "host"
          );
          state.session = createSessionSummary(sessionId, request, options, state.localPeer);
          state.phase = "in-session";
          return cloneSession(state.session);
        },
        async joinSession(request: JoinSessionRequest) {
          assertOpen(state);
          await detachRoom(state, "replaced by joinSession");
          state.phase = "connecting";
          const joinOptions = buildJoinOptions(options.joinOptions, options, {
            sessionId: request.sessionId,
            ...((request.localPeer ?? ctx.localPeer)
              ? { localPeer: request.localPeer ?? ctx.localPeer }
              : {}),
            ...optionalMetadata(mergeMetadata(options.metadata, request.metadata))
          });
          const providerRoomId =
            providerRoomIds.get(request.sessionId) ?? toColyseusRoomId(request.sessionId);
          const room = await joinRoomById(client, options.roomName, providerRoomId, joinOptions, {
            fallback: options.joinByIdFallback === true
          });
          providerRoomIds.set(request.sessionId, room.roomId);
          attachRoom(state, room, messageType, presenceType, maxPayloadBytes);
          state.localPeer = toPeer(
            request.localPeer ?? ctx.localPeer,
            room.sessionId,
            request.localPeer?.role ?? "client"
          );
          state.session = createSessionSummary(
            request.sessionId,
            createRequestFromJoinRequest(request),
            options,
            state.localPeer
          );
          state.phase = "in-session";
          return cloneSession(state.session);
        },
        async leaveSession(reason?: string) {
          assertOpen(state);
          await detachRoom(state, reason ?? "left session");
          state.phase = "connected";
        },
        async send(message: MultiplayerMessageEnvelope) {
          assertOpen(state);
          if (!state.room || !state.session) {
            throw createMultiplayerError(
              multiplayerErrorCodes.missingSession,
              "Cannot send Colyseus multiplayer message without a joined room."
            );
          }

          validateOutgoingMessage(message, state, maxPayloadBytes);
          state.room.send(messageType, message);
          state.sent += 1;
        },
        subscribe(listener) {
          state.listeners.add(listener);

          return () => {
            state.listeners.delete(listener);
          };
        },
        async close(reason?: string) {
          if (state.closed) {
            return;
          }

          state.closed = true;
          await detachRoom(state, reason ?? "connection closed");
          state.phase = "closed";
          state.listeners.clear();
          connections.delete(state);
        },
        snapshot() {
          return snapshotConnection(state);
        }
      };

      return connection;
    },
    native() {
      return native;
    },
    snapshot
  };
}

function attachRoom(
  state: ColyseusConnectionState,
  room: ColyseusRoom,
  messageType: ColyseusMessageType,
  presenceType: ColyseusMessageType,
  maxPayloadBytes: number
): void {
  state.room = room;
  state.messageUnsubscribe = room.onMessage(messageType, (message) => {
    receiveMessage(state, message, maxPayloadBytes);
  });
  state.presenceUnsubscribe = room.onMessage(presenceType, (message) => {
    receivePresence(state, message);
  });
  state.leaveHandler = (_code, reason) => {
    setLastReason(state, reason);
    state.phase = state.closed ? "closed" : "connected";
    delete state.room;
    delete state.session;
  };
  room.onLeave(state.leaveHandler);
  state.dropHandler = (_code, reason) => {
    setLastReason(state, reason);
    state.phase = "closed";
  };
  room.onDrop(state.dropHandler);
  state.reconnectHandler = () => {
    state.phase = state.session ? "in-session" : "connected";
  };
  room.onReconnect(state.reconnectHandler);
}

async function detachRoom(state: ColyseusConnectionState, reason: string): Promise<void> {
  const room = state.room;
  state.messageUnsubscribe?.();
  state.presenceUnsubscribe?.();
  if (room && state.leaveHandler) {
    room.onLeave.remove(state.leaveHandler);
  }
  if (room && state.dropHandler) {
    room.onDrop.remove(state.dropHandler);
  }
  if (room && state.reconnectHandler) {
    room.onReconnect.remove(state.reconnectHandler);
  }
  delete state.messageUnsubscribe;
  delete state.presenceUnsubscribe;
  delete state.leaveHandler;
  delete state.dropHandler;
  delete state.reconnectHandler;
  delete state.room;
  delete state.session;
  state.lastReason = reason;

  if (room) {
    await room.leave(true);
  }
}

function receiveMessage(
  state: ColyseusConnectionState,
  message: unknown,
  maxPayloadBytes: number
): void {
  if (!isMultiplayerMessageEnvelope(message)) {
    state.invalid += 1;
    return;
  }

  try {
    if (estimatePayloadBytes(message) > maxPayloadBytes) {
      state.invalid += 1;
      return;
    }
  } catch {
    state.invalid += 1;
    return;
  }

  state.received += 1;
  const envelope = cloneEnvelope(message);
  for (const listener of Array.from(state.listeners)) {
    listener(envelope);
  }
}

function receivePresence(state: ColyseusConnectionState, message: unknown): void {
  if (!isMultiplayerMessageEnvelope(message) || !isPresencePayload(message.payload)) {
    state.invalid += 1;
    return;
  }

  state.session = cloneSession(message.payload.session);
  if (state.localPeer) {
    const localPeer = state.session.peers.find((peer) => peer.id === state.localPeer?.id);
    if (localPeer) {
      state.localPeer = clonePeer(localPeer);
    }
  }
  receiveMessage(state, message, Number.POSITIVE_INFINITY);
}

function validateOutgoingMessage(
  message: MultiplayerMessageEnvelope,
  state: ColyseusConnectionState,
  maxPayloadBytes: number
): void {
  if (message.sessionId !== state.session?.id) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      `Colyseus multiplayer message session mismatch: ${message.sessionId}`,
      { expectedSessionId: state.session?.id, actualSessionId: message.sessionId }
    );
  }

  if (state.localPeer && message.sourcePeerId !== state.localPeer.id) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      `Colyseus multiplayer message source mismatch: ${message.sourcePeerId}`,
      { expectedPeerId: state.localPeer.id, actualPeerId: message.sourcePeerId }
    );
  }

  let payloadBytes = 0;
  try {
    payloadBytes = estimatePayloadBytes(message);
  } catch (error) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      "Colyseus multiplayer message must be JSON serializable.",
      { cause: error }
    );
  }

  if (payloadBytes > maxPayloadBytes) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      `Colyseus multiplayer message exceeds max payload bytes: ${maxPayloadBytes}`,
      { maxPayloadBytes }
    );
  }
}

function snapshotConnection(state: ColyseusConnectionState): MultiplayerConnectionSnapshot {
  return {
    phase: state.phase,
    ...(state.localPeer ? { localPeer: clonePeer(state.localPeer) } : {}),
    ...(state.session ? { session: cloneSession(state.session) } : {}),
    peers: (state.session?.peers ?? []).map(clonePeer),
    sent: state.sent,
    received: state.received
  };
}

function createSessionSummary(
  sessionId: string,
  request: CreateSessionRequest,
  options: ColyseusMultiplayerBackendOptions,
  localPeer: MultiplayerPeer
): MultiplayerSession {
  const metadata = mergeMetadata(options.metadata, request.metadata);
  return {
    id: sessionId,
    kind: request.kind ?? options.sessionKind ?? "private",
    authority: request.authority ?? options.authority ?? "server-authoritative",
    status: "open",
    peers: [clonePeer(localPeer)],
    ...(metadata ? { metadata } : {})
  };
}

function buildJoinOptions(
  defaults: Record<string, unknown> | undefined,
  backendOptions: ColyseusMultiplayerBackendOptions,
  input: GameKitColyseusRoomJoinOptions
): GameKitColyseusRoomJoinOptions {
  const metadata = mergeMetadata(backendOptions.metadata, input.metadata);
  return {
    ...defaults,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
    sessionKind: input.sessionKind ?? backendOptions.sessionKind ?? "private",
    authority: input.authority ?? backendOptions.authority ?? "server-authoritative",
    ...(input.localPeer === undefined ? {} : { localPeer: input.localPeer }),
    ...(metadata ? { metadata } : {})
  };
}

function createRoomJoinInput(
  request: CreateSessionRequest,
  localPeer: MultiplayerPeerInput | undefined,
  providerRoomId: string | undefined,
  backendMetadata: Record<string, unknown> | undefined
): GameKitColyseusRoomJoinOptions {
  return {
    ...(request.id === undefined ? {} : { sessionId: request.id }),
    ...(providerRoomId === undefined ? {} : { roomId: providerRoomId }),
    ...(localPeer === undefined ? {} : { localPeer }),
    ...(request.kind === undefined ? {} : { sessionKind: request.kind }),
    ...(request.authority === undefined ? {} : { authority: request.authority }),
    ...optionalMetadata(mergeMetadata(backendMetadata, request.metadata))
  };
}

function createRequestFromJoinRequest(request: JoinSessionRequest): CreateSessionRequest {
  return {
    id: request.sessionId,
    ...(request.localPeer === undefined ? {} : { localPeer: request.localPeer }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  };
}

async function joinRoomById(
  client: ColyseusClient,
  roomName: string,
  roomId: string,
  joinOptions: GameKitColyseusRoomJoinOptions,
  options: { fallback: boolean }
): Promise<ColyseusRoom> {
  try {
    return await client.joinById(roomId, joinOptions);
  } catch (error) {
    if (!options.fallback) {
      throw error;
    }

    return await client.create(roomName, {
      ...joinOptions,
      roomId
    });
  }
}

function toPeer(
  input: MultiplayerPeerInput | undefined,
  fallbackId: string | undefined,
  fallbackRole: string
): MultiplayerPeer {
  const peerId = input?.id ?? fallbackId;
  if (!peerId) {
    throw createMultiplayerError(
      multiplayerErrorCodes.missingLocalPeer,
      "Colyseus multiplayer peer requires a stable id or room session id."
    );
  }

  return {
    id: peerId,
    ...(input?.displayName === undefined ? {} : { displayName: input.displayName }),
    role: input?.role ?? fallbackRole,
    status: "connected",
    ...(input?.playerId === undefined ? {} : { playerId: input.playerId }),
    ...(input?.metadata ? { metadata: { ...input.metadata } } : {})
  };
}

function mergeMetadata(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const metadata = {
    ...base,
    ...override
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function optionalMetadata(
  metadata: Record<string, unknown> | undefined
): { metadata: Record<string, unknown> } | Record<string, never> {
  return metadata ? { metadata } : {};
}

function setLastReason(state: ColyseusConnectionState, reason: string | undefined): void {
  if (reason === undefined) {
    delete state.lastReason;
    return;
  }

  state.lastReason = reason;
}

function toColyseusRoomId(sessionId: string): string {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.length > 0 ? sanitized : "gamekit_session";
}

function defaultChannels(maxPayloadBytes: number): MultiplayerChannel[] {
  return [
    {
      id: "reliable",
      reliability: "reliable",
      ordering: "ordered",
      maxPayloadBytes
    }
  ];
}

function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }
    return url.toString();
  } catch {
    return endpoint;
  }
}

function assertOpen(state: ColyseusConnectionState): void {
  if (state.closed || state.phase === "closed" || state.phase === "disposed") {
    throw createMultiplayerError(
      multiplayerErrorCodes.closedConnection,
      `Colyseus multiplayer connection is closed: ${state.runtimeId}`,
      { runtimeId: state.runtimeId, reason: state.lastReason }
    );
  }
}
