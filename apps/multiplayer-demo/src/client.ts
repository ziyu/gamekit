import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
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
};

export type MultiplayerDemoClient = {
  runtime: MultiplayerRuntime;
  peerId: string;
  messages: MultiplayerMessageEnvelope[];
  latestRealtimeSnapshot(): RealtimeArenaSnapshotPayload | undefined;
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
  const messages: MultiplayerMessageEnvelope[] = [];
  let latestRealtimeSnapshot: RealtimeArenaSnapshotPayload | undefined;
  const runtime = createMultiplayerRuntime({
    id: `multiplayer-demo.client.${peerId}`,
    backend: createColyseusMultiplayerBackend({
      endpoint: options.endpoint,
      roomName: options.roomName,
      joinByIdFallback: options.joinByIdFallback ?? false
    }),
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
      kind: "peer",
      id: options.hostPeerId,
      peerId: options.hostPeerId
    },
    localPlayerId: peerId
  });
  const receiver = createMultiplayerAuthorityReceiver<RealtimeArenaSnapshotPayload>({
    runtime,
    binding: authorityBinding,
    snapshotKind: REALTIME_ARENA_SNAPSHOT_KIND,
    readSnapshot: readRealtimeArenaSnapshotPayload,
    applySnapshot(snapshot) {
      latestRealtimeSnapshot = snapshot;
    }
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
    messages,
    latestRealtimeSnapshot() {
      return latestRealtimeSnapshot;
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
          kind: "peer",
          id: options.hostPeerId,
          peerId: options.hostPeerId
        },
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
      receiver.dispose();
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
