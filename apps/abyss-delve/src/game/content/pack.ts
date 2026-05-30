import type { DataPack } from "@gamekit/data";
import {
  GAS_ABILITY_TYPE,
  GAS_ACTOR_TYPE,
  GAS_ATTRIBUTE_TYPE,
  GAS_CUE_TYPE,
  GAS_EFFECT_TYPE,
  GAS_TAG_TYPE
} from "@gamekit/gas";
import { TCA_RULE_TYPE } from "@gamekit/tca";
import { ABYSS_ROOM_BOUNDS } from "../constants";
import { abyssRenderObjects } from "./render-objects";
import {
  ABYSS_ENEMY_TYPE,
  ABYSS_HERO_TYPE,
  ABYSS_LOOT_TABLE_TYPE,
  ABYSS_REWARD_TYPE,
  ABYSS_ROOM_TYPE,
  RENDER_OBJECT_TYPE
} from "./types";

export const abyssDataPack: DataPack = {
  id: "abyss.base",
  version: "1.0.0",
  entries: [
    ...abyssRenderObjects.map((data) => ({ type: RENDER_OBJECT_TYPE, id: data.id, data })),
    gasAttribute("health", 0, 999, 100),
    gasAttribute("energy", 0, 200, 100),
    gasTag("tag.player"),
    gasTag("tag.enemy"),
    gasTag("tag.elite"),
    gasCue("cue.hit", "hit.spark"),
    gasCue("cue.death", "death.burst"),
    gasEffect("effect.basic_damage", "Blade Cut", -18, ["cue.hit"]),
    gasEffect("effect.fire_damage", "Cinder Bolt", -34, ["cue.hit"]),
    gasEffect("effect.cleave_damage", "Void Cleave", -26, ["cue.hit"]),
    gasEffect("effect.enemy_hit", "Monster Hit", -10, ["cue.hit"]),
    gasAbility("ability.basic", "Basic Attack", "effect.basic_damage", 340, ["cue.hit"]),
    gasAbility("ability.firebolt", "Cinder Bolt", "effect.fire_damage", 850, ["cue.hit"], 16),
    gasAbility("ability.cleave", "Void Cleave", "effect.cleave_damage", 1100, ["cue.hit"], 12),
    gasAbility("ability.enemy", "Enemy Strike", "effect.enemy_hit", 700, ["cue.hit"]),
    gasActor(
      "actor.player",
      "Delver",
      160,
      100,
      ["tag.player"],
      ["ability.basic", "ability.firebolt", "ability.cleave"]
    ),
    gasActor("actor.enemy.melee", "Ash Gnawer", 58, 0, ["tag.enemy"], ["ability.enemy"]),
    gasActor("actor.enemy.ranged", "Hollow Hexer", 46, 0, ["tag.enemy"], ["ability.enemy"]),
    gasActor(
      "actor.enemy.heavy",
      "Iron Maw",
      118,
      0,
      ["tag.enemy", "tag.elite"],
      ["ability.enemy"]
    ),
    {
      type: ABYSS_HERO_TYPE,
      id: "hero.delver",
      data: {
        id: "hero.delver",
        label: "Delver",
        actorDefinitionId: "actor.player",
        renderObjectId: "abyss.render.player",
        spawn: { x: 210, y: 342 },
        speed: 230
      }
    },
    enemy("enemy.melee", "Ash Gnawer", "melee", "actor.enemy.melee", "abyss.render.enemy.melee", {
      speed: 128,
      damage: 12,
      attackRange: 46,
      attackCooldownMs: 720,
      maxHealth: 58,
      radius: 18
    }),
    enemy(
      "enemy.ranged",
      "Hollow Hexer",
      "ranged",
      "actor.enemy.ranged",
      "abyss.render.enemy.ranged",
      {
        speed: 92,
        damage: 8,
        attackRange: 310,
        attackCooldownMs: 1100,
        maxHealth: 46,
        radius: 16
      }
    ),
    enemy("enemy.heavy", "Iron Maw", "heavy", "actor.enemy.heavy", "abyss.render.enemy.heavy", {
      speed: 74,
      damage: 22,
      attackRange: 76,
      attackCooldownMs: 1280,
      maxHealth: 118,
      radius: 28
    }),
    {
      type: ABYSS_LOOT_TABLE_TYPE,
      id: "loot.enemy.basic",
      data: {
        id: "loot.enemy.basic",
        drops: [
          {
            id: "loot.gold",
            label: "Gold",
            kind: "gold",
            amount: 12,
            weight: 5,
            renderObjectId: "abyss.render.loot.gold"
          },
          {
            id: "loot.gear.blade",
            label: "Worn Blade",
            kind: "gear",
            amount: 1,
            weight: 2,
            renderObjectId: "abyss.render.loot.gear"
          },
          {
            id: "loot.blessing.spark",
            label: "Spark Blessing",
            kind: "blessing",
            amount: 1,
            weight: 1,
            renderObjectId: "abyss.render.loot.blessing"
          }
        ]
      }
    },
    reward("reward.edge", "Sharpened Edge", "+8 attack damage", "damage", 8),
    reward("reward.vitality", "Blood Margin", "+24 max health", "health", 24),
    reward("reward.focus", "Deep Focus", "+18 max energy", "energy", 18),
    {
      type: ABYSS_ROOM_TYPE,
      id: "room.bootstrap",
      data: {
        id: "room.bootstrap",
        label: "Forsaken Antechamber",
        heroClassId: "hero.delver",
        bounds: ABYSS_ROOM_BOUNDS,
        enemies: [
          { profileId: "enemy.melee", x: 600, y: 290 },
          { profileId: "enemy.ranged", x: 820, y: 220 },
          { profileId: "enemy.heavy", x: 810, y: 470 },
          { profileId: "enemy.melee", x: 510, y: 455 }
        ]
      }
    },
    tcaRule("rule.enemy.drop", "abyss.enemy_died", "abyss.roll_loot"),
    tcaRule("rule.room.clear", "abyss.enemy_died", "abyss.check_room_clear"),
    tcaRule("rule.reward.selected", "abyss.reward_selected", "abyss.apply_reward")
  ]
};

