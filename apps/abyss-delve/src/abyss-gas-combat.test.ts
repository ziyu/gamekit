import { describe, expect, it } from "vitest";
import { Actor, Projectile, Position } from "./game";
import { createAbyssTestHarness } from "./test/abyss-test-utils";

describe("Abyss Delve GAS combat semantics", () => {
  it("casts firebolt without self damage and applies burning after projectile hit", () => {
    const harness = createAbyssTestHarness();
    const enemy = harness.livingEnemies()[0]!;
    aimAt(harness, enemy);
    harness.abyss.input.skillPrimaryRequested = true;
    harness.tick(80);

    expect(harness.abyss.snapshot().player.health).toBe(160);
    expect(harness.abyss.snapshot().player.energy).toBe(84);
    expect(harness.abyss.runtime.world.query([Projectile]).length).toBe(1);

    moveProjectileOntoEnemy(harness, enemy);
    const enemyActor = harness.abyss.runtime.world.get(enemy, Actor)!;
    harness.tick(0);

    const inspector = harness.abyss
      .snapshot()
      .actorInspectors.find((actor) => actor.actorId === enemyActor.actorId);
    expect(inspector?.tags).toContain("tag.status.burning");
    expect(inspector?.activeEffects.map((effect) => effect.effectId)).toContain("effect.burning");
  });

  it("rejects cooldown casts without spawning additional projectiles", () => {
    const harness = createAbyssTestHarness();
    const enemy = harness.livingEnemies()[0]!;
    harness.movePlayerNear(enemy);

    harness.abyss.input.skillPrimaryRequested = true;
    harness.tick(80);
    harness.abyss.input.skillPrimaryRequested = true;
    harness.tick(80);

    expect(harness.abyss.runtime.world.query([Projectile]).length).toBe(1);
    expect(
      harness.abyss
        .snapshot()
        .gasTraces.some(
          (trace) => trace.type === "ability.rejected" && trace.abilityId === "ability.firebolt"
        )
    ).toBe(true);
  });

  it("applies exposed through cleave and reports cooldowns in actor inspector", () => {
    const harness = createAbyssTestHarness();
    const enemy = harness.livingEnemies()[0]!;
    harness.movePlayerNear(enemy);
    harness.abyss.input.skillSecondaryRequested = true;
    harness.tick(80);

    const enemyActor = harness.abyss.runtime.world.get(enemy, Actor)!;
    const snapshot = harness.abyss.snapshot();
    const enemyInspector = snapshot.actorInspectors.find(
      (actor) => actor.actorId === enemyActor.actorId
    );
    const playerInspector = snapshot.actorInspectors.find(
      (actor) => actor.actorId === "abyss.player"
    );

    expect(enemyInspector?.tags).toContain("tag.status.exposed");
    expect(
      playerInspector?.abilities.find((ability) => ability.id === "ability.cleave")?.cooldownUntil
    ).toBeGreaterThan(0);
    expect(snapshot.skills.find((skill) => skill.id === "ability.cleave")?.ready).toBe(false);
  });
});

function aimAt(
  harness: ReturnType<typeof createAbyssTestHarness>,
  entity: ReturnType<typeof harness.livingEnemies>[number]
): void {
  const position = harness.abyss.runtime.world.get(entity, Position);
  if (!position) {
    throw new Error("Missing aim target position");
  }
  harness.abyss.input.aimX = position.x;
  harness.abyss.input.aimY = position.y;
}

function moveProjectileOntoEnemy(
  harness: ReturnType<typeof createAbyssTestHarness>,
  enemy: ReturnType<typeof harness.livingEnemies>[number]
): void {
  const projectile = harness.abyss.runtime.world.query([Projectile, Position])[0];
  const enemyPosition = harness.abyss.runtime.world.get(enemy, Position);
  const projectilePosition =
    projectile === undefined ? undefined : harness.abyss.runtime.world.get(projectile, Position);
  if (projectile === undefined || !enemyPosition || !projectilePosition) {
    throw new Error("Missing projectile or enemy position");
  }

  projectilePosition.x = enemyPosition.x;
  projectilePosition.y = enemyPosition.y;
}
