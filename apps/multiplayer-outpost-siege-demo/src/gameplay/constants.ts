import { OUTPOST_ARENA } from "../content/arena-scene";

export const OUTPOST_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export { OUTPOST_ARENA };
export const OUTPOST_NETWORK_TIMING = Object.freeze({
  tickRateHz: 20,
  tickMs: 1000 / 20
});
export const OUTPOST_COLYSEUS_SCHEMA_VERSION = "outpost.field-state.v10";
export const OUTPOST_PREVIEW_SEED = "outpost-siege.preview.v1";
export const OUTPOST_PREVIEW_PLAYER_ID = "outpost.preview.player";

export const OUTPOST_PRESENTATION_SIZE = Object.freeze({
  "render.outpost.arena": { width: OUTPOST_ARENA.width, height: OUTPOST_ARENA.height, depth: 0 },
  "render.outpost.player": { width: 96, height: 96, depth: 20 },
  "render.outpost.raider": { width: 88, height: 88, depth: 18 },
  "render.outpost.overseer": { width: 144, height: 144, depth: 18 },
  "render.outpost.turret": { width: 88, height: 88, depth: 16 },
  "render.outpost.projectile": { width: 26, height: 26, depth: 19 },
  "render.outpost.feedback.crosshair": { width: 54, height: 54, depth: 40 },
  "render.outpost.feedback.tracer": { width: 118, height: 15, depth: 30 },
  "render.outpost.feedback.impact": { width: 58, height: 58, depth: 31 },
  "render.outpost.feedback.damage-direction": { width: 62, height: 31, depth: 41 }
});
