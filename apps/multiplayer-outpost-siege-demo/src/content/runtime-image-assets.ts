export type OutpostRuntimeImageAsset = {
  id: string;
  authoringSource: string;
  referenceSource?: string | undefined;
  runtimeUrl: string;
  runtimeFormat: "webp";
  width: number;
  height: number;
  fit: "cover" | "contain";
  padding?: number;
  group: "boot" | "match" | "combat" | "boss";
  preload: boolean;
  lazy?: boolean;
  spriteSheet?: OutpostRuntimeSpriteSheet | undefined;
};

export type OutpostRuntimeSpriteSheetFrame = {
  sourceFrame: number;
  flipX?: boolean | undefined;
  rotateDegrees?: number | undefined;
  offsetX?: number | undefined;
  offsetY?: number | undefined;
};

export type OutpostRuntimeSpriteSheet = {
  sourceColumns: number;
  sourceRows: number;
  poseBounds: { width: number; height: number };
  frames: readonly OutpostRuntimeSpriteSheetFrame[];
};

export const outpostRuntimeImageAssets: readonly OutpostRuntimeImageAsset[] = [
  {
    id: "asset.outpost.logo",
    authoringSource: "assets-src/outpost/ui/logo.webp",
    runtimeUrl: "/assets/outpost/ui/logo.webp",
    runtimeFormat: "webp",
    width: 840,
    height: 232,
    fit: "contain",
    padding: 16,
    group: "boot",
    preload: true
  },
  {
    id: "asset.outpost.arena",
    authoringSource: "assets-src/outpost/match/arena.webp",
    runtimeUrl: "/assets/outpost/match/arena.webp",
    runtimeFormat: "webp",
    width: 1800,
    height: 1000,
    fit: "cover",
    group: "match",
    preload: true
  },
  {
    id: "asset.outpost.wall",
    authoringSource: "assets-src/outpost/environment/wall-segment.webp",
    runtimeUrl: "/assets/outpost/environment/wall-segment.webp",
    runtimeFormat: "webp",
    width: 450,
    height: 138,
    fit: "contain",
    group: "match",
    preload: true
  },
  {
    id: "asset.outpost.barricade",
    authoringSource: "assets-src/outpost/environment/barricade-segment.webp",
    runtimeUrl: "/assets/outpost/environment/barricade-segment.webp",
    runtimeFormat: "webp",
    width: 240,
    height: 90,
    fit: "contain",
    group: "match",
    preload: true
  },
  {
    id: "asset.outpost.cover",
    authoringSource: "assets-src/outpost/environment/cover-crate.webp",
    runtimeUrl: "/assets/outpost/environment/cover-crate.webp",
    runtimeFormat: "webp",
    width: 168,
    height: 84,
    fit: "contain",
    group: "match",
    preload: true
  },
  {
    id: "asset.outpost.pylon",
    authoringSource: "assets-src/outpost/environment/power-pylon.webp",
    runtimeUrl: "/assets/outpost/environment/power-pylon.webp",
    runtimeFormat: "webp",
    width: 72,
    height: 99,
    fit: "contain",
    group: "match",
    preload: true
  },
  {
    id: "asset.outpost.player",
    authoringSource: "assets-src/outpost/combat/player-actions.png",
    referenceSource: "assets-src/outpost/combat/player.webp",
    runtimeUrl: "/assets/outpost/combat/player.webp",
    runtimeFormat: "webp",
    width: 128,
    height: 128,
    fit: "contain",
    padding: 8,
    group: "combat",
    preload: true,
    spriteSheet: {
      sourceColumns: 5,
      sourceRows: 1,
      poseBounds: { width: 68, height: 110 },
      frames: [
        { sourceFrame: 0, offsetY: 1 },
        { sourceFrame: 0 },
        { sourceFrame: 1 },
        { sourceFrame: 1, flipX: true },
        { sourceFrame: 2 },
        { sourceFrame: 2, offsetY: 2 },
        { sourceFrame: 0 },
        { sourceFrame: 3 },
        { sourceFrame: 0 },
        { sourceFrame: 4 },
        { sourceFrame: 4, flipX: true, offsetY: -1 },
        { sourceFrame: 0, rotateDegrees: 7 },
        { sourceFrame: 4, rotateDegrees: 90 }
      ]
    }
  },
  {
    id: "asset.outpost.raider",
    authoringSource: "assets-src/outpost/combat/raider.webp",
    runtimeUrl: "/assets/outpost/combat/raider.webp",
    runtimeFormat: "webp",
    width: 128,
    height: 128,
    fit: "contain",
    padding: 8,
    group: "combat",
    preload: true
  },
  {
    id: "asset.outpost.turret",
    authoringSource: "assets-src/outpost/combat/turret.webp",
    runtimeUrl: "/assets/outpost/combat/turret.webp",
    runtimeFormat: "webp",
    width: 128,
    height: 128,
    fit: "contain",
    padding: 8,
    group: "combat",
    preload: true
  },
  {
    id: "asset.outpost.projectile",
    authoringSource: "assets-src/outpost/combat/projectile.webp",
    runtimeUrl: "/assets/outpost/combat/projectile.webp",
    runtimeFormat: "webp",
    width: 48,
    height: 48,
    fit: "contain",
    padding: 4,
    group: "combat",
    preload: true
  },
  {
    id: "asset.outpost.overseer",
    authoringSource: "assets-src/outpost/boss/overseer.webp",
    runtimeUrl: "/assets/outpost/boss/overseer.webp",
    runtimeFormat: "webp",
    width: 192,
    height: 192,
    fit: "contain",
    padding: 8,
    group: "boss",
    preload: false,
    lazy: true
  }
];
