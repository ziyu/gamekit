import {
  createMultiplayerRuntime,
  runMultiplayerBackendConformance
} from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";
import { createMemoryMultiplayerBackend } from "../src";

describe("createMemoryMultiplayerBackend", () => {
  it("passes the multiplayer backend conformance runner", async () => {
    const report = await runMultiplayerBackendConformance({
      createBackend: () => createMemoryMultiplayerBackend(),
      clock: () => 100
    });

    expect(report).toMatchObject({
      sessionId: "conformance.session",
      hostPeerId: "host",
      clientPeerId: "client"
    });
    expect(report.receivedByClient.some((message) => message.sourcePeerId === "host")).toBe(true);
    expect(report.receivedByHost.some((message) => message.sourcePeerId === "client")).toBe(true);
  });

  it("rejects duplicate sessions clearly", async () => {
    const backend = createMemoryMultiplayerBackend();
    const first = createMultiplayerRuntime({ id: "first", backend });
    const second = createMultiplayerRuntime({ id: "second", backend });

    await first.createSession({
      id: "shared",
      localPeer: { id: "host-1" }
    });

    await expect(
      second.createSession({
        id: "shared",
        localPeer: { id: "host-2" }
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [GameError: Duplicate multiplayer session: shared]
    `);

    await first.dispose();
    await second.dispose();
  });

  it("delivers targeted messages only to selected peers", async () => {
    const backend = createMemoryMultiplayerBackend();
    const host = createMultiplayerRuntime({ id: "host", backend });
    const clientA = createMultiplayerRuntime({ id: "client-a", backend });
    const clientB = createMultiplayerRuntime({ id: "client-b", backend });
    const receivedByA: string[] = [];
    const receivedByB: string[] = [];

    clientA.subscribe((message) => {
      if (message.kind === "game.command") {
        receivedByA.push(message.id);
      }
    });
    clientB.subscribe((message) => {
      if (message.kind === "game.command") {
        receivedByB.push(message.id);
      }
    });

    await host.createSession({
      id: "room",
      localPeer: { id: "host" }
    });
    await clientA.joinSession({
      sessionId: "room",
      localPeer: { id: "client-a" }
    });
    await clientB.joinSession({
      sessionId: "room",
      localPeer: { id: "client-b" }
    });
    await host.send({
      id: "targeted",
      channel: "reliable",
      kind: "game.command",
      targetPeerIds: ["client-a"],
      payload: { action: "wave" }
    });

    expect(receivedByA).toEqual(["targeted"]);
    expect(receivedByB).toEqual([]);

    await host.dispose();
    await clientA.dispose();
    await clientB.dispose();
  });
});
