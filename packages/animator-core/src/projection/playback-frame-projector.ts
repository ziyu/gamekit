import type { AnimatorControllerState, AnimatorLayerState } from "../state/controller-state";
import { resolveAnimatorClip, resolveAnimatorLayerState } from "../state/controller-state";
import { cloneRenderTarget } from "../graph/clone-definitions";
import type { AnimationClipDefinition } from "../graph/clip-definition";
import type { AnimatorMarkerEvent } from "../marker/marker-event";
import { animatorPhasePlaybackSpeed } from "../phase/gameplay-phase-controller";
import { resolveAnimatorStatePlaybackSpeed } from "../state/state-playback";
import type {
  AnimationPlaybackFrame,
  AnimationPlaybackLayerFrame
} from "../playback/playback-frame";

export function buildAnimationPlaybackFrame(
  state: AnimatorControllerState,
  timestamp: number,
  markers: AnimatorMarkerEvent[]
): AnimationPlaybackFrame {
  const layers = [...state.layers.values()]
    .sort((left, right) =>
      (left.definition.priority ?? 0) === (right.definition.priority ?? 0)
        ? left.definition.id.localeCompare(right.definition.id)
        : (left.definition.priority ?? 0) - (right.definition.priority ?? 0)
    )
    .map((layer) => buildLayerFrame(state, layer, timestamp));
  return {
    controllerId: state.binding.controllerId,
    renderObjectId: state.binding.renderObjectId,
    generation: state.generation,
    timestamp,
    layers,
    markers: markers.map((marker) => ({ ...marker })),
    reasons: [...state.reasons].sort()
  };
}

function buildLayerFrame(
  state: AnimatorControllerState,
  layer: AnimatorLayerState,
  timestamp: number
): AnimationPlaybackLayerFrame {
  const playbackChanged = layer.lastEmittedPlaybackSerial !== layer.playbackSerial;
  layer.lastEmittedPlaybackSerial = layer.playbackSerial;
  if (layer.gameplayPhase !== undefined) {
    const active = layer.gameplayPhase;
    const clip = resolveAnimatorClip(state, active.mapping.clip);
    const speed = animatorPhasePlaybackSpeed(active.phase, active.mapping, clip);
    const rawTime = Math.max(0, timestamp - active.phase.startedAt) * speed;
    const loop = active.mapping.loop ?? clip.loop ?? false;
    const frame = createLayerFrame(
      layer,
      clip,
      "gameplay-phase",
      rawTime,
      speed,
      loop,
      playbackChanged || active.seek
    );
    active.seek = false;
    return frame;
  }
  if (layer.oneShot !== undefined) {
    const active = layer.oneShot;
    const clip = resolveAnimatorClip(state, active.definition.clip);
    const speed = active.definition.speed ?? 1;
    return createLayerFrame(
      layer,
      clip,
      "one-shot",
      Math.max(0, timestamp - active.startedAt) * speed,
      speed,
      false,
      playbackChanged
    );
  }
  const graphState = resolveAnimatorLayerState(layer);
  const clip = resolveAnimatorClip(state, graphState.clip);
  const speed = resolveAnimatorStatePlaybackSpeed(state, graphState);
  return {
    ...createLayerFrame(
      layer,
      clip,
      "state",
      layer.lastStateTimeMs,
      speed,
      graphState.loop ?? clip.loop ?? false,
      playbackChanged
    ),
    stateId: graphState.id
  };
}

function createLayerFrame(
  layer: AnimatorLayerState,
  clip: AnimationClipDefinition,
  kind: AnimationPlaybackLayerFrame["kind"],
  rawTime: number,
  speed: number,
  loop: boolean,
  seek: boolean
): AnimationPlaybackLayerFrame {
  const timeMs = loop ? rawTime % clip.durationMs : Math.min(rawTime, clip.durationMs);
  return {
    layerId: layer.definition.id,
    clipId: clip.id,
    ...(clip.backendClip === undefined ? {} : { backendClip: clip.backendClip }),
    asset: { ...clip.asset },
    kind,
    timeMs,
    normalizedTime: Math.max(0, Math.min(1, timeMs / clip.durationMs)),
    speed,
    loop,
    weight: layer.definition.weight ?? 1,
    mode: layer.definition.mode ?? "replace",
    ...(layer.definition.target === undefined
      ? {}
      : { target: cloneRenderTarget(layer.definition.target) }),
    seek
  };
}
