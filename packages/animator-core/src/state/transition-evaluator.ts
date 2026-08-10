import type { AnimatorControllerState } from "./controller-state";
import { markAnimatorControllerDirty } from "./controller-state";
import { animatorConditionMatches } from "./parameter-store";

export type AnimatorTransitionRecord = {
  layerId: string;
  from: string;
  to: string;
};

export function evaluateAnimatorTransitions(
  state: AnimatorControllerState,
  elapsed: number
): AnimatorTransitionRecord[] {
  if (!state.dirty && state.triggers.size === 0) {
    return [];
  }
  const records: AnimatorTransitionRecord[] = [];
  for (const layer of state.layers.values()) {
    if (layer.gameplayPhase !== undefined || layer.oneShot !== undefined) {
      continue;
    }
    const transition = layer.transitions.find(
      ({ definition }) =>
        (definition.from === "*" || definition.from === layer.stateId) &&
        definition.to !== layer.stateId &&
        definition.conditions.every((condition) => animatorConditionMatches(state, condition))
    )?.definition;
    if (transition === undefined) {
      continue;
    }
    const previous = layer.stateId;
    layer.stateId = transition.to;
    layer.stateEnteredAt = elapsed;
    layer.lastStateTimeMs = 0;
    layer.lastStateUpdatedAt = elapsed;
    layer.playbackSerial += 1;
    markAnimatorControllerDirty(state, `transition:${previous}->${transition.to}`);
    records.push({ layerId: layer.definition.id, from: previous, to: transition.to });
  }
  return records;
}
