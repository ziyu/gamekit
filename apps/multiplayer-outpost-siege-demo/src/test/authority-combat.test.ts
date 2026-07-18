import { createEventBus } from "@gamekit/event-bus";
import type { PhysicsBackendAdapter } from "@gamekit/physics-core";
import { initRapier2dPhysicsBackend } from "@gamekit/physics-rapier2d";
import { createKootaWorld } from "@gamekit/world-koota";
import { beforeAll, describe, expect, it } from "vitest";

import { createOutpostDataRegistry } from "../content";
import {
  createOutpostAuthorityGameplayRuntime,
  type OutpostAuthorityCombatCommand,
  type OutpostAuthorityPlayerState
} from "../gameplay";

const FIXED_DELTA_MS = 1000 / 60;

describe("Outpost authority combat", () => {
  let physicsBackend: PhysicsBackendAdapter;

  beforeAll(async () => {
    physicsBackend = await initRapier2dPhysicsBackend({
      id: "outpost.authority-combat.test.rapier2d",
      lengthUnit: 100
    });
  });

  it("resolves a correlated rifle kill through World, Physics, GAS, and TCA", () => {
    const world = createKootaWorld();
    const pendingCommands: OutpostAuthorityCombatCommand[] = [];
    const player = createPlayer();
    const authority = createOutpostAuthorityGameplayRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      physicsBackend,
      eventBus: createEventBus(),
      players: () => [player],
      combatCommands() {
        return pendingCommands.splice(0, pendingCommands.length);
      },
      initialEnemies: [
        { id: "enemy.test.raider", definitionId: "enemy.outpost.raider", x: 450, y: 300 }
      ]
    });
    authority.runtime.start();
    tick(authority, 2);

    for (let shot = 1; shot <= 4; shot += 1) {
      const beforeHits = authority.snapshot().combat.projectileHits;
      const enemy = authority
        .snapshot()
        .combat.actors.find((actor) => actor.id === "enemy.test.raider");
      expect(enemy).toBeDefined();
      pendingCommands.push({
        id: `combat-shot-${shot}`,
        playerId: player.playerId,
        ability: "rifle",
        aimX: enemy?.x ?? 450,
        aimY: enemy?.y ?? 300,
        correlationId: `outpost.test.rifle.${shot}`
      });
      tickUntil(authority, () => authority.snapshot().combat.projectileHits > beforeHits, 30);
      const hitX = shot === 1 ? combatActor(authority, "enemy.test.raider").x : undefined;
      tick(authority, 2);
      if (hitX !== undefined) {
        expect(combatActor(authority, "enemy.test.raider").x).toBeGreaterThan(hitX);
      }
    }
    tick(authority, 3);

    expect(authority.snapshot().combat).toMatchObject({
      acceptedCommands: 4,
      rejectedCommands: 0,
      projectileHits: 4,
      kills: 1,
      drops: 1,
      objectiveProgress: 1
    });
    expect(
      authority.snapshot().combat.actors.some((actor) => actor.id === "enemy.test.raider")
    ).toBe(false);
    expect(
      authority.physicsTrace.list().some((trace) => trace.correlationId === "outpost.test.rifle.4")
    ).toBe(true);
    expect(
      authority.gasTrace.list().some((trace) => trace.correlationId === "outpost.test.rifle.4")
    ).toBe(true);
    expect(
      authority.tcaTrace.list().some((trace) => trace.correlationId === "outpost.test.rifle.4")
    ).toBe(true);

    authority.runtime.dispose();
    expect(world.count()).toBe(0);
  });

  it("validates placement, costs, cooldowns, status effects, dash, and enemy attacks", () => {
    const world = createKootaWorld();
    const pendingCommands: OutpostAuthorityCombatCommand[] = [];
    const player = createPlayer();
    const authority = createOutpostAuthorityGameplayRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      physicsBackend,
      eventBus: createEventBus(),
      players: () => [player],
      combatCommands() {
        return pendingCommands.splice(0, pendingCommands.length);
      },
      initialEnemies: [
        { id: "enemy.test.attacker", definitionId: "enemy.outpost.raider", x: 340, y: 300 }
      ]
    });
    authority.runtime.start();
    tickUntil(authority, () => authority.snapshot().combat.enemyAttacks > 0, 10);

    pendingCommands.push(
      command("invalid-placement", player.playerId, "deploy-turret", 2_000, 300)
    );
    tick(authority, 1);
    expect(authority.snapshot().combat).toMatchObject({ acceptedCommands: 0, rejectedCommands: 1 });
    expect(combatActor(authority, player.playerId).resource).toBe(100);

    pendingCommands.push(command("valid-placement", player.playerId, "deploy-turret", 300, 400));
    tick(authority, 1);
    expect(authority.snapshot().combat.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "turret.1", kind: "buildable", resource: 0 })
      ])
    );
    expect(combatActor(authority, player.playerId).resource).toBe(75);

    pendingCommands.push(command("shock", player.playerId, "shock-field", 340, 300));
    tick(authority, 1);
    expect(combatActor(authority, "enemy.test.attacker").tags).toContain("status.shocked");

    pendingCommands.push(command("dash-1", player.playerId, "dash", 500, 300));
    tick(authority, 1);
    expect(combatActor(authority, player.playerId)).toMatchObject({ stamina: 75 });
    expect(combatActor(authority, player.playerId).tags).toContain("state.dashing");

    pendingCommands.push(command("dash-2", player.playerId, "dash", 500, 300));
    tick(authority, 1);
    expect(authority.snapshot().combat).toMatchObject({ acceptedCommands: 3, rejectedCommands: 2 });
    expect(combatActor(authority, player.playerId).stamina).toBe(75);

    authority.gas.modifyAttribute(
      player.playerId,
      { attribute: "shared-resource", operation: "set", value: 0 },
      "test"
    );
    tick(authority, 31);
    const buildablesBefore = authority
      .snapshot()
      .combat.actors.filter((actor) => actor.kind === "buildable").length;
    pendingCommands.push(command("no-resource", player.playerId, "deploy-turret", 400, 400));
    tick(authority, 1);
    expect(
      authority.snapshot().combat.actors.filter((actor) => actor.kind === "buildable")
    ).toHaveLength(buildablesBefore);
    expect(authority.snapshot().combat.rejectedCommands).toBe(3);

    authority.runtime.dispose();
    expect(world.count()).toBe(0);
  });

  it("keeps configured opening enemies dormant before enabling physical pursuit", () => {
    const world = createKootaWorld();
    const player = createPlayer();
    const authority = createOutpostAuthorityGameplayRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      physicsBackend,
      eventBus: createEventBus(),
      players: () => [player],
      initialEnemies: [
        {
          id: "enemy.test.delayed",
          definitionId: "enemy.outpost.raider",
          x: 340,
          y: 300,
          activationDelayMs: 100
        }
      ]
    });
    authority.runtime.start();

    tick(authority, 5);
    expect(authority.snapshot().combat.enemyAttacks).toBe(0);
    expect(combatActor(authority, "enemy.test.delayed")).toMatchObject({
      x: 340,
      y: 300,
      velocityX: 0,
      velocityY: 0
    });

    tickUntil(authority, () => authority.snapshot().combat.enemyAttacks > 0, 5);
    expect(authority.snapshot().combat.enemyAttacks).toBeGreaterThan(0);

    authority.runtime.dispose();
    expect(world.count()).toBe(0);
  });

  it("runs periodic status, shield break, and boss phase reactions through TCA", () => {
    const world = createKootaWorld();
    const eventBus = createEventBus();
    const facts: string[] = [];
    eventBus.on("outpost.shield_broken", (event) => facts.push(event.type));
    eventBus.on("outpost.boss.phase_changed", (event) => facts.push(event.type));
    const pendingCommands: OutpostAuthorityCombatCommand[] = [];
    const player = createPlayer();
    const authority = createOutpostAuthorityGameplayRuntime({
      dataRegistry: createOutpostDataRegistry(),
      world,
      physicsBackend,
      eventBus,
      players: () => [player],
      combatCommands() {
        return pendingCommands.splice(0, pendingCommands.length);
      },
      initialEnemies: [
        {
          id: "enemy.test.overseer",
          definitionId: "enemy.outpost.overseer",
          x: 430,
          y: 300
        }
      ]
    });
    authority.runtime.start();
    tick(authority, 2);

    pendingCommands.push(command("boss-shock", player.playerId, "shock-field", 430, 300));
    tick(authority, 1);
    expect(combatActor(authority, "enemy.test.overseer").tags).toContain("status.shocked");
    tick(authority, 61);
    expect(combatActor(authority, "enemy.test.overseer").health).toBeLessThan(600);

    authority.gas.modifyAttribute(
      player.playerId,
      { attribute: "shield", operation: "set", value: 0 },
      "test",
      { correlationId: "outpost.test.shield-break" }
    );
    authority.gas.modifyAttribute(
      "enemy.test.overseer.actor",
      { attribute: "health", operation: "set", value: 299 },
      player.playerId,
      { correlationId: "outpost.test.boss-phase" }
    );
    tick(authority, 1);

    expect(facts).toEqual(
      expect.arrayContaining(["outpost.shield_broken", "outpost.boss.phase_changed"])
    );
    expect(combatActor(authority, "enemy.test.overseer").tags).toContain("boss.phase.two");
    expect(
      authority.tcaTrace.list().some((trace) => trace.correlationId === "outpost.test.boss-phase")
    ).toBe(true);

    authority.runtime.dispose();
    expect(world.count()).toBe(0);
  });
});

