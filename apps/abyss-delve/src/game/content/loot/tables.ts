import type { AbyssContentEntry } from "../factories";
import { lootTable } from "../factories";

export const abyssLootEntries: AbyssContentEntry[] = [
  lootTable({
    id: "loot.enemy.basic",
    source: "enemy.basic",
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
        renderObjectId: "abyss.render.loot.gear",
        itemBaseId: "item.blade.worn",
        affixIds: ["affix.searing"]
      },
      {
        id: "loot.blessing.spark",
        label: "Spark Blessing",
        kind: "blessing",
        amount: 1,
        weight: 1,
        renderObjectId: "abyss.render.loot.blessing",
        rewardId: "reward.focus"
      }
    ]
  }),
  lootTable({
    id: "loot.enemy.elite",
    source: "enemy.elite",
    drops: [
      {
        id: "loot.gold.elite",
        label: "Gold Cache",
        kind: "gold",
        amount: 36,
        weight: 4,
        renderObjectId: "abyss.render.loot.gold"
      },
      {
        id: "loot.gear.embermail",
        label: "Embermail Vest",
        kind: "gear",
        amount: 1,
        weight: 3,
        renderObjectId: "abyss.render.loot.gear",
        itemBaseId: "item.armor.embermail",
        affixIds: ["affix.stout"]
      },
      {
        id: "loot.charm.deepfocus",
        label: "Deep Focus Charm",
        kind: "gear",
        amount: 1,
        weight: 2,
        renderObjectId: "abyss.render.loot.blessing",
        itemBaseId: "item.charm.deepfocus",
        affixIds: ["affix.focused"]
      }
    ]
  })
];
