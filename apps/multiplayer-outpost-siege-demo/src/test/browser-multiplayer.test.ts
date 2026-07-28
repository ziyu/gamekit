import { createMemoryAnimationPlaybackAdapter } from "@gamekit/animator-core/testing";
import { createGameAudio } from "@gamekit/audio-core";
import { createMemoryAudioBackend } from "@gamekit/audio-core/testing";
import { createCameraController } from "@gamekit/camera-core";
import { createMultiplayerRuntime, type MultiplayerRuntime } from "@gamekit/multiplayer-core";
import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import { createMemoryPhysicsBackend } from "@gamekit/physics-core";
import { createMemoryRenderer } from "@gamekit/test-utils";
import { createKootaWorld } from "@gamekit/world-koota";
import { describe, expect, it } from "vitest";

import { createOutpostDataRegistry } from "../content";
import { createOutpostClientShadowRuntime, type OutpostClientAuthoritySnapshot } from "../gameplay";
import { OUTPOST_AUDIO_CONFIG } from "../presentation";
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

  it("materializes and presents replicated enemies, projectiles, and status feedback", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-combat.test" });
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
    const world = createKootaWorld();
    const renderer = createMemoryRenderer("outpost.client-combat.renderer");
    const animationAdapter = createMemoryAnimationPlaybackAdapter();
    const audioBackend = createMemoryAudioBackend({ unlocked: true });
    const audio = createGameAudio({ ...OUTPOST_AUDIO_CONFIG, backend: audioBackend });
    const targetStates = new Map<string, Record<string, unknown>>();
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1",
      renderer,
      animationAdapter,
      audio,
      applyRenderTargetState(native, state) {
        const object = native as { id: string };
        targetStates.set(object.id, state.props ?? {});
      }
    });
    await client.runtime.start();
    const snapshot = authoritySnapshot(1, 1);
    snapshot.combat.actors = [combatActor("enemy.opening.1", "enemy", "render.outpost.raider")];
    snapshot.combat.actors[0] = {
      ...snapshot.combat.actors[0]!,
      targetActorId: "player.ranger-1",
      aiGoalId: "ai.outpost.goal.assault",
      aiTaskPhase: "telegraph",
      abilityExecutionId: "enemy.opening.1:attack:1",
      abilityId: "ability.outpost.enemy_attack",
      abilityPhase: "preparing",
      abilityPhaseStartedAt: 0,
      abilityPhaseEndsAt: 400
    };
    snapshot.combat.projectiles = [combatProjectile("projectile.1")];
    await sendSnapshot(server, snapshot);
    client.runtime.tick(16);

    expect(world.count()).toBe(3);
    expect(client.identity.snapshot()).toHaveLength(3);
    expect(renderer.objects().map((object) => object.id)).toEqual(
      expect.arrayContaining([
        "outpost.client.player.0.0",
        "outpost.client.enemy.enemy.opening.1.0",
        "outpost.client.projectile.projectile.1.0"
      ])
    );
    expect(client.animator.listControllers()).toHaveLength(2);
    const enemyAnimatorControllerId = "outpost.animator.outpost.client.enemy.enemy.opening.1.0";
    expect(client.animator.traces().map((trace) => trace.label)).toContain("animator.phase_synced");
    expect({
      runtime: client.animator.snapshot(),
      controller: client.animator.getController(enemyAnimatorControllerId),
      traces: client.animator.traces(),
      frame: animationAdapter.frame(enemyAnimatorControllerId)?.layers[0]
    }).toMatchObject({
      runtime: { activeGameplayPhases: 1 },
      frame: { kind: "gameplay-phase", clipId: "animation.outpost.raider.attack" }
    });
    expect(targetStates.get("outpost.client.enemy.enemy.opening.1.0")).toMatchObject({
      tint: 0xffa94d
    });
    expect(audio.sfx.snapshot().active).toBe(1);
    const playbackStarts = audioBackend.commands().filter((command) => command.type === "start");
    expect(playbackStarts).toHaveLength(2);
    client.runtime.tick(450);
    expect(audioBackend.commands().filter((command) => command.type === "start")).toHaveLength(2);

    snapshot.tick = 2;
    snapshot.elapsedMs = 100;
    snapshot.combat.actors[0]!.tags = ["status.shocked", "team.enemies"];
    snapshot.combat.projectiles = [];
    await sendSnapshot(server, snapshot);
    client.runtime.tick(16);

    expect(world.count()).toBe(2);
    expect(client.identity.snapshot()).toHaveLength(2);
    expect(targetStates.get("outpost.client.enemy.enemy.opening.1.0")).toMatchObject({
      tint: 0x63fff2
    });

    await client.runtime.dispose();
    audio.dispose();
    await multiplayer.dispose();
    await server.dispose();
    expect(world.count()).toBe(0);
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
      {
        sequence: 1,
        moveX: 1,
        moveY: 0,
        aimX: 900,
        aimY: 500,
        fireHeld: false,
        fireSequence: 0
      },
      {
        sequence: 2,
        moveX: 1,
        moveY: 0,
        aimX: 900,
        aimY: 500,
        fireHeld: false,
        fireSequence: 0
      }
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

  it("presents each authority combat cue once and bounds transient effects", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-combat-cues.test" });
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
    const renderer = createMemoryRenderer("outpost.client-combat-cues.renderer");
    const audioBackend = createMemoryAudioBackend({ unlocked: true });
    const audio = createGameAudio({ ...OUTPOST_AUDIO_CONFIG, backend: audioBackend });
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world: createKootaWorld(),
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1",
      renderer,
      audio
    });
    await client.runtime.start();
    await sendSnapshot(server, authoritySnapshot(1, 1));
    client.runtime.tick(0);

    const cueSnapshot = authoritySnapshot(2, 1);
    cueSnapshot.combat.cueWatermark = 50;
    cueSnapshot.combat.cues = Array.from({ length: 50 }, (_, index) => ({
      sequence: index + 1,
      kind: "health-hit" as const,
      at: 16,
      sourceObjectId: "enemy.opening.1",
      targetObjectId: "player.ranger-1",
      position: { x: 800 + index, y: 500 },
      amount: 1
    }));
    await sendSnapshot(server, cueSnapshot);
    client.runtime.tick(16);

    const combatEffectIds = () =>
      renderer
        .objects()
        .map((object) => object.id)
        .filter((objectId) => objectId.startsWith("outpost.combat-cue."));
    expect(combatEffectIds()).toHaveLength(48);
    expect(combatEffectIds()).not.toContain("outpost.combat-cue.1");
    expect(combatEffectIds()).toContain("outpost.combat-cue.50");
    expect(client.combatPresentation.snapshot()).toMatchObject({
      cueWatermark: 50,
      authorityCueWatermark: 50,
      consumedCues: 50,
      droppedCues: 0
    });
    const playbackStarts = audioBackend
      .commands()
      .filter((command) => command.type === "start").length;

    cueSnapshot.tick = 3;
    await sendSnapshot(server, cueSnapshot);
    client.runtime.tick(16);
    expect(audioBackend.commands().filter((command) => command.type === "start")).toHaveLength(
      playbackStarts
    );

    client.runtime.tick(300);
    expect(combatEffectIds()).toHaveLength(0);

    await client.runtime.dispose();
    audio.dispose();
    await multiplayer.dispose();
    await server.dispose();
  });

  it("presents rifle anticipation immediately and suppresses duplicate authority feedback", async () => {
    const backend = createMemoryMultiplayerBackend({ id: "outpost.client-rifle-cues.test" });
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
    const renderer = createMemoryRenderer("outpost.client-rifle-cues.renderer");
    const audioBackend = createMemoryAudioBackend({ unlocked: true });
    const audio = createGameAudio({ ...OUTPOST_AUDIO_CONFIG, backend: audioBackend });
    const camera = createCameraController({ viewport: { width: 1280, height: 720 } });
    const targetStates = new Map<string, Record<string, unknown>>();
    const client = createOutpostClientShadowRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world: createKootaWorld(),
      multiplayer,
      physicsBackend: createMemoryPhysicsBackend(),
      localPlayerId: "player.ranger-1",
      renderer,
      audio,
      camera,
      applyRenderTargetState(native, state) {
        targetStates.set((native as { id: string }).id, state as Record<string, unknown>);
      }
    });
    const snapshot = authoritySnapshot(1, 1);
    snapshot.combat.actors = [playerCombatActor()];
    await client.runtime.start();
    await sendSnapshot(server, snapshot);
    client.runtime.tick(0);
    const playbackStartsBeforeFire = audioBackend
      .commands()
      .filter((command) => command.type === "start").length;

    client.input.fireHeld = true;
    client.input.fireSequence = 1;
    client.runtime.tick(16);

    const muzzleId = "outpost.player-presentation.player.ranger-1.muzzle";
    expect(client.playerPresentation.snapshot()).toMatchObject({
      cueWatermark: 1,
      pendingAnticipations: 1,
      anticipatedShots: 1
    });
    expect(renderer.objects().map((object) => object.id)).toContain(muzzleId);
    expect(targetStates.get(muzzleId)).toMatchObject({ visible: true });
    expect(audioBackend.commands().filter((command) => command.type === "start")).toHaveLength(
      playbackStartsBeforeFire + 1
    );

    snapshot.tick = 2;
    snapshot.elapsedMs = 16;
    snapshot.combat.actors[0] = {
      ...snapshot.combat.actors[0]!,
      weapon: {
        ...snapshot.combat.actors[0]!.weapon!,
        magazine: 23,
        shotSequence: 1,
        lastShotCorrelationId: "player.ranger-1.rifle.1"
      }
    };
    await sendSnapshot(server, snapshot);
    client.runtime.tick(16);

    expect(client.playerPresentation.snapshot()).toMatchObject({
      cueWatermark: 2,
      pendingAnticipations: 0,
      confirmedShots: 1
    });
    expect(audioBackend.commands().filter((command) => command.type === "start")).toHaveLength(
      playbackStartsBeforeFire + 1
    );

    await client.runtime.dispose();
    audio.dispose();
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
      applyRenderTargetState(native, state) {
        if ((native as { id: string }).id !== "outpost.client.player.0.0") {
          return;
        }
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
    elapsedMs: tick * 50,
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
    combat: {
      actors: [],
      projectiles: [],
      cueWatermark: 0,
      cues: [],
      acceptedCommands: 0,
      rejectedCommands: 0,
      projectileHits: 0,
      enemyAttacks: 0,
      kills: 0,
      drops: 0,
      objectiveProgress: 0
    },
    inputAcksByPeerId: Object.fromEntries(
      Array.from({ length: playerCount }, (_, slot) => [`ranger-${slot + 1}`, tick])
    )
  };
}

