import { createAnimatorError } from "../contracts/errors";
import type { AnimatorOneShotDefinition } from "../graph/graph-definition";
import {
  markAnimatorControllerDirty,
  type AnimatorControllerState,
  type AnimatorLayerState
} from "../state/controller-state";

export type AnimatorOneShotRecord = {
  kind: "started" | "completed" | "queue-full";
  oneShotId: string;
  layerId: string;
};

export function triggerAnimatorOneShot(
  state: AnimatorControllerState,
  oneShotId: string,
  elapsed: number,
  maxQueuedOneShots: number
): AnimatorOneShotRecord[] {
  const definition = state.oneShots.get(oneShotId);
  if (definition === undefined) {
    const parameter = state.parameterDefinitions.get(oneShotId);
    if (parameter?.type === "trigger") {
      state.triggers.add(oneShotId);
      markAnimatorControllerDirty(state, `trigger:${oneShotId}`);
      return [];
    }
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator one-shot is missing: ${oneShotId}`,
      { controllerId: state.binding.controllerId, oneShotId }
    );
  }
  const layer = state.layers.get(definition.layer);
  if (layer === undefined) {
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator one-shot layer is missing: ${definition.layer}`
    );
  }
  if (layer.gameplayPhase !== undefined) {
    return enqueueAnimatorOneShot(state, layer, definition, maxQueuedOneShots);
  }
  const active = layer.oneShot;
  if (active === undefined) {
    return [startAnimatorOneShot(state, layer, definition, elapsed)];
  }
  if (active.definition.id === oneShotId) {
    switch (definition.repeat ?? "ignore") {
      case "ignore":
      case "merge":
        return [];
      case "restart":
        return [startAnimatorOneShot(state, layer, definition, elapsed)];
      case "queue-one":
        return layer.queuedOneShots.includes(oneShotId)
          ? []
          : enqueueAnimatorOneShot(state, layer, definition, maxQueuedOneShots);
    }
  }
  const activePolicy = active.definition.interrupt ?? "higher-priority";
  const canInterrupt =
    activePolicy === "always" ||
    (activePolicy === "higher-priority" &&
      (definition.priority ?? 0) > (active.definition.priority ?? 0));
  return canInterrupt
    ? [startAnimatorOneShot(state, layer, definition, elapsed)]
    : enqueueAnimatorOneShot(state, layer, definition, maxQueuedOneShots);
}

export function completeAnimatorOneShot(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  elapsed: number
): AnimatorOneShotRecord[] {
  const active = layer.oneShot;
  if (active === undefined) {
    return [];
  }
  const completed: AnimatorOneShotRecord = {
    kind: "completed",
    oneShotId: active.definition.id,
    layerId: layer.definition.id
  };
  layer.oneShot = undefined;
  const nextId = layer.queuedOneShots.shift();
  if (nextId !== undefined) {
    const next = state.oneShots.get(nextId);
    if (next !== undefined) {
      return [startAnimatorOneShot(state, layer, next, elapsed), completed];
    }
  }
  layer.playbackSerial += 1;
  layer.stateEnteredAt = elapsed;
  layer.lastStateTimeMs = 0;
  layer.lastStateUpdatedAt = elapsed;
  markAnimatorControllerDirty(state, `one-shot-complete:${completed.oneShotId}`);
  return [completed];
}

function enqueueAnimatorOneShot(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  definition: AnimatorOneShotDefinition,
  maxQueuedOneShots: number
): AnimatorOneShotRecord[] {
  const controllerQueued = [...state.layers.values()].reduce(
    (total, candidate) => total + candidate.queuedOneShots.length,
    0
  );
  const layerLimit = Math.min(definition.maxQueue ?? 1, maxQueuedOneShots);
  if (controllerQueued >= maxQueuedOneShots || layer.queuedOneShots.length >= layerLimit) {
    return [
      {
        kind: "queue-full",
        oneShotId: definition.id,
        layerId: layer.definition.id
      }
    ];
  }
  layer.queuedOneShots.push(definition.id);
  markAnimatorControllerDirty(state, `one-shot-queued:${definition.id}`);
  return [];
}

function startAnimatorOneShot(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  definition: AnimatorOneShotDefinition,
  elapsed: number
): AnimatorOneShotRecord {
  layer.oneShot = { definition: { ...definition }, startedAt: elapsed, lastTimeMs: 0 };
  layer.playbackSerial += 1;
  markAnimatorControllerDirty(state, `one-shot:${definition.id}`);
  return {
    kind: "started",
    oneShotId: definition.id,
    layerId: definition.layer
  };
}
