import type { AbyssContentEntry } from "../factories";
import { tcaRule } from "../factories";

export const abyssRuleEntries: AbyssContentEntry[] = [
  tcaRule("rule.enemy.drop", "abyss.enemy_died", "abyss.roll_loot"),
  tcaRule("rule.room.clear", "abyss.enemy_died", "abyss.check_room_clear"),
  tcaRule("rule.reward.selected", "abyss.reward_selected", "abyss.apply_reward")
];