function gasAttribute(id: string, min: number, max: number, defaultValue: number) {
  return {
    type: GAS_ATTRIBUTE_TYPE,
    id,
    data: { id, min, max, defaultValue }
  };
}

function gasTag(id: string) {
  return {
    type: GAS_TAG_TYPE,
    id,
    data: { id }
  };
}

function gasCue(id: string, type: string) {
  return {
    type: GAS_CUE_TYPE,
    id,
    data: { id, type }
  };
}

function gasEffect(id: string, name: string, healthDelta: number, cues: string[]) {
  return {
    type: GAS_EFFECT_TYPE,
    id,
    data: {
      id,
      name,
      attributeModifiers: [{ attribute: "health", operation: "add", value: healthDelta }],
      cues
    }
  };
}

function gasAbility(
  id: string,
  name: string,
  effectId: string,
  cooldownMs: number,
  cues: string[],
  energyCost = 0
) {
  return {
    type: GAS_ABILITY_TYPE,
    id,
    data: {
      id,
      name,
      cooldownMs,
      costs: energyCost > 0 ? [{ attribute: "energy", amount: energyCost }] : [],
      effects: [{ effectId, target: "target" }],
      cues
    }
  };
}

function gasActor(
  id: string,
  name: string,
  health: number,
  energy: number,
  tags: string[],
  abilities: string[]
) {
  return {
    type: GAS_ACTOR_TYPE,
    id,
    data: {
      id,
      name,
      attributes: { health, energy },
      tags,
      abilities
    }
  };
}

function enemy(
  id: string,
  label: string,
  role: "melee" | "ranged" | "heavy",
  actorDefinitionId: string,
  renderObjectId: string,
  stats: {
    speed: number;
    damage: number;
    attackRange: number;
    attackCooldownMs: number;
    maxHealth: number;
    radius: number;
  }
) {
  return {
    type: ABYSS_ENEMY_TYPE,
    id,
    data: {
      id,
      label,
      role,
      actorDefinitionId,
      renderObjectId,
      lootTableId: "loot.enemy.basic",
      ...stats
    }
  };
}

function reward(
  id: string,
  label: string,
  detail: string,
  effect: "damage" | "health" | "energy",
  amount: number
) {
  return {
    type: ABYSS_REWARD_TYPE,
    id,
    data: { id, label, detail, effect, amount }
  };
}

function tcaRule(id: string, eventType: string, action: string) {
  return {
    type: TCA_RULE_TYPE,
    id,
    data: {
      id,
      trigger: { type: "event.type", args: { eventType } },
      actions: [{ type: action }]
    }
  };
}
