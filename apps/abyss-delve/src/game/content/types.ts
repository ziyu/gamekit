import type { RenderObjectDefinition } from "@gamekit/renderer-core";

export const ABYSS_HERO_TYPE = "abyss.heroClass";
export const ABYSS_ENEMY_TYPE = "abyss.enemyProfile";
export const ABYSS_ROOM_TYPE = "abyss.roomTemplate";
export const ABYSS_LOOT_TABLE_TYPE = "abyss.lootTable";
export const ABYSS_REWARD_TYPE = "abyss.reward";
export const RENDER_OBJECT_TYPE = "render.object";

export type AbyssHeroClass = {
  id: string;
  label: string;
  actorDefinitionId: string;
  renderObjectId: string;
  spawn: { x: number; y: number };
  speed: number;
};

export type AbyssEnemyProfile = {
  id: string;
  label: string;
  role: "melee" | "ranged" | "heavy";
  actorDefinitionId: string;
  renderObjectId: string;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  maxHealth: number;
  radius: number;
  lootTableId: string;
};

export type AbyssRoomTemplate = {
  id: string;
  label: string;
  heroClassId: string;
  bounds: { x: number; y: number; width: number; height: number };
  enemies: Array<{ profileId: string; x: number; y: number }>;
};

export type AbyssLootTable = {
  id: string;
  drops: Array<{
    id: string;
    label: string;
    kind: "gold" | "gear" | "blessing";
    amount: number;
    weight: number;
    renderObjectId: string;
  }>;
};

export type AbyssRewardDefinition = {
  id: string;
  label: string;
  detail: string;
  effect: "damage" | "health" | "energy";
  amount: number;
};

export type AbyssRenderObjectDefinition = RenderObjectDefinition & {
  id: string;
};
