import { completeAnimatorOneShot, type AnimatorOneShotRecord } from "../action/one-shot-controller";
import type { AnimatorMarkerEvent } from "../marker/marker-event";
import { collectAnimatorMarkers } from "../marker/marker-stream";
import type { AnimationClipDefinition } from "../graph/clip-definition";
import { animatorPhasePlaybackSpeed } from "../phase/gameplay-phase-controller";
import { buildAnimationPlaybackFrame } from "../projection/playback-frame-projector";
import type { AnimationPlaybackFrame } from "../playback/playback-frame";
import type { AnimatorControllerState, AnimatorLayerState } from "../state/controller-state";
import { resolveAnimatorClip, resolveAnimatorLayerState } from "../state/controller-state";
import { advanceAnimatorStatePlayback } from "../state/state-playback";
import {
  evaluateAnimatorTransitions,
  type AnimatorTransitionRecord
} from "../state/transition-evaluator";

export type AnimatorControllerUpdate = {
  frame: AnimationPlaybackFrame | undefined;
  markers: AnimatorMarkerEvent[];
  transitions: AnimatorTransitionRecord[];
  oneShots: AnimatorOneShotRecord[];
  markerTruncations: string[];
};

export function updateAnimatorController(
  state: AnimatorControllerState,
  elapsed: number,
  markerHistoryLimit: number,
  maxMarkerEventsPerControllerUpdate: number
): AnimatorControllerUpdate {
  const markers: AnimatorMarkerEvent[] = [];
  const markerTruncations: string[] = [];
  const oneShots: AnimatorOneShotRecord[] = [];
  const wasDirty = state.dirty;
  const transitions = evaluateAnimatorTransitions(state, elapsed);
  for (const layer of state.layers.values()) {
    updateAnimatorLayer(
      state,
      layer,
      elapsed,
      markerHistoryLimit,
      maxMarkerEventsPerControllerUpdate,
      markers,
      markerTruncations,
      oneShots
    );
  }
  const shouldEmit =
    wasDirty ||
    state.dirty ||
    markers.length > 0 ||
    [...state.layers.values()].some(
      (layer) => layer.oneShot !== undefined || layer.gameplayPhase !== undefined
    );
  const frame = shouldEmit ? buildAnimationPlaybackFrame(state, elapsed, markers) : undefined;
  state.dirty = false;
  state.reasons.clear();
  state.triggers.clear();
  return { frame, markers, transitions, oneShots, markerTruncations };
}

function updateAnimatorLayer(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  elapsed: number,
  markerHistoryLimit: number,
  maxMarkerEventsPerControllerUpdate: number,
  markers: AnimatorMarkerEvent[],
  markerTruncations: string[],
  oneShots: AnimatorOneShotRecord[]
): void {
  if (layer.gameplayPhase !== undefined) {
    const active = layer.gameplayPhase;
    const clip = resolveAnimatorClip(state, active.mapping.clip);
    const speed = animatorPhasePlaybackSpeed(active.phase, active.mapping, clip);
    const rawTime = Math.max(0, elapsed - active.phase.startedAt) * speed;
    appendAnimatorMarkers({
      state,
      layer,
      clip,
      previousTime: active.lastTimeMs,
      currentTime: rawTime,
      loop: active.mapping.loop ?? clip.loop ?? false,
      timestamp: elapsed,
      markerHistoryLimit,
      maxMarkerEventsPerControllerUpdate,
      markers,
      markerTruncations,
      executionId: active.phase.executionId
    });
    active.lastTimeMs = rawTime;
    return;
  }
  if (layer.oneShot !== undefined) {
    const active = layer.oneShot;
    const clip = resolveAnimatorClip(state, active.definition.clip);
    const speed = active.definition.speed ?? 1;
    const rawTime = Math.max(0, elapsed - active.startedAt) * speed;
    appendAnimatorMarkers({
      state,
      layer,
      clip,
      previousTime: active.lastTimeMs,
      currentTime: Math.min(rawTime, clip.durationMs),
      loop: false,
      timestamp: elapsed,
      markerHistoryLimit,
      maxMarkerEventsPerControllerUpdate,
      markers,
      markerTruncations
    });
    active.lastTimeMs = rawTime;
    if (rawTime >= clip.durationMs) {
      oneShots.push(...completeAnimatorOneShot(state, layer, elapsed));
    }
    return;
  }
  const graphState = resolveAnimatorLayerState(layer);
  const clip = resolveAnimatorClip(state, graphState.clip);
  const previousTime = layer.lastStateTimeMs;
  const { timeMs: rawTime } = advanceAnimatorStatePlayback(state, layer, graphState, elapsed);
  appendAnimatorMarkers({
    state,
    layer,
    clip,
    previousTime,
    currentTime: rawTime,
    loop: graphState.loop ?? clip.loop ?? false,
    timestamp: elapsed,
    markerHistoryLimit,
    maxMarkerEventsPerControllerUpdate,
    markers,
    markerTruncations
  });
}

function appendAnimatorMarkers(options: {
  state: AnimatorControllerState;
  layer: AnimatorLayerState;
  clip: AnimationClipDefinition;
  previousTime: number;
  currentTime: number;
  loop: boolean;
  timestamp: number;
  markerHistoryLimit: number;
  maxMarkerEventsPerControllerUpdate: number;
  markers: AnimatorMarkerEvent[];
  markerTruncations: string[];
  executionId?: string | undefined;
}): void {
  const collection = collectAnimatorMarkers({
    state: options.state,
    layer: options.layer,
    clip: options.clip,
    previousTime: options.previousTime,
    currentTime: options.currentTime,
    loop: options.loop,
    timestamp: options.timestamp,
    markerHistoryLimit: options.markerHistoryLimit,
    maxEvents: Math.max(0, options.maxMarkerEventsPerControllerUpdate - options.markers.length),
    ...(options.executionId === undefined ? {} : { executionId: options.executionId })
  });
  options.markers.push(...collection.events);
  if (collection.truncated) {
    options.markerTruncations.push(`${options.layer.definition.id}:${options.clip.id}`);
  }
}
