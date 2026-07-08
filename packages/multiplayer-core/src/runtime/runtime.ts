import { createMultiplayerError, multiplayerErrorCodes } from "./errors";
import type {
  CreateMultiplayerRuntimeOptions,
  CreateSessionRequest,
  JoinSessionRequest,
  MultiplayerBackendConnection,
  MultiplayerMessageEnvelope,
  MultiplayerMessageListener,
  MultiplayerOutgoingMessage,
  MultiplayerPeer,
  MultiplayerPhase,
  MultiplayerRuntime,
  MultiplayerSession
} from "./types";

export function createMultiplayerRuntime(
  options: CreateMultiplayerRuntimeOptions
): MultiplayerRuntime {
  const clock = options.clock ?? (() => Date.now());
  const idGenerator = options.idGenerator ?? createSequentialIdGenerator(options.id);
  const listeners = new Set<MultiplayerMessageListener>();
  let connection: MultiplayerBackendConnection | undefined;
  let connectionUnsubscribe: (() => void) | undefined;
  let phase: MultiplayerPhase = "idle";
  let session: MultiplayerSession | undefined;
  let localPeer: MultiplayerPeer | undefined;
  let sent = 0;
  let received = 0;
  let sequence = 0;

  async function ensureConnection(): Promise<MultiplayerBackendConnection> {
    assertNotDisposed(phase);

    if (connection) {
      return connection;
    }

    phase = "connecting";
    connection = await options.backend.connect({
      ...options.connectContext,
      runtimeId: options.id,
      clock
    });
    connectionUnsubscribe = connection.subscribe((message) => {
      received += 1;
      for (const listener of Array.from(listeners)) {
        listener(message);
      }
    });
    refreshFromConnectionSnapshot();
    if (phase === "connecting") {
      phase = "connected";
    }

    return connection;
  }

  function refreshFromConnectionSnapshot(): void {
    if (!connection) {
      return;
    }

    const snapshot = connection.snapshot();
    session = snapshot.session;
    localPeer = snapshot.localPeer;
    if (phase !== "disposed") {
      phase = session ? "in-session" : snapshot.phase;
    }
  }

  const runtime: MultiplayerRuntime = {
    id: options.id,
    backendId: options.backend.id,
    phase() {
      refreshFromConnectionSnapshot();
      return phase;
    },
    async createSession(request: CreateSessionRequest = {}) {
      const activeConnection = await ensureConnection();
      session = await activeConnection.createSession(request);
      refreshFromConnectionSnapshot();
      return cloneSession(session);
    },
    async joinSession(request: JoinSessionRequest) {
      const activeConnection = await ensureConnection();
      session = await activeConnection.joinSession(request);
      refreshFromConnectionSnapshot();
      return cloneSession(session);
    },
    async leaveSession(reason) {
      assertNotDisposed(phase);
      if (!connection) {
        return;
      }

      await connection.leaveSession(reason);
      refreshFromConnectionSnapshot();
      if (!session && phase !== "disposed") {
        phase = "connected";
      }
    },
    async reconnect() {
      throw createMultiplayerError(
        multiplayerErrorCodes.unsupportedCapability,
        "Reconnect is not supported by this multiplayer runtime.",
        {
          backendId: options.backend.id,
          capability: "reconnect"
        }
      );
    },
    async send<TPayload = unknown>(message: MultiplayerOutgoingMessage<TPayload>) {
      assertNotDisposed(phase);
      const activeConnection = await ensureConnection();
      const activeSession = session ?? activeConnection.snapshot().session;
      const activePeer = localPeer ?? activeConnection.snapshot().localPeer;

      if (!activeSession) {
        throw createMultiplayerError(
          multiplayerErrorCodes.missingSession,
          "Cannot send multiplayer message without an active session."
        );
      }

      if (!activePeer) {
        throw createMultiplayerError(
          multiplayerErrorCodes.missingLocalPeer,
          "Cannot send multiplayer message without a local peer."
        );
      }

      const envelope = normalizeOutgoingMessage(
        message,
        activeSession.id,
        activePeer.id,
        ++sequence,
        clock(),
        idGenerator
      );

      await activeConnection.send(envelope);
      sent += 1;
    },
    subscribe<TPayload = unknown>(listener: MultiplayerMessageListener<TPayload>) {
      const wrapped = listener as MultiplayerMessageListener;
      listeners.add(wrapped);

      return () => {
        listeners.delete(wrapped);
      };
    },
    peers() {
      refreshFromConnectionSnapshot();
      return (session?.peers ?? []).map(clonePeer);
    },
    localPeer() {
      refreshFromConnectionSnapshot();
      return localPeer ? clonePeer(localPeer) : undefined;
    },
    session() {
      refreshFromConnectionSnapshot();
      return session ? cloneSession(session) : undefined;
    },
    snapshot() {
      refreshFromConnectionSnapshot();
      const connectionSnapshot = connection?.snapshot();
      return {
        id: options.id,
        backendId: options.backend.id,
        phase,
        ...(localPeer ? { localPeer: clonePeer(localPeer) } : {}),
        ...(session ? { session: cloneSession(session) } : {}),
        peers: (session?.peers ?? connectionSnapshot?.peers ?? []).map(clonePeer),
        sent,
        received,
        backend: options.backend.snapshot(),
        ...(connectionSnapshot ? { connection: connectionSnapshot } : {})
      };
    },
    async dispose() {
      if (phase === "disposed") {
        return;
      }

      phase = "disposed";
      connectionUnsubscribe?.();
      connectionUnsubscribe = undefined;
      listeners.clear();
      await connection?.close("runtime disposed");
      connection = undefined;
      session = undefined;
      localPeer = undefined;
    }
  };

  return runtime;
}

