import { createMultiplayerError, multiplayerErrorCodes } from "./errors";
import { createMultiplayerRuntime } from "./runtime";
import type { MultiplayerBackendAdapter, MultiplayerMessageEnvelope } from "./types";

export type MultiplayerBackendConformanceOptions = {
  createBackend(): MultiplayerBackendAdapter;
  clock?: () => number;
  messageTimeoutMs?: number;
};

export type MultiplayerBackendConformanceReport = {
  sessionId: string;
  hostPeerId: string;
  clientPeerId: string;
  receivedByHost: MultiplayerMessageEnvelope[];
  receivedByClient: MultiplayerMessageEnvelope[];
};

export async function runMultiplayerBackendConformance(
  options: MultiplayerBackendConformanceOptions
): Promise<MultiplayerBackendConformanceReport> {
  const backend = options.createBackend();
  const receivedByHost: MultiplayerMessageEnvelope[] = [];
  const receivedByClient: MultiplayerMessageEnvelope[] = [];
  const host = createMultiplayerRuntime({
    id: "conformance.host",
    backend,
    clock: options.clock ?? (() => 1000),
    idGenerator: createConformanceIdGenerator("host")
  });
  const client = createMultiplayerRuntime({
    id: "conformance.client",
    backend,
    clock: options.clock ?? (() => 1000),
    idGenerator: createConformanceIdGenerator("client")
  });

  host.subscribe((message) => receivedByHost.push(message));
  client.subscribe((message) => receivedByClient.push(message));

  try {
    const session = await host.createSession({
      id: "conformance.session",
      localPeer: { id: "host", role: "host" }
    });
    await client.joinSession({
      sessionId: session.id,
      localPeer: { id: "client", role: "client" }
    });

    await host.send({
      channel: "reliable",
      kind: "game.command",
      payload: { action: "ping" }
    });

    await client.send({
      channel: "reliable",
      kind: "game.command",
      targetPeerIds: ["host"],
      payload: { action: "pong" }
    });

    await waitForConformanceMessages(
      () =>
        receivedByHost.some(
          (message) => message.kind === "game.command" && message.sourcePeerId === "client"
        ) &&
        receivedByClient.some(
          (message) => message.kind === "game.command" && message.sourcePeerId === "host"
        ),
      options.messageTimeoutMs ?? 500
    );
  } catch (error) {
    await host.dispose();
    await client.dispose();
    throw error;
  }

  const hostCommand = receivedByHost.find(
    (message) => message.kind === "game.command" && message.sourcePeerId === "client"
  );
  const clientCommand = receivedByClient.find(
    (message) => message.kind === "game.command" && message.sourcePeerId === "host"
  );
  assertConformance(Boolean(hostCommand), "Backend did not deliver targeted client command.");
  assertConformance(Boolean(clientCommand), "Backend did not deliver broadcast host command.");

  await client.leaveSession("conformance complete");
  const leftSession = client.session();
  assertConformance(!leftSession, "Backend kept client in session after leave.");

  await host.dispose();
  await client.dispose();
  assertConformance(
    host.snapshot().phase === "disposed" && client.snapshot().phase === "disposed",
    "Backend runtimes did not dispose cleanly."
  );

  return {
    sessionId: "conformance.session",
    hostPeerId: "host",
    clientPeerId: "client",
    receivedByHost,
    receivedByClient
  };
}

function assertConformance(condition: boolean, message: string): void {
  if (!condition) {
    throw createMultiplayerError(multiplayerErrorCodes.invalidMessage, message);
  }
}

async function waitForConformanceMessages(
  predicate: () => boolean,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createConformanceIdGenerator(peerId: string): () => string {
  let id = 0;

  return () => `conformance.${peerId}.${++id}`;
}