function createPlayer(): OutpostAuthorityPlayerState {
  return {
    playerId: "player.test.ranger",
    slot: 0,
    spawn: { x: 300, y: 300 },
    input: { sequence: 0, moveX: 0, moveY: 0, aimX: 450, aimY: 300 }
  };
}

function tick(
  authority: ReturnType<typeof createOutpostAuthorityGameplayRuntime>,
  count: number
): void {
  for (let index = 0; index < count; index += 1) {
    authority.runtime.tick(FIXED_DELTA_MS);
  }
}

function tickUntil(
  authority: ReturnType<typeof createOutpostAuthorityGameplayRuntime>,
  predicate: () => boolean,
  limit: number
): void {
  for (let index = 0; index < limit && !predicate(); index += 1) {
    authority.runtime.tick(FIXED_DELTA_MS);
  }
  if (!predicate()) {
    throw new Error(
      JSON.stringify({
        combat: authority.snapshot().combat,
        physics: authority.physics.snapshot(),
        traces: authority.physicsTrace.list().filter((trace) => trace.kind === "query")
      })
    );
  }
}

function command(
  id: string,
  playerId: string,
  ability: OutpostAuthorityCombatCommand["ability"],
  aimX: number,
  aimY: number
): OutpostAuthorityCombatCommand {
  return { id, playerId, ability, aimX, aimY, correlationId: `outpost.test.${id}` };
}

function combatActor(
  authority: ReturnType<typeof createOutpostAuthorityGameplayRuntime>,
  id: string
) {
  const actor = authority.snapshot().combat.actors.find((candidate) => candidate.id === id);
  expect(actor).toBeDefined();
  return actor!;
}