function combatActor(
  objectId: string,
  kind: "enemy" | "buildable",
  renderKey: string
): OutpostClientAuthoritySnapshot["combat"]["actors"][number] {
  return {
    objectId,
    networkEntityId: objectId,
    generation: 0,
    kind,
    definitionId: kind === "enemy" ? "enemy.outpost.raider" : "buildable.outpost.turret",
    renderKey,
    x: 680,
    y: 500,
    velocityX: 105,
    velocityY: 0,
    facing: 0,
    health: 45,
    shield: 0,
    stamina: 0,
    resource: 0,
    tags: [kind === "enemy" ? "team.enemies" : "team.players"],
    cooldowns: {}
  };
}

function playerCombatActor(): OutpostClientAuthoritySnapshot["combat"]["actors"][number] {
  return {
    objectId: "player.ranger-1",
    networkEntityId: "player.ranger-1",
    generation: 0,
    kind: "player",
    definitionId: "player.outpost.ranger",
    renderKey: "render.outpost.player",
    x: 800,
    y: 500,
    velocityX: 0,
    velocityY: 0,
    facing: 0,
    health: 100,
    shield: 50,
    stamina: 100,
    resource: 0,
    tags: ["team.players"],
    cooldowns: {},
    weapon: {
      weaponId: "weapon.outpost.rifle",
      magazine: 24,
      magazineSize: 24,
      reserveAmmo: 144,
      phase: "ready",
      shotSequence: 0
    }
  };
}

function combatProjectile(
  objectId: string
): OutpostClientAuthoritySnapshot["combat"]["projectiles"][number] {
  return {
    objectId,
    networkEntityId: objectId,
    generation: 0,
    renderKey: "render.outpost.projectile",
    x: 720,
    y: 500,
    velocityX: 760,
    velocityY: 0,
    facing: 0
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
