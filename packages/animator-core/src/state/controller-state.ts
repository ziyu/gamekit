import type { AnimationClipDefinition } from "../graph/clip-definition";
import type { AnimatorBindingDefinition, AnimatorPhaseMapping } from "../graph/binding-definition";
import type {
  AnimatorLayerDefinition,
  AnimatorOneShotDefinition,
  AnimatorParameterDefinition,
  AnimatorStateDefinition,
  AnimatorTransitionDefinition
} from "../graph/graph-definition";
import type { AnimatorGameplayPhase } from "../phase/gameplay-phase";
import { createAnimatorError } from "../contracts/errors";
import type {
  AnimatorControllerBinding,
  AnimatorParameterValue
} from "../contracts/controller-binding";

export type ActiveAnimatorOneShot = {
  definition: AnimatorOneShotDefinition;
  startedAt: number;
  lastTimeMs: number;
};

export type ActiveAnimatorGameplayPhase = {
  phase: AnimatorGameplayPhase;
  mapping: AnimatorPhaseMapping;
  lastTimeMs: number;
  seek: boolean;
};

export type CompiledAnimatorTransition = {
  definition: AnimatorTransitionDefinition;
  sourceIndex: number;
};

export type AnimatorLayerState = {
  definition: AnimatorLayerDefinition;
  states: Map<string, AnimatorStateDefinition>;
  transitions: CompiledAnimatorTransition[];
  stateId: string;
  stateEnteredAt: number;
  lastStateTimeMs: number;
  lastStateUpdatedAt: number;
  oneShot: ActiveAnimatorOneShot | undefined;
  queuedOneShots: string[];
  gameplayPhase: ActiveAnimatorGameplayPhase | undefined;
  playbackSerial: number;
  lastEmittedPlaybackSerial: number;
};

export type AnimatorControllerState = {
  binding: AnimatorControllerBinding;
  definition: AnimatorBindingDefinition;
  clips: Map<string, AnimationClipDefinition>;
  oneShots: Map<string, AnimatorOneShotDefinition>;
  parameters: Map<string, AnimatorParameterValue>;
  parameterDefinitions: Map<string, AnimatorParameterDefinition>;
  triggers: Set<string>;
  layers: Map<string, AnimatorLayerState>;
  generation: number;
  dirty: boolean;
  reasons: Set<string>;
  markerKeys: Set<string>;
  markerOrder: string[];
  emittedMarkers: number;
};

export function markAnimatorControllerDirty(state: AnimatorControllerState, reason: string): void {
  state.dirty = true;
  state.reasons.add(reason);
}

export function resolveAnimatorClip(
  state: AnimatorControllerState,
  alias: string
): AnimationClipDefinition {
  const resolvedAlias =
    state.clips.get(alias) === undefined ? state.definition.fallbackClip : alias;
  if (resolvedAlias === undefined) {
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator clip alias is missing: ${alias}`,
      {
        controllerId: state.binding.controllerId,
        bindingId: state.definition.id
      }
    );
  }
  const clip = state.clips.get(resolvedAlias);
  if (clip === undefined) {
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator fallback clip alias is missing: ${resolvedAlias}`
    );
  }
  return clip;
}

export function resolveAnimatorLayerState(layer: AnimatorLayerState): AnimatorStateDefinition {
  const state = layer.states.get(layer.stateId);
  if (state === undefined) {
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator state is missing: ${layer.definition.id}/${layer.stateId}`
    );
  }
  return state;
}
