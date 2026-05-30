import type { AbyssContentEntry } from "../factories";
import { enemyProfile, gasActor } from "../factories";

export const abyssEnemyEntries: AbyssContentEntry[] = [
  gasActor("actor.enemy.melee", "Ash Gnawer", 58, 0, ["tag.enemy"], ["ability.enemy"]),
  enemyProfile({
    id: "enemy.melee",
    label: "Ash Gnawer",
    role: "melee",
    tier: "minion",
    actorDefinitionId: "actor.enemy.melee",
    renderObjectId: "abyss.render.enemy.melee",
    lootTableId: "loot.enemy.basic",
    speed: 128,
    damage: 12,
    attackRange: 46,
    attackCooldownMs: 720,
    maxHealth: 58,
    radius: 18
  }),
  gasActor("actor.enemy.ranged", "Hollow Hexer", 46, 0, ["tag.enemy"], ["ability.enemy"]),
  enemyProfile({
    id: "enemy.ranged",
    label: "Hollow Hexer",
    role: "ranged",
    tier: "minion",
    actorDefinitionId: "actor.enemy.ranged",
    renderObjectId: "abyss.render.enemy.ranged",
    lootTableId: "loot.enemy.basic",
    speed: 92,
    damage: 8,
    attackRange: 310,
    attackCooldownMs: 1100,
    maxHealth: 46,
    radius: 16
  }),
  gasActor("actor.enemy.heavy", "Iron Maw", 118, 0, ["tag.enemy"], ["ability.enemy"]),
  enemyProfile({
    id: "enemy.heavy",
    label: "Iron Maw",
    role: "heavy",
    tier: "minion",
    actorDefinitionId: "actor.enemy.heavy",
    renderObjectId: "abyss.render.enemy.heavy",
    lootTableId: "loot.enemy.basic",
    speed: 74,
    damage: 22,
    attackRange: 76,
    attackCooldownMs: 1280,
    maxHealth: 118,
    radius: 28
  }),
  gasActor(
    "actor.enemy.elite",
    "Crimson Warden",
    176,
    0,
    ["tag.enemy", "tag.elite"],
    ["ability.enemy.elite"]
  ),
  enemyProfile({
    id: "enemy.elite.warden",
    label: "Crimson Warden",
    role: "heavy",
    tier: "elite",
    actorDefinitionId: "actor.enemy.elite",
    renderObjectId: "abyss.render.enemy.elite",
    lootTableId: "loot.enemy.elite",
    speed: 68,
    damage: 30,
    attackRange: 96,
    attackCooldownMs: 1480,
    maxHealth: 176,
    radius: 34
  })
];
