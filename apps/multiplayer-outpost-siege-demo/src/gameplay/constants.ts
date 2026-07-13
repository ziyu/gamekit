import { OUTPOST_ARENA } from "../content/arena-scene";

export const OUTPOST_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export { OUTPOST_ARENA };
export const OUTPOST_PREVIEW_SEED = "outpost-siege.preview.v1";
export const OUTPOST_PREVIEW_PLAYER_ID = "outpost.preview.player";

export const OUTPOST_PRESENTATION_SIZE = Object.freeze({
  "render.outpost.arena": { width: OUTPOST_ARENA.width, height: OUTPOST_ARENA.height, depth: 0 },
  "render.outpost.player": { width: 96, height: 96, depth: 20 },
  "render.outpost.raider": { width: 88, height: 88, depth: 18 },
  "render.outpost.overseer": { width: 144, height: 144, depth: 18 },
  "render.outpost.turret": { width: 88, height: 88, depth: 16 },
  "render.outpost.projectile": { width: 26, height: 26, depth: 19 }
});
