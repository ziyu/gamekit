import type { AbyssContentEntry } from "../factories";
import { rewardDefinition, rewardPool } from "../factories";

export const abyssRewardEntries: AbyssContentEntry[] = [
  rewardDefinition({
    id: "reward.edge",
    label: "Sharpened Edge",
    detail: "+8 attack damage",
    effect: "damage",
    category: "offense",
    amount: 8
  }),
  rewardDefinition({
    id: "reward.vitality",
    label: "Blood Margin",
    detail: "+24 max health",
    effect: "health",
    category: "defense",
    amount: 24
  }),
  rewardDefinition({
    id: "reward.focus",
    label: "Deep Focus",
    detail: "+18 max energy",
    effect: "energy",
    category: "utility",
    amount: 18
  }),
  rewardPool({
    id: "rewardPool.bootstrap",
    label: "Antechamber Blessings",
    kind: "room_clear",
    rewardIds: ["reward.edge", "reward.vitality", "reward.focus"]
  }),
  rewardPool({
    id: "rewardPool.elite",
    label: "Elite Cache",
    kind: "elite_clear",
    rewardIds: ["reward.edge", "reward.vitality"]
  })
];
