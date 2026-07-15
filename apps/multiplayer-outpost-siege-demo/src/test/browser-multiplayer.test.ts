import { createMultiplayerRuntime, type MultiplayerRuntime } from "@gamekit/multiplayer-core";
import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import { createMemoryPhysicsBackend } from "@gamekit/physics-core";
import { createMemoryRenderer } from "@gamekit/test-utils";
import { createKootaWorld } from "@gamekit/world-koota";
import { describe, expect, it } from "vitest";

import { createOutpostDataRegistry } from "../content";
import { createOutpostClientShadowRuntime, type OutpostClientAuthoritySnapshot } from "../gameplay";
import {
  loadOutpostBrowserServerConfig,
  normalizeOutpostDisplayName,
  normalizeOutpostSessionId
} from "../realtime";

describe("Outpost Browser multiplayer", () => {
  it("applies bounded authority snapshots to a disposable client World shadow", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-shadow.test" });
    const server = createMultiplayerRuntime({ id: "server", backend });
    const multiplayer = createMultiplayerRuntime({ id: "client", backend });
    const attacker = createMultiplayerRuntime({ id: "attacker", backend });
    await server.createSession({
      id: "session-1",
      authority: "server-authoritative",
      localPeer: { id: "session.server", role: "server" }
    });
    await multiplayer.joinSession({
      sessionId: "session-1",
      localPeer: { id: "ranger-1", role: "client", playerId: "player.ranger-1" }
    });
    await attacker.joinSession({
      sessionId: "session-1",
      localPeer: { id: "other.server", role: "client" }
    });
    const world = createKootaWorld();
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1"
    });
    await client.runtime.start();

    await sendSnapshot(server, authoritySnapshot(1, 4));
    client.runtime.tick(16);
    expect(world.count()).toBe(4);
    expect(client.identity.snapshot()).toHaveLength(4);
    expect(client.snapshot()).toMatchObject({
      authorityPeerId: "session.server",
      receivedSnapshots: 1,
      rejectedSnapshots: 0,
      lastAppliedTick: 1,
      entityCount: 4
    });

    await sendSnapshot(server, authoritySnapshot(1, 4));
    client.runtime.tick(16);
    await sendSnapshot(attacker, authoritySnapshot(2, 4));
    await sendSnapshot(server, authoritySnapshot(3, 3));
    client.runtime.tick(16);
    expect(world.count()).toBe(3);
    expect(client.identity.snapshot()).toHaveLength(3);
    expect(client.snapshot().rejectedSnapshots).toBe(2);

    await client.runtime.dispose();
    await attacker.dispose();
    await multiplayer.dispose();
    await server.dispose();
    expect(world.count()).toBe(0);
    expect(client.identity.snapshot()).toHaveLength(0);
  });

  it("automatically samples, predicts, sends, and reconciles local input", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-prediction.test" });
    const server = createMultiplayerRuntime({ id: "server", backend });
    const multiplayer = createMultiplayerRuntime({ id: "client", backend });
    await server.createSession({
      id: "session-1",
      authority: "server-authoritative",
      localPeer: { id: "session.server", role: "server" }
    });
    await multiplayer.joinSession({
      sessionId: "session-1",
      localPeer: { id: "ranger-1", role: "client", playerId: "player.ranger-1" }
    });
    const receivedInputs: unknown[] = [];
    const unsubscribe = server.subscribe((message) => {
      if (message.kind === "game.input") {
        receivedInputs.push(message.payload);
      }
    });
    const world = createKootaWorld();
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1"
    });
    client.input.moveX = 1;
    client.input.aimX = 900;
    client.input.aimY = 500;
    await client.runtime.start();
    await sendSnapshot(server, {
      ...authoritySnapshot(1, 1),
      inputAcksByPeerId: { "ranger-1": 0 }
    });

    client.runtime.tick(0);
    client.runtime.tick(25);
    client.runtime.tick(25);
    await waitFor(() => receivedInputs.length === 2);
    expect(receivedInputs).toEqual([
      { sequence: 1, moveX: 1, moveY: 0, aimX: 900, aimY: 500 },
      { sequence: 2, moveX: 1, moveY: 0, aimX: 900, aimY: 500 }
    ]);

    await sendSnapshot(server, {
      ...authoritySnapshot(2, 1),
      inputAcksByPeerId: { "ranger-1": 1 }
    });
    client.runtime.tick(16);
    expect(client.snapshot().replication?.prediction).toMatchObject({
      lastAcknowledgedSequence: 1,
      pendingInputs: 1
    });

    unsubscribe();
    await client.runtime.dispose();
    await multiplayer.dispose();
    await server.dispose();
  });

  it("presents local predicted facing continuously across the angle wrap boundary", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-facing.test" });
    const server = createMultiplayerRuntime({ id: "server", backend });
    const multiplayer = createMultiplayerRuntime({ id: "client", backend });
    await server.createSession({
      id: "session-1",
      authority: "server-authoritative",
      localPeer: { id: "session.server", role: "server" }
    });
    await multiplayer.joinSession({
      sessionId: "session-1",
      localPeer: { id: "ranger-1", role: "client", playerId: "player.ranger-1" }
    });
    const rotations: number[] = [];
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world: createKootaWorld(),
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1",
      renderer: createMemoryRenderer("outpost.client-facing.renderer"),
      applyRenderTargetState(_native, state) {
        const rotation = state.transform?.rotation?.z;
        if (rotation !== undefined) {
          rotations.push(rotation);
        }
      }
    });
    const degrees = (value: number) => (value * Math.PI) / 180;
    const snapshot = authoritySnapshot(1, 1);
    snapshot.players[0]!.facing = degrees(170);
    client.input.aimX = snapshot.players[0]!.x + Math.cos(degrees(-170)) * 100;
    client.input.aimY = snapshot.players[0]!.y + Math.sin(degrees(-170)) * 100;
    await client.runtime.start();
    await sendSnapshot(server, snapshot);

    client.runtime.tick(0);
    expect(rotations.at(-1)).toBeCloseTo(degrees(170), 2);
    client.runtime.tick(25);
    expect(rotations.at(-1)).toBeCloseTo(Math.PI, 2);

    await client.runtime.dispose();
    await multiplayer.dispose();
    await server.dispose();
  });

  it("keeps local movement continuous when 20 Hz authority snapshots acknowledge input", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-movement.test" });
    const server = createMultiplayerRuntime({ id: "server", backend });
    const multiplayer = createMultiplayerRuntime({ id: "client", backend });
    await server.createSession({
      id: "session-1",
      authority: "server-authoritative",
      localPeer: { id: "session.server", role: "server" }
    });
    await multiplayer.joinSession({
      sessionId: "session-1",
      localPeer: { id: "ranger-1", role: "client", playerId: "player.ranger-1" }
    });
    const positions: number[] = [];
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world: createKootaWorld(),
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1",
      renderer: createMemoryRenderer("outpost.client-movement.renderer"),
      applyRenderTargetState(_native, state) {
        const x = state.transform?.position?.x;
        if (x !== undefined) {
          positions.push(x);
        }
      }
    });
    client.input.moveX = 1;
    client.input.aimX = 1_400;
    client.input.aimY = 500;
    await client.runtime.start();
    await sendSnapshot(server, authoritySnapshot(0, 1));
    client.runtime.tick(0);

    for (let frame = 1; frame <= 18; frame += 1) {
      if (frame % 3 === 0) {
        const authorityTick = frame / 3;
        const snapshot = authoritySnapshot(authorityTick, 1);
        snapshot.players[0]!.x += authorityTick * 11;
        snapshot.inputAcksByPeerId["ranger-1"] = authorityTick;
        await sendSnapshot(server, snapshot);
      }
      client.runtime.tick(1000 / 60);
    }

    const deltas = positions.slice(1).map((position, index) => position - positions[index]!);
    expect(positions).toHaveLength(19);
    expect(Math.min(...deltas)).toBeGreaterThan(3.65);
    expect(Math.max(...deltas)).toBeLessThan(3.68);
    expect(client.snapshot().replication?.prediction).toMatchObject({
      corrections: 0,
      lastAcknowledgedSequence: 6
    });

    await client.runtime.dispose();
    await multiplayer.dispose();
    await server.dispose();
  });

  it("validates server config, squad codes, and display names at the Browser boundary", async () => {
    const config = await loadOutpostBrowserServerConfig(
      async () =>
        new Response(JSON.stringify({ endpoint: "http://127.0.0.1:2567", roomName: "outpost" }))
    );
    expect(config).toEqual({ endpoint: "http://127.0.0.1:2567", roomName: "outpost" });
    expect(normalizeOutpostSessionId(" OS / Alpha 07 ")).toBe("os-alpha-07");
    expect(normalizeOutpostDisplayName("  Ranger   Two  ")).toBe("Ranger Two");
    expect(() => normalizeOutpostSessionId("x")).toThrow(/4–32/);
  });
});

