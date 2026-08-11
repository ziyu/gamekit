import {
  createMultiplayerNetworkConditionSimulator,
  createMultiplayerRuntime,
  type MultiplayerMessageEnvelope
} from "@gamekit/multiplayer-core";
import { describe, expect, it } from "vitest";
import { createMemoryMultiplayerBackend } from "../src";

describe("multiplayer network-condition simulator", () => {
  it("delays, drops, duplicates and flushes selected messages deterministically", async () => {
    const simulator = createMultiplayerNetworkConditionSimulator(
      createMemoryMultiplayerBackend({ id: "network-simulator.memory" }),
      {
        latencyMs: 50,
        jitterMs: 10,
        lossPercent: 20,
        duplicatePercent: 25,
        seed: 42,
        maxPendingDeliveries: 64,
        affects: (direction, message) => direction === "outgoing" && message.kind === "game.input"
      }
    );
    const host = createMultiplayerRuntime({
      id: "network-simulator.host",
      backend: simulator.backend
    });
    const client = createMultiplayerRuntime({
      id: "network-simulator.client",
      backend: simulator.backend
    });
    const received: MultiplayerMessageEnvelope[] = [];
    host.subscribe((message) => {
      if (message.kind === "game.input") received.push(message);
    });
    await host.createSession({ id: "network-simulator", localPeer: { id: "host" } });
    await client.joinSession({ sessionId: "network-simulator", localPeer: { id: "client" } });

    for (let sequence = 1; sequence <= 20; sequence += 1) {
      await client.send({
        channel: "reliable",
        kind: "game.input",
        payload: { sequence }
      });
    }
    expect(received).toHaveLength(0);
    expect(simulator.diagnostics().pendingDeliveries).toBeGreaterThan(0);
    await simulator.advance(100);
    await simulator.flush();

    const diagnostics = simulator.diagnostics();
    expect(diagnostics.pendingDeliveries).toBe(0);
    expect(diagnostics.droppedMessages).toBeGreaterThan(0);
    expect(diagnostics.duplicatedMessages).toBeGreaterThan(0);
    expect(diagnostics.capacityDrops).toBe(0);
    expect(diagnostics.deliveryErrors).toBe(0);
    expect(diagnostics.activeConnections).toBe(2);
    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThan(30);

    await host.dispose();
    await client.dispose();
    expect(simulator.diagnostics().activeConnections).toBe(0);
    simulator.dispose();
    expect(simulator.diagnostics()).toMatchObject({ disposed: true, pendingDeliveries: 0 });
  });
});
