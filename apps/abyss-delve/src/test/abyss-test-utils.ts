import { createMemoryRenderer } from "@gamekit/test-utils";
import type { EntityId } from "@gamekit/world";
import { createKootaWorld } from "@gamekit/world-koota";
import { Actor, Combat, Loot, Position, createAbyssRuntime, type AbyssRuntime } from "../game";

export type AbyssTestHarness = {
  abyss: AbyssRuntime;
  tick(delta?: number): void;
  livingEnemies(): EntityId[];
  movePlayerNear(entity: EntityId): void;
  weaken(entity: EntityId, health?: number): void;
  attack(entity: EntityId): void;
  pickupFirstLoot(): void;
};

export function createAbyssTestHarness(): AbyssTestHarness {
  const abyss = createAbyssRuntime({
    renderer: createMemoryRenderer("abyss.test.renderer"),
    world: createKootaWorld()
  });
  abyss.runtime.start();

  return {
    abyss,
    tick(delta = 500) {
      abyss.runtime.tick(delta);
    },
    livingEnemies() {
      return abyss.runtime.world
        .query([Actor, Combat])
        .filter((entity) => abyss.runtime.world.get(entity, Actor)?.faction === "enemy")
        .filter((entity) => abyss.runtime.world.get(entity, Actor)?.alive === true);
    },
    movePlayerNear(entity) {
      const target = abyss.runtime.world.get(entity, Position);
      const player = findPlayer(abyss);
      const playerPosition = abyss.runtime.world.get(player, Position);
      if (!target || !playerPosition) {
        throw new Error("Missing player or target position");
      }
      playerPosition.x = target.x - 36;
      playerPosition.y = target.y;
      abyss.input.aimX = target.x;
      abyss.input.aimY = target.y;
    },
    weaken(entity, health = 8) {
      const actor = abyss.runtime.world.get(entity, Actor);
      const combat = abyss.runtime.world.get(entity, Combat);
      if (!actor || !combat) {
        throw new Error("Missing target combat state");
      }
      abyss.gasRuntime()?.modifyAttribute(actor.actorId, {
        attribute: "health",
        operation: "set",
        value: health
      });
      combat.health = health;
    },
    attack(entity) {
      this.movePlayerNear(entity);
      this.weaken(entity);
      abyss.input.attackRequested = true;
      abyss.runtime.tick(500);
    },
    pickupFirstLoot() {
      const loot = abyss.runtime.world.query([Loot, Position])[0];
      if (loot === undefined) {
        throw new Error("No loot to pick up");
      }
      const lootPosition = abyss.runtime.world.get(loot, Position);
      const player = findPlayer(abyss);
      const playerPosition = abyss.runtime.world.get(player, Position);
      if (!lootPosition || !playerPosition) {
        throw new Error("Missing pickup position");
      }
      playerPosition.x = lootPosition.x;
      playerPosition.y = lootPosition.y;
      abyss.input.interactRequested = true;
      abyss.runtime.tick(80);
    }
  };
}

function findPlayer(abyss: AbyssRuntime): EntityId {
  const player = abyss.runtime.world
    .query([Actor])
    .find((entity) => abyss.runtime.world.get(entity, Actor)?.faction === "player");
  if (player === undefined) {
    throw new Error("Missing player");
  }
  return player;
}