export function normalizeOutgoingMessage<TPayload>(
  message: MultiplayerOutgoingMessage<TPayload>,
  sessionId: string,
  sourcePeerId: string,
  sequence: number,
  timestamp: number,
  idGenerator: () => string
): MultiplayerMessageEnvelope<TPayload> {
  if (!message.channel) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      "Multiplayer message requires a channel."
    );
  }

  if (!message.kind) {
    throw createMultiplayerError(
      multiplayerErrorCodes.invalidMessage,
      "Multiplayer message requires a kind."
    );
  }

  return {
    id: message.id ?? idGenerator(),
    sessionId: message.sessionId ?? sessionId,
    channel: message.channel,
    kind: message.kind,
    sourcePeerId,
    ...(message.targetPeerIds ? { targetPeerIds: [...message.targetPeerIds] } : {}),
    sequence: message.sequence ?? sequence,
    ...(message.tick === undefined ? {} : { tick: message.tick }),
    ...(message.schemaVersion === undefined ? {} : { schemaVersion: message.schemaVersion }),
    ...(message.correlationId === undefined ? {} : { correlationId: message.correlationId }),
    timestamp: message.timestamp ?? timestamp,
    payload: message.payload
  };
}

export function cloneSession(session: MultiplayerSession): MultiplayerSession {
  return {
    ...session,
    peers: session.peers.map(clonePeer),
    ...(session.metadata ? { metadata: { ...session.metadata } } : {})
  };
}

export function clonePeer(peer: MultiplayerPeer): MultiplayerPeer {
  return {
    ...peer,
    ...(peer.metadata ? { metadata: { ...peer.metadata } } : {})
  };
}

function assertNotDisposed(phase: MultiplayerPhase): void {
  if (phase === "disposed") {
    throw createMultiplayerError(
      multiplayerErrorCodes.disposed,
      "Multiplayer runtime has been disposed."
    );
  }
}

function createSequentialIdGenerator(prefix: string): () => string {
  let id = 0;

  return () => `${prefix}.message.${++id}`;
}
