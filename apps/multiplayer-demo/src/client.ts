import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import {
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
  messages: MultiplayerMessageEnvelope[];
  connect(): Promise<void>;
  sendCommand(command: MultiplayerDemoCommand): Promise<void>;
  dispose(): Promise<void>;
};

export function createMultiplayerDemoClient(
  options: MultiplayerDemoClientOptions
): MultiplayerDemoClient {
  const peerId = options.peerId ?? createBrowserPeerId();
  const messages: MultiplayerMessageEnvelope[] = [];
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
  const unsubscribe = runtime.subscribe((message) => {
    messages.push(message);
    if (messages.length > 48) {
      messages.shift();
    }
  });

  return {
    runtime,
    messages,
    async connect() {
      await runtime.joinSession({
        sessionId: options.sessionId,
        localPeer: {
          id: peerId,
          displayName: options.displayName ?? "Demo Client",
          role: "client"
        }
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
    async dispose() {
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
  const random = Math.floor(Math.random() * 100000).toString(36);
  return `browser-${random}`;
}
