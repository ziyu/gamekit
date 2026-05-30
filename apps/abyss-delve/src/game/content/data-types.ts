import type { DataTypeDefinition } from "@gamekit/data";
import type {
  AbyssEnemyProfile,
  AbyssHeroClass,
  AbyssLootTable,
  AbyssRenderObjectDefinition,
  AbyssRewardDefinition,
  AbyssRoomTemplate
} from "./types";
import {
  ABYSS_ENEMY_TYPE,
  ABYSS_HERO_TYPE,
  ABYSS_LOOT_TABLE_TYPE,
  ABYSS_REWARD_TYPE,
  ABYSS_ROOM_TYPE,
  RENDER_OBJECT_TYPE
} from "./types";

export function createAbyssDataTypes(): Array<DataTypeDefinition<any>> {
  return [
    requiredIdType<AbyssHeroClass>(ABYSS_HERO_TYPE),
    requiredIdType<AbyssEnemyProfile>(ABYSS_ENEMY_TYPE),
    requiredIdType<AbyssRoomTemplate>(ABYSS_ROOM_TYPE),
    requiredIdType<AbyssLootTable>(ABYSS_LOOT_TABLE_TYPE),
    requiredIdType<AbyssRewardDefinition>(ABYSS_REWARD_TYPE),
    requiredIdType<AbyssRenderObjectDefinition>(RENDER_OBJECT_TYPE)
  ];
}

function requiredIdType<TValue extends { id: string }>(type: string): DataTypeDefinition<TValue> {
  return {
    type,
    validate(document) {
      return document.data.id
        ? []
        : [
            {
              code: "abyss.data_missing_id",
              message: `${type} requires id`,
              severity: "error",
              key: document
            }
          ];
    }
  };
}
