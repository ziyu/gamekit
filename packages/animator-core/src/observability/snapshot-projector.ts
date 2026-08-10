import type { AnimatorControllerState, AnimatorLayerState } from "../state/controller-state";
import type { AnimatorControllerSnapshot, AnimatorLayerSnapshot } from "./animator-snapshot";

export function projectAnimatorControllerSnapshot(
  state: AnimatorControllerState
): AnimatorControllerSnapshot {
  return {
    binding: { ...state.binding },
    generation: state.generation,
    parameters: Object.fromEntries(
      [...state.parameters.entries()].sort(([left], [right]) => left.localeCompare(right))
    ),
    layers: [...state.layers.values()]
      .sort((left, right) => left.definition.id.localeCompare(right.definition.id))
      .map(projectAnimatorLayerSnapshot),
    dirty: state.dirty,
    emittedMarkers: state.emittedMarkers
  };
}

function projectAnimatorLayerSnapshot(layer: AnimatorLayerState): AnimatorLayerSnapshot {
  return {
    layerId: layer.definition.id,
    stateId: layer.stateId,
    stateEnteredAt: layer.stateEnteredAt,
    ...(layer.oneShot === undefined ? {} : { activeOneShotId: layer.oneShot.definition.id }),
    queuedOneShots: layer.queuedOneShots.length,
    ...(layer.gameplayPhase === undefined
      ? {}
      : { phaseExecutionId: layer.gameplayPhase.phase.executionId })
  };
}