function authoritySnapshot(tick: number, playerCount: number): OutpostClientAuthoritySnapshot {
  return {
    phase: "running",
    tick,
    countdownMsRemaining: 0,
    participants: Array.from({ length: playerCount }, (_, slot) => ({
      peerId: `ranger-${slot + 1}`,
      playerId: `player.ranger-${slot + 1}`,
      displayName: `RANGER ${slot + 1}`,
      status: "active" as const,
      ready: true,
      slot
    })),
    players: Array.from({ length: playerCount }, (_, slot) => ({
      networkEntityId: `player.ranger-${slot + 1}`,
      generation: 0,
      archetypeId: "player.outpost.ranger",
      playerId: `player.ranger-${slot + 1}`,
      slot,
      x: 800 + slot * 40,
      y: 500,
      velocityX: slot,
      velocityY: 0,
      facing: 0
    })),
    inputAcksByPeerId: Object.fromEntries(
      Array.from({ length: playerCount }, (_, slot) => [`ranger-${slot + 1}`, tick])
    )
  };
}

async function sendSnapshot(
  runtime: MultiplayerRuntime,
  snapshot: OutpostClientAuthoritySnapshot
): Promise<void> {
  await runtime.send({
    channel: "reliable",
    kind: "game.snapshot",
    tick: snapshot.tick,
    payload: snapshot
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 500) {
      throw new Error("Timed out waiting for Outpost multiplayer condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
