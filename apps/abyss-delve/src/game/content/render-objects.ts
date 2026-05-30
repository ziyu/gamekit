import type { AbyssRenderObjectDefinition } from "./types";

const SQUARE = "debug.square";

export const abyssRenderObjects: AbyssRenderObjectDefinition[] = [
  {
    id: "abyss.render.player",
    type: "container",
    children: [
      node("shadow", 46, 16, 0x05070b, 0, 18, 0.45),
      node("ring", 42, 42, 0x57d4ff, 0, 0, 0.35),
      node("cape", 24, 38, 0x25345f, -10, 2, 0.95),
      node("body", 28, 34, 0xbfeaff, 0, 0),
      node("weapon", 34, 8, 0xffd27a, 26, -2),
      node("aim", 42, 4, 0x9de6ff, 42, 0, 0.65)
    ]
  },
  {
    id: "abyss.render.enemy.melee",
    type: "container",
    children: [
      node("shadow", 40, 14, 0x05070b, 0, 16, 0.45),
      node("body", 30, 30, 0xff6c5f, 0, 0),
      node("claw", 24, 7, 0xffc1a1, 20, 0),
      hpBack(),
      hpFill(0xff6c5f)
    ]
  },
  {
    id: "abyss.render.enemy.ranged",
    type: "container",
    children: [
      node("shadow", 36, 12, 0x05070b, 0, 15, 0.45),
      node("body", 26, 34, 0x9b7cff, 0, 0),
      node("focus", 10, 42, 0xdac8ff, 0, 0, 0.8),
      hpBack(),
      hpFill(0x9b7cff)
    ]
  },
  {
    id: "abyss.render.enemy.heavy",
    type: "container",
    children: [
      node("shadow", 58, 18, 0x05070b, 0, 22, 0.5),
      node("body", 46, 42, 0xffb24a, 0, 0),
      node("core", 22, 22, 0x3b1d13, 0, 0, 0.8),
      hpBack(42),
      hpFill(0xffb24a, 42)
    ]
  },
  {
    id: "abyss.render.projectile",
    type: "container",
    children: [node("glow", 32, 12, 0x71e6ff, 0, 0, 0.55), node("bolt", 22, 6, 0xf3fdff, 0, 0)]
  },
  {
    id: "abyss.render.telegraph",
    type: "container",
    children: [node("area", 86, 86, 0xffe0a3, 0, 0, 0.22)]
  },
  {
    id: "abyss.render.loot.gold",
    type: "container",
    children: [node("beam", 14, 54, 0xffd76d, 0, -18, 0.22), node("drop", 24, 18, 0xffc64a, 0, 8)]
  },
  {
    id: "abyss.render.loot.gear",
    type: "container",
    children: [node("beam", 18, 66, 0x79e4ff, 0, -22, 0.28), node("drop", 30, 20, 0xb7efff, 0, 8)]
  },
  {
    id: "abyss.render.loot.blessing",
    type: "container",
    children: [node("beam", 18, 70, 0xb7ff73, 0, -24, 0.3), node("drop", 26, 26, 0xb7ff73, 0, 4)]
  },
  {
    id: "abyss.render.floating.damage",
    type: "container",
    children: [node("text", 28, 12, 0xff4f59, 0, 0, 0.9)]
  },
  {
    id: "abyss.render.floating.loot",
    type: "container",
    children: [node("text", 34, 12, 0xffd76d, 0, 0, 0.9)]
  }
];

function node(
  id: string,
  width: number,
  height: number,
  tint: number,
  x: number,
  y: number,
  alpha = 1
) {
  return {
    id,
    type: SQUARE,
    transform: { position: { x, y } },
    alpha,
    props: { width, height, tint }
  };
}

function hpBack(width = 34) {
  return node("hp-back", width, 5, 0x220d11, 0, -28, 0.95);
}

function hpFill(tint: number, width = 34) {
  return node("hp-fill", width, 5, tint, 0, -28, 1);
}
