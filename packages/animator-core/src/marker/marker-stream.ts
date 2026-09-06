import type { AnimatorControllerState, AnimatorLayerState } from "../state/controller-state";
import type { AnimationClipDefinition } from "../graph/clip-definition";
import type { AnimatorMarkerEvent } from "./marker-event";

export type AnimatorMarkerCollection = {
  events: AnimatorMarkerEvent[];
  truncated: boolean;
};

export function collectAnimatorMarkers(options: {
  state: AnimatorControllerState;
  layer: AnimatorLayerState;
  clip: AnimationClipDefinition;
  previousTime: number;
  currentTime: number;
  loop: boolean;
  timestamp: number;
  markerHistoryLimit: number;
  maxEvents: number;
  executionId?: string | undefined;
}): AnimatorMarkerCollection {
  const { state, layer, clip, previousTime, currentTime, loop } = options;
  if (clip.markers === undefined || clip.markers.length === 0) {
    return { events: [], truncated: false };
  }
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
    return { events: [], truncated: currentTime > previousTime };
  }
  if (currentTime <= previousTime) {
    return { events: [], truncated: false };
  }
  const candidates: Array<{ key: string; event: AnimatorMarkerEvent }> = [];
  const firstCycle = loop ? Math.floor(previousTime / clip.durationMs) : 0;
  const lastCycle = loop ? Math.floor(currentTime / clip.durationMs) : 0;
  let truncated = false;
  let cycle = lastCycle;
  markerSearch: while (cycle >= firstCycle) {
    const cycleStart = loop ? cycle * clip.durationMs : 0;
    for (let markerIndex = clip.markers.length - 1; markerIndex >= 0; markerIndex -= 1) {
      const marker = clip.markers[markerIndex];
      if (marker === undefined) {
        continue;
      }
      const absoluteTime = cycleStart + marker.timeMs;
      if (absoluteTime <= previousTime || absoluteTime > currentTime) {
        continue;
      }
      const markerKey = `${state.generation}:${layer.definition.id}:${layer.playbackSerial}:${cycle}:${marker.id}`;
      if (state.markerKeys.has(markerKey)) {
        continue;
      }
      if (candidates.length >= options.maxEvents) {
        truncated = true;
        break markerSearch;
      }
      candidates.push({
        key: markerKey,
        event: {
          id: `${state.binding.controllerId}:${markerKey}`,
          controllerId: state.binding.controllerId,
          layerId: layer.definition.id,
          clipId: clip.id,
          markerId: marker.id,
          timestamp: options.timestamp,
          generation: state.generation,
          ...(options.executionId === undefined ? {} : { executionId: options.executionId }),
          ...(marker.tags === undefined ? {} : { tags: [...marker.tags] })
        }
      });
    }
    if (!loop) {
      break;
    }
    const nextCycle = cycle - 1;
    if (nextCycle === cycle) {
      truncated = cycle > firstCycle;
      break;
    }
    cycle = nextCycle;
  }
  candidates.reverse();
  for (const candidate of candidates) {
    retainMarkerKey(state, candidate.key, options.markerHistoryLimit);
    state.emittedMarkers += 1;
  }
  return { events: candidates.map((candidate) => candidate.event), truncated };
}

function retainMarkerKey(
  state: AnimatorControllerState,
  key: string,
  markerHistoryLimit: number
): void {
  if (markerHistoryLimit === 0) {
    return;
  }
  state.markerKeys.add(key);
  state.markerOrder.push(key);
  while (state.markerOrder.length > markerHistoryLimit) {
    const removed = state.markerOrder.shift();
    if (removed !== undefined) {
      state.markerKeys.delete(removed);
    }
  }
}
