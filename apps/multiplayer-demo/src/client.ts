import {
  createColyseusMultiplayerBackend,
  type ColyseusNativeStateBridgeDiagnostics
} from "@gamekit/multiplayer-colyseus";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityReceiver,
  createMultiplayerRuntime,
  type MultiplayerMessageEnvelope,
  type MultiplayerRuntime
} from "@gamekit/multiplayer-core";
import {
  createMultiplayerDemoCommandPayload,
  MULTIPLAYER_DEMO_COMMAND_KIND,
  MULTIPLAYER_DEMO_RELIABLE_CHANNEL,
  type MultiplayerDemoCommand
} from "./domain";
import type { RealtimeInputFrame } from "./realtime/domain";
import {
  REALTIME_ARENA_DEFAULT_AUTHORITY_PATH,
  REALTIME_ARENA_SCHEMA_VERSION,
  type RealtimeArenaAuthorityPath
} from "./realtime/authority-path";
import {
  readRealtimeArenaSnapshotPayload,
  REALTIME_ARENA_ACTION_KIND,
  REALTIME_ARENA_CHANNEL,
  REALTIME_ARENA_INPUT_KIND,
  REALTIME_ARENA_SNAPSHOT_KIND,
  type RealtimeArenaNetworkAction,
  type RealtimeArenaSnapshotPayload
} from "./realtime/protocol";

export type MultiplayerDemoClientOptions = {
  endpoint: string;
  roomName: string;
  sessionId: string;
  hostPeerId: string;
  peerId?: string;
  displayName?: string;
  joinByIdFallback?: boolean;
  authoritativePath?: RealtimeArenaAuthorityPath;
};

export type MultiplayerDemoClient = {
  runtime: MultiplayerRuntime;
  peerId: string;
  authoritativePath: RealtimeArenaAuthorityPath;
  messages: MultiplayerMessageEnvelope[];
  latestRealtimeSnapshot(): RealtimeArenaSnapshotPayload | undefined;
  nativeStateDiagnostics(): ColyseusNativeStateBridgeDiagnostics | undefined;
  connect(): Promise<void>;
  sendCommand(command: MultiplayerDemoCommand): Promise<void>;
  sendRealtimeAction(action: RealtimeArenaNetworkAction): Promise<void>;
  sendRealtimeInput(frame: RealtimeInputFrame): Promise<void>;
  dispose(): Promise<void>;
};

