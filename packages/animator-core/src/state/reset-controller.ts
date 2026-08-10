import type { AnimatorControllerState } from "./controller-state";
import { resetAnimatorParameterStore } from "./parameter-store";

export function resetAnimatorControllerState(
  state: AnimatorControllerState,
  elapsed: number,
  generation?: number
): number {
  state.generation = generation ?? state.generation + 1;
  resetAnimatorParameterStore(state);
  for (const layer of state.layers.values()) {
    layer.stateId = layer.definition.initialState;
    layer.stateEnteredAt = elapsed;
    layer.lastStateTimeMs = 0;
    layer.lastStateUpdatedAt = elapsed;
    layer.oneShot = undefined;
    layer.queuedOneShots.length = 0;
    layer.gameplayPhase = undefined;
    layer.playbackSerial += 1;
  }
  state.markerKeys.clear();
  state.markerOrder.length = 0;
  state.dirty = true;
  state.reasons.add("reset");
  return state.generation;
}
