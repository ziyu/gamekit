import { createGameKitColyseusServer } from "@gamekit/multiplayer-colyseus/server";
import { createColyseusMultiplayerBackend } from "@gamekit/multiplayer-colyseus";
import {
  createMultiplayerRuntime,
  type MultiplayerMessageEnvelope,
  type MultiplayerRuntime
} from "@gamekit/multiplayer-core";
import { createMultiplayerDemoRuntime, type MultiplayerDemoRuntime } from "../domain";

export const MULTIPLAYER_DEMO_ROOM_NAME = "gamekit_multiplayer_demo";
export const MULTIPLAYER_DEMO_SESSION_ID = "multiplayer-demo-session";
export const MULTIPLAYER_DEMO_HOST_PEER_ID = "demo-host";

export type LocalMultiplayerDemoHostOptions = {
  endpoint: string;
  roomName: string;
  sessionId?: string;
  hostPeerId?: string;
};

export type LocalMultiplayerDemoServerOptions = {
  roomName?: string;
  sessionId?: string;
  hostPeerId?: string;
  port?: number;
};

export type LocalMultiplayerDemoHost = {
  endpoint: string;
  roomName: string;
  sessionId: string;
  hostPeerId: string;
  app: MultiplayerDemoRuntime;
  host: MultiplayerRuntime;
  hostMessages: MultiplayerMessageEnvelope[];
  tick(delta?: number): void;
  disposeHost(): Promise<void>;
  dispose(): Promise<void>;
};

export type LocalMultiplayerDemoServer = LocalMultiplayerDemoHost;

export async function createLocalMultiplayerDemoServer(
  options: LocalMultiplayerDemoServerOptions = {}
): Promise<LocalMultiplayerDemoServer> {
  const roomName = options.roomName ?? MULTIPLAYER_DEMO_ROOM_NAME;
  const sessionId = options.sessionId ?? MULTIPLAYER_DEMO_SESSION_ID;
  const hostPeerId = options.hostPeerId ?? MULTIPLAYER_DEMO_HOST_PEER_ID;
  const colyseus = await createGameKitColyseusServer({
    roomName,
    ...(options.port === undefined ? {} : { port: options.port }),
    roomOptions: {
      maxClients: 12,
      authority: "host-authoritative"
    }
  });

  const host = await createLocalMultiplayerDemoHost({
    endpoint: colyseus.endpoint,
    roomName,
    sessionId,
    hostPeerId
  });
  let disposed = false;

  return {
    ...host,
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      await host.dispose();
      await colyseus.dispose();
    }
  };
}

export async function createLocalMultiplayerDemoHost(
  options: LocalMultiplayerDemoHostOptions
): Promise<LocalMultiplayerDemoHost> {
  const sessionId = options.sessionId ?? MULTIPLAYER_DEMO_SESSION_ID;
  const hostPeerId = options.hostPeerId ?? MULTIPLAYER_DEMO_HOST_PEER_ID;
  const host = createMultiplayerRuntime({
    id: `multiplayer-demo.host.${sessionId}`,
    backend: createColyseusMultiplayerBackend({
      endpoint: options.endpoint,
      roomName: options.roomName,
      joinByIdFallback: true
    }),
    connectContext: {
      localPeer: {
        id: hostPeerId,
        displayName: "Demo Host",
        role: "host"
      }
    },
    idGenerator: createHostMessageIdGenerator()
  });
  const hostMessages: MultiplayerMessageEnvelope[] = [];
  const unsubscribeHostMessages = host.subscribe((message) => {
    hostMessages.push(message);
    if (hostMessages.length > 64) {
      hostMessages.shift();
    }
  });
  const app = createMultiplayerDemoRuntime({ multiplayer: host });

  await host.createSession({
    id: sessionId,
    kind: "private",
    authority: "host-authoritative",
    localPeer: {
      id: hostPeerId,
      displayName: "Demo Host",
      role: "host"
    }
  });
  app.runtime.start();

  let hostDisposed = false;
  let disposed = false;

  async function disposeHost(): Promise<void> {
    if (hostDisposed) {
      return;
    }

    hostDisposed = true;
    app.runtime.dispose();
    unsubscribeHostMessages();
    await host.dispose();
  }

  return {
    endpoint: options.endpoint,
    roomName: options.roomName,
    sessionId,
    hostPeerId,
    app,
    host,
    hostMessages,
    tick(delta = 16) {
      app.runtime.tick(delta);
    },
    disposeHost,
    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      await disposeHost();
    }
  };
}

function createHostMessageIdGenerator(): () => string {
  let nextId = 0;
  return () => `multiplayer-demo.host.message.${++nextId}`;
}
