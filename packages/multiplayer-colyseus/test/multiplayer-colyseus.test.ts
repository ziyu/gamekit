import {
  runMultiplayerBackendConformance,
  type MultiplayerMessageEnvelope
} from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";

import { createColyseusMultiplayerBackend } from "../src";
import { createGameKitColyseusServer } from "../src/server";

describe("@gamekit/multiplayer-colyseus", () => {
  it("passes the multiplayer backend conformance against a local Colyseus room", async () => {
    const roomName = uniqueRoomName("conformance");
    const server = await createGameKitColyseusServer({ roomName });

    try {
      const report = await runMultiplayerBackendConformance({
        createBackend: () =>
          createColyseusMultiplayerBackend({
            endpoint: server.endpoint,
            roomName
          }),
        clock: () => 1000
      });

      expect(report.sessionId).toBe("conformance.session");
      expect(report.receivedByClient.some((message) => message.sourcePeerId === "host")).toBe(true);
      expect(report.receivedByHost.some((message) => message.sourcePeerId === "client")).toBe(true);
    } finally {
      await server.dispose();
    }
  });

  it("rejects oversized outgoing envelopes before they reach the room", async () => {
    const roomName = uniqueRoomName("payload");
    const server = await createGameKitColyseusServer({
      roomName,
      roomOptions: { maxPayloadBytes: 64 }
    });
    const backend = createColyseusMultiplayerBackend({
      endpoint: server.endpoint,
      roomName,
      maxPayloadBytes: 64
    });
    const connection = await backend.connect({
      runtimeId: "payload.host",
      localPeer: { id: "host", role: "host" },
      clock: () => 1000
    });

    try {
      const session = await connection.createSession({
        id: "payload.session",
        localPeer: { id: "host", role: "host" }
      });

      await expect(
        connection.send({
          id: "payload.too-large",
          sessionId: session.id,
          channel: "reliable",
          kind: "game.command",
          sourcePeerId: "host",
          timestamp: 1000,
          payload: { text: "x".repeat(256) }
        })
      ).rejects.toMatchObject({ code: "MULTIPLAYER_INVALID_MESSAGE" });
    } finally {
      await connection.close("test cleanup");
      await server.dispose();
    }
  });

  it("joins the requested GameKit session across independent backend instances", async () => {
    const roomName = uniqueRoomName("session-map");
    const server = await createGameKitColyseusServer({ roomName });
    const hostA = await createColyseusMultiplayerBackend({
      endpoint: server.endpoint,
      roomName,
      joinByIdFallback: true
    }).connect({
      runtimeId: "session-map.host-a",
      localPeer: { id: "host-a", role: "host" },
      clock: () => 1000
    });
    const hostB = await createColyseusMultiplayerBackend({
      endpoint: server.endpoint,
      roomName,
      joinByIdFallback: true
    }).connect({
      runtimeId: "session-map.host-b",
      localPeer: { id: "host-b", role: "host" },
      clock: () => 1000
    });
    const clientB = await createColyseusMultiplayerBackend({
      endpoint: server.endpoint,
      roomName,
      joinByIdFallback: true
    }).connect({
      runtimeId: "session-map.client-b",
      localPeer: { id: "client-b", role: "client" },
      clock: () => 1000
    });
    const hostAMessages: MultiplayerMessageEnvelope[] = [];
    const hostBMessages: MultiplayerMessageEnvelope[] = [];
    const unsubscribeHostA = hostA.subscribe((message) => hostAMessages.push(message));
    const unsubscribeHostB = hostB.subscribe((message) => hostBMessages.push(message));

    try {
      await hostA.createSession({
        id: "session-map-alpha",
        localPeer: { id: "host-a", role: "host" }
      });
      await hostB.createSession({
        id: "session-map-bravo",
        localPeer: { id: "host-b", role: "host" }
      });
      await clientB.joinSession({
        sessionId: "session-map-bravo",
        localPeer: { id: "client-b", role: "client" }
      });
      await waitFor(() =>
        hostB.snapshot().peers.some((peer) => peer.id === "client-b" && peer.status === "connected")
      );

      expect(hostA.snapshot().peers.map((peer) => peer.id)).toEqual(["host-a"]);
      expect(
        hostB
          .snapshot()
          .peers.map((peer) => peer.id)
          .sort()
      ).toEqual(["client-b", "host-b"]);

      await clientB.send({
        id: "session-map.client-b.1",
        sessionId: "session-map-bravo",
        channel: "reliable",
        kind: "session-map.command",
        sourcePeerId: "client-b",
        targetPeerIds: ["host-b"],
        timestamp: 1000,
        payload: { ok: true }
      });
      await waitFor(() => hostBMessages.some((message) => message.kind === "session-map.command"));

      expect(hostAMessages.some((message) => message.kind === "session-map.command")).toBe(false);
    } finally {
      unsubscribeHostA();
      unsubscribeHostB();
      await clientB.close("test cleanup");
      await hostB.close("test cleanup");
      await hostA.close("test cleanup");
      await server.dispose();
    }
  });

  it("redacts endpoint credentials from backend diagnostics", () => {
    const backend = createColyseusMultiplayerBackend({
      endpoint: "http://user:secret@127.0.0.1:2567",
      roomName: "diagnostics"
    });

    expect(backend.snapshot().metadata?.endpoint).toBe("http://127.0.0.1:2567/");
  });
});

function uniqueRoomName(scope: string): string {
  return `gamekit_${scope}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for Colyseus multiplayer condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
