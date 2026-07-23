import type { AnimatorStateDefinition } from "../graph/graph-definition";
import type { AnimatorControllerState, AnimatorLayerState } from "./controller-state";

export function resolveAnimatorStatePlaybackSpeed(
  state: AnimatorControllerState,
  definition: AnimatorStateDefinition
): number {
  const baseSpeed = definition.speed ?? 1;
  if (definition.speedParameter === undefined) {
    return baseSpeed;
  }
  const parameter = state.parameters.get(definition.speedParameter);
  return baseSpeed * (typeof parameter === "number" ? Math.max(0, parameter) : 0);
}

export function advanceAnimatorStatePlayback(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  definition: AnimatorStateDefinition,
  elapsed: number
): { speed: number; timeMs: number } {
  const speed = resolveAnimatorStatePlaybackSpeed(state, definition);
  const deltaMs = Math.max(0, elapsed - layer.lastStateUpdatedAt);
  const timeMs = layer.lastStateTimeMs + deltaMs * speed;
  layer.lastStateTimeMs = timeMs;
  layer.lastStateUpdatedAt = elapsed;
  return { speed, timeMs };
}