export function createMultiplayerDemoClient(
  options: MultiplayerDemoClientOptions
): MultiplayerDemoClient {
  const peerId = options.peerId ?? createBrowserPeerId();
  const authoritativePath = options.authoritativePath ?? REALTIME_ARENA_DEFAULT_AUTHORITY_PATH;
  const schemaStateSync = authoritativePath === "colyseus-schema";
  const messages: MultiplayerMessageEnvelope[] = [];
  let latestRealtimeSnapshot: RealtimeArenaSnapshotPayload | undefined;
  const backend = createColyseusMultiplayerBackend({
    endpoint: options.endpoint,
    roomName: options.roomName,
    joinByIdFallback: options.joinByIdFallback ?? false,
    nativeCapabilities: {
      authoritativePath,
      stateSync: {
        available: schemaStateSync,
        lane: "colyseus-schema",
        schemaVersion: REALTIME_ARENA_SCHEMA_VERSION
      }
    },
    nativeStateSync: {
      enabled: schemaStateSync,
      schemaVersion: REALTIME_ARENA_SCHEMA_VERSION
    }
  });
  const runtime = createMultiplayerRuntime({
    id: `multiplayer-demo.client.${peerId}`,
    backend,
    connectContext: {
      localPeer: {
        id: peerId,
        displayName: options.displayName ?? "Demo Client",
        role: "client"
      }
    },
    idGenerator: createClientMessageIdGenerator(peerId)
  });
  const authorityBinding = createMultiplayerAuthorityBindingStore({
    sessionId: options.sessionId,
    mode: "host-authoritative",
    authorityPeerId: options.hostPeerId,
    authorityEndpoint: {
      kind: schemaStateSync ? "server" : "peer",
      id: schemaStateSync ? "colyseus-schema" : options.hostPeerId,
      peerId: options.hostPeerId
    },
    snapshotVersion: REALTIME_ARENA_SCHEMA_VERSION,
    localPlayerId: peerId
  });
  const receiver = schemaStateSync
    ? undefined
    : createMultiplayerAuthorityReceiver<RealtimeArenaSnapshotPayload>({
        runtime,
        binding: authorityBinding,
        snapshotKind: REALTIME_ARENA_SNAPSHOT_KIND,
        readSnapshot: readRealtimeArenaSnapshotPayload,
        applySnapshot(snapshot) {
          latestRealtimeSnapshot = snapshot;
        }
      });
  const nativeStateBridge = schemaStateSync
    ? backend.native().createStateBridge<RealtimeArenaSnapshotPayload>({
        binding: authorityBinding,
        authoritativePath,
        sourceEndpointId: "colyseus-schema",
        maxStateBytes: 256 * 1024,
        readState: readRealtimeArenaSnapshotPayload,
        applyState(snapshot) {
          latestRealtimeSnapshot = snapshot;
        }
      })
    : undefined;
  const unsubscribeNativeState =
    nativeStateBridge === undefined
      ? undefined
      : backend.native().subscribeState((update) => {
          nativeStateBridge.receiveState(update);
        });
  const unsubscribe = runtime.subscribe((message) => {
    if (message.kind === REALTIME_ARENA_SNAPSHOT_KIND) {
      return;
    }

    messages.push(message);
    if (messages.length > 48) {
      messages.shift();
    }
  });

  return {
    runtime,
    peerId,
    authoritativePath,
    messages,
    latestRealtimeSnapshot() {
      return latestRealtimeSnapshot;
    },
    nativeStateDiagnostics() {
      return nativeStateBridge?.diagnostics();
    },
    async connect() {
      const session = await runtime.joinSession({
        sessionId: options.sessionId,
        localPeer: {
          id: peerId,
          displayName: options.displayName ?? "Demo Client",
          role: "client"
        }
      });
      authorityBinding.bind({
        sessionId: session.id,
        mode: "host-authoritative",
        authorityPeerId: options.hostPeerId,
        authorityEndpoint: {
          kind: schemaStateSync ? "server" : "peer",
          id: schemaStateSync ? "colyseus-schema" : options.hostPeerId,
          peerId: options.hostPeerId
        },
        snapshotVersion: REALTIME_ARENA_SCHEMA_VERSION,
        localPlayerId: peerId
      });
    },
    async sendCommand(command) {
      await runtime.send({
        channel: MULTIPLAYER_DEMO_RELIABLE_CHANNEL,
        kind: MULTIPLAYER_DEMO_COMMAND_KIND,
        targetPeerIds: [options.hostPeerId],
        correlationId: `${peerId}.${Date.now()}`,
        payload: createMultiplayerDemoCommandPayload(command)
      });
    },
    async sendRealtimeAction(action) {
      await runtime.send({
        channel: REALTIME_ARENA_CHANNEL,
        kind: REALTIME_ARENA_ACTION_KIND,
        targetPeerIds: [options.hostPeerId],
        correlationId: `${peerId}.action.${Date.now()}`,
        payload: action
      });
    },
    async sendRealtimeInput(frame) {
      await runtime.send({
        channel: REALTIME_ARENA_CHANNEL,
        kind: REALTIME_ARENA_INPUT_KIND,
        targetPeerIds: [options.hostPeerId],
        sequence: frame.sequence,
        payload: { frame }
      });
    },
    async dispose() {
      receiver?.dispose();
      unsubscribeNativeState?.();
      unsubscribe();
      await runtime.dispose();
    }
  };
}

function createClientMessageIdGenerator(peerId: string): () => string {
  let nextId = 0;
  return () => `multiplayer-demo.${peerId}.message.${++nextId}`;
}

function createBrowserPeerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `browser-${crypto.randomUUID().slice(0, 8)}`;
  }

  const timestamp = Date.now().toString(36);
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `browser-${timestamp}-${random}`;
}
