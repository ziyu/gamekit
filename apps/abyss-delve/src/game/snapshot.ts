import type { GameEvent } from "@gamekit/event-bus";
import type { EntityId } from "@gamekit/world";
import { Actor, Combat, Loot, Position, Room } from "./components";
import type { AbyssRuntimeState } from "./runtime-state";
import type { AbyssEntitySnapshot, AbyssSnapshot } from "./types";

const SKILLS = [
  { id: "ability.basic", key: "LMB", label: "Blade Cut" },
  { id: "ability.firebolt", key: "RMB", label: "Cinder Bolt" },
  { id: "ability.cleave", key: "1", label: "Void Cleave" },
  { id: "abyss.dodge", key: "Space", label: "Dodge" }
];

export function createAbyssSnapshot(state: AbyssRuntimeState): AbyssSnapshot {
  const player = state.playerEntity;
  const playerCombat = player === undefined ? undefined : state.world.get(player, Combat);
  const room = state.roomEntity === undefined ? undefined : state.world.get(state.roomEntity, Room);
  const enemies = state.world
    .query([Actor, Combat])
    .filter((entity) => state.world.get(entity, Actor)?.faction === "enemy");
  const remainingEnemies = enemies.filter(
    (entity) => state.world.get(entity, Actor)?.alive === true
  ).length;

  const snapshot: AbyssSnapshot = {
    running: false,
    clock: emptyClock(),
    objective: {
      label: room?.completed ? "Claim your reward" : "Clear the chamber",
      remainingEnemies,
      completed: room?.completed === true
    },
    player: {
      health: playerCombat?.health ?? 0,
      maxHealth: playerCombat?.maxHealth ?? 1,
      energy: playerCombat?.energy ?? 0,
      maxEnergy: playerCombat?.maxEnergy ?? 1,
      gold: state.run.gold,
      inventoryOpen: state.run.inventoryOpen,
      paused: state.run.paused
    },
    skills: createSkillSnapshots(state),
    rewardOpen: state.run.rewardOpen,
    rewardChoices: state.run.rewardChoices,
    entities: state.world.query().map((entity) => createEntitySnapshot(state, entity)),
    recentLoot: state.run.recentLoot,
    timeline: [...state.timeline],
    events: [...state.events],
    gasTraces: state.gasTraceStore.list(),
    tcaTraces: state.tcaTraceStore.list()
  };
  const pickupPrompt = createPickupPrompt(state);
  if (pickupPrompt) {
    snapshot.pickupPrompt = pickupPrompt;
  }
  return snapshot;
}

export function attachRuntimeSnapshot(
  snapshot: AbyssSnapshot,
  runtimeClock: AbyssSnapshot["clock"],
  running: boolean
): AbyssSnapshot {
  return {
    ...snapshot,
    running,
    clock: runtimeClock
  };
}

function createSkillSnapshots(state: AbyssRuntimeState): AbyssSnapshot["skills"] {
  const gas = state.gasRuntime();
  const actor = gas?.hasActor("player") ? gas.getActor("player") : undefined;
  const now = state.world.count() >= 0 ? (state.timeline[0]?.time ?? 0) : 0;
  return SKILLS.map((skill) => {
    const cooldownUntil = actor?.abilities.cooldowns[skill.id] ?? 0;
    const cooldownRemainingMs = Math.max(0, cooldownUntil - now);
    return {
      ...skill,
      cooldownRemainingMs,
      ready: cooldownRemainingMs <= 0
    };
  });
}

function createPickupPrompt(state: AbyssRuntimeState): AbyssSnapshot["pickupPrompt"] | undefined {
  const player = state.playerEntity;
  const playerPosition = player === undefined ? undefined : state.world.get(player, Position);
  if (!playerPosition) {
    return undefined;
  }

  let best:
    | {
        label: string;
        distance: number;
      }
    | undefined;
  for (const entity of state.world.query([Loot, Position])) {
    const loot = state.world.get(entity, Loot);
    const position = state.world.get(entity, Position);
    if (!loot || !position || loot.picked) {
      continue;
    }

    const distance = Math.hypot(position.x - playerPosition.x, position.y - playerPosition.y);
    if (distance <= 70 && (!best || distance < best.distance)) {
      best = { label: loot.label, distance };
    }
  }

  return best;
}

function createEntitySnapshot(state: AbyssRuntimeState, entity: EntityId): AbyssEntitySnapshot {
  const position = state.world.get(entity, Position);
  const actor = state.world.get(entity, Actor);
  const combat = state.world.get(entity, Combat);
  const loot = state.world.get(entity, Loot);
  const snapshot: AbyssEntitySnapshot = {
    id: entity,
    label: actor?.label ?? loot?.label ?? String(entity),
    role: actor?.role ?? loot?.kind ?? "effect",
    x: position?.x ?? 0,
    y: position?.y ?? 0
  };
  if (actor) {
    snapshot.actorId = actor.actorId;
    snapshot.faction = actor.faction;
  }
  if (combat) {
    snapshot.health = combat.health;
    snapshot.maxHealth = combat.maxHealth;
  }
  if (loot) {
    snapshot.lootKind = loot.kind;
    snapshot.lootLabel = loot.label;
  }
  return snapshot;
}

function emptyClock(): AbyssSnapshot["clock"] {
  return {
    elapsed: 0,
    delta: 0,
    ticks: 0,
    running: false
  };
}

export function appendEvent(buffer: GameEvent[], event: GameEvent, limit = 30): void {
  buffer.unshift(event);
  if (buffer.length > limit) {
    buffer.pop();
  }
}
