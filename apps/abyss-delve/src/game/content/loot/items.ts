import type { AbyssContentEntry } from "../factories";
import { itemAffix, itemBase } from "../factories";

export const abyssItemEntries: AbyssContentEntry[] = [
  itemBase({
    id: "item.blade.worn",
    label: "Worn Blade",
    slot: "weapon",
    rarity: "common",
    renderObjectId: "abyss.render.loot.gear",
    attributeModifiers: [{ attribute: "damage", amount: 4 }]
  }),
  itemBase({
    id: "item.armor.embermail",
    label: "Embermail Vest",
    slot: "armor",
    rarity: "rare",
    renderObjectId: "abyss.render.loot.gear",
    attributeModifiers: [{ attribute: "health", amount: 18 }]
  }),
  itemBase({
    id: "item.charm.deepfocus",
    label: "Deep Focus Charm",
    slot: "charm",
    rarity: "relic",
    renderObjectId: "abyss.render.loot.blessing",
    attributeModifiers: [{ attribute: "energy", amount: 16 }]
  }),
  itemAffix({
    id: "affix.searing",
    label: "Searing",
    attribute: "damage",
    min: 2,
    max: 7
  }),
  itemAffix({
    id: "affix.stout",
    label: "Stout",
    attribute: "health",
    min: 8,
    max: 20
  }),
  itemAffix({
    id: "affix.focused",
    label: "Focused",
    attribute: "energy",
    min: 6,
    max: 14
  })
];
