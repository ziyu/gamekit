import type { AbyssContentEntry } from "../factories";
import {
  gasAbility,
  gasAbilityDefinition,
  gasAttribute,
  gasCue,
  gasEffect,
  gasEffectDefinition,
  gasTag
} from "../factories";

export const abyssAbilityEntries: AbyssContentEntry[] = [
  gasAttribute("health", 0, 999, 100),
  gasAttribute("energy", 0, 200, 100),
  gasTag("tag.player"),
  gasTag("tag.enemy"),
  gasTag("tag.elite"),
  gasTag("tag.status.burning"),
  gasTag("tag.status.exposed"),
  gasTag("tag.status.guarded"),
  gasCue("cue.cast", "cast.flash"),
  gasCue("cue.hit", "hit.spark"),
  gasCue("cue.burn", "burn.tick"),
  gasCue("cue.exposed", "status.exposed"),
  gasCue("cue.guard", "status.guarded"),
  gasCue("cue.death", "death.burst"),
  gasEffect("effect.basic_damage", "Blade Cut", -18, ["cue.hit"]),
  gasEffect("effect.fire_damage", "Cinder Bolt", -34, ["cue.hit"]),
  gasEffect("effect.cleave_damage", "Void Cleave", -26, ["cue.hit"]),
  gasEffect("effect.enemy_hit", "Monster Hit", -10, ["cue.hit"]),
  gasEffect("effect.elite_hit", "Crimson Maul", -18, ["cue.hit"]),
  gasEffectDefinition({
    id: "effect.burning",
    name: "Burning",
    durationMs: 1600,
    periodMs: 400,
    periodicModifiers: [{ attribute: "health", operation: "add", value: -4 }],
    grantedTags: ["tag.status.burning"],
    cues: ["cue.burn"]
  }),
  gasEffectDefinition({
    id: "effect.exposed",
    name: "Exposed",
    durationMs: 1800,
    grantedTags: ["tag.status.exposed"],
    cues: ["cue.exposed"]
  }),
  gasEffectDefinition({
    id: "effect.guarded",
    name: "Guarded",
    durationMs: 180,
    grantedTags: ["tag.status.guarded"],
    cues: ["cue.guard"]
  }),
  gasAbility("ability.basic", "Basic Attack", "effect.basic_damage", 340, ["cue.hit"]),
  gasAbilityDefinition({
    id: "ability.firebolt",
    name: "Cinder Bolt",
    cooldownMs: 850,
    costs: [{ attribute: "energy", amount: 16 }],
    effects: [],
    cues: ["cue.cast"]
  }),
  gasAbilityDefinition({
    id: "ability.cleave",
    name: "Void Cleave",
    cooldownMs: 1100,
    costs: [{ attribute: "energy", amount: 12 }],
    effects: [],
    cues: ["cue.cast"]
  }),
  gasAbility("ability.enemy", "Enemy Strike", "effect.enemy_hit", 700, ["cue.hit"]),
  gasAbility("ability.enemy.elite", "Elite Strike", "effect.elite_hit", 1050, ["cue.hit"])
];
