import type { AbyssContentEntry } from "../factories";
import { gasAbility, gasAttribute, gasCue, gasEffect, gasTag } from "../factories";

export const abyssAbilityEntries: AbyssContentEntry[] = [
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
  gasEffect("effect.elite_hit", "Crimson Maul", -18, ["cue.hit"]),
  gasAbility("ability.basic", "Basic Attack", "effect.basic_damage", 340, ["cue.hit"]),
  gasAbility("ability.firebolt", "Cinder Bolt", "effect.fire_damage", 850, ["cue.hit"], 16),
  gasAbility("ability.cleave", "Void Cleave", "effect.cleave_damage", 1100, ["cue.hit"], 12),
  gasAbility("ability.enemy", "Enemy Strike", "effect.enemy_hit", 700, ["cue.hit"]),
  gasAbility("ability.enemy.elite", "Elite Strike", "effect.elite_hit", 1050, ["cue.hit"])
];
