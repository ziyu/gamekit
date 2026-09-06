import { createAnimatorError } from "../contracts/errors";
import type { AnimatorControllerState } from "../state/controller-state";
import { markAnimatorControllerDirty, resolveAnimatorClip } from "../state/controller-state";
import { resetAnimatorControllerState } from "../state/reset-controller";
import type { AnimatorPhaseMapping } from "../graph/binding-definition";
import type { AnimationClipDefinition } from "../graph/clip-definition";
import type { AnimatorGameplayPhase } from "./gameplay-phase";

export type AnimatorGameplayPhaseSyncResult =
  | {
      status: "synced";
      resetGeneration?: number | undefined;
      executionId: string;
      abilityId: string;
      phase: string;
      seekTimeMs: number;
      predicted: boolean;
    }
  | {
      status: "stale";
      executionId: string;
      generation: number;
      currentGeneration: number;
    }
  | {
      status: "mapping-missing";
      resetGeneration?: number | undefined;
      abilityId: string;
      phase: string;
    };

export function syncAnimatorGameplayPhase(
  state: AnimatorControllerState,
  phase: AnimatorGameplayPhase,
  elapsed: number
): AnimatorGameplayPhaseSyncResult {
  validateGameplayPhase(state, phase);
  if (phase.generation !== undefined && phase.generation < state.generation) {
    return {
      status: "stale",
      executionId: phase.executionId,
      generation: phase.generation,
      currentGeneration: state.generation
    };
  }
  const resetGeneration =
    phase.generation !== undefined && phase.generation > state.generation
      ? resetAnimatorControllerState(state, elapsed, phase.generation)
      : undefined;
  const mapping = animatorPhaseMappingFor(state, phase);
  if (mapping === undefined) {
    return {
      status: "mapping-missing",
      ...(resetGeneration === undefined ? {} : { resetGeneration }),
      abilityId: phase.abilityId,
      phase: phase.phase
    };
  }
  const layer = state.layers.get(mapping.layer);
  if (layer === undefined) {
    return {
      status: "mapping-missing",
      ...(resetGeneration === undefined ? {} : { resetGeneration }),
      abilityId: phase.abilityId,
      phase: phase.phase
    };
  }
  const clip = resolveAnimatorClip(state, mapping.clip);
  const speed = animatorPhasePlaybackSpeed(phase, mapping, clip);
  const currentTime = Math.max(0, elapsed - phase.startedAt) * speed;
  layer.gameplayPhase = {
    phase: { ...phase },
    mapping: { ...mapping },
    lastTimeMs: currentTime,
    seek: true
  };
  layer.oneShot = undefined;
  layer.queuedOneShots.length = 0;
  layer.playbackSerial += 1;
  markAnimatorControllerDirty(state, `phase:${phase.phase}`);
  return {
    status: "synced",
    ...(resetGeneration === undefined ? {} : { resetGeneration }),
    executionId: phase.executionId,
    abilityId: phase.abilityId,
    phase: phase.phase,
    seekTimeMs: currentTime,
    predicted: phase.predicted ?? false
  };
}

export function cancelAnimatorGameplayPhase(
  state: AnimatorControllerState,
  executionId: string,
  elapsed: number
): boolean {
  let changed = false;
  for (const layer of state.layers.values()) {
    if (layer.gameplayPhase?.phase.executionId === executionId) {
      layer.gameplayPhase = undefined;
      layer.lastStateUpdatedAt = elapsed;
      layer.playbackSerial += 1;
      changed = true;
    }
  }
  if (changed) {
    markAnimatorControllerDirty(state, "phase-cancelled");
  }
  return changed;
}

export function animatorPhasePlaybackSpeed(
  phase: AnimatorGameplayPhase,
  mapping: AnimatorPhaseMapping,
  clip: AnimationClipDefinition
): number {
  const declaredSpeed = mapping.speed ?? 1;
  const loops = mapping.loop ?? clip.loop ?? false;
  return !loops && phase.durationMs !== undefined && phase.durationMs > 0
    ? declaredSpeed * (clip.durationMs / phase.durationMs)
    : declaredSpeed;
}

function animatorPhaseMappingFor(
  state: AnimatorControllerState,
  phase: AnimatorGameplayPhase
): AnimatorPhaseMapping | undefined {
  return (
    state.definition.phaseMappings?.find(
      (mapping) => mapping.phase === phase.phase && mapping.abilityId === phase.abilityId
    ) ??
    state.definition.phaseMappings?.find(
      (mapping) => mapping.phase === phase.phase && mapping.abilityId === undefined
    )
  );
}

function validateGameplayPhase(state: AnimatorControllerState, phase: AnimatorGameplayPhase): void {
  if (
    !phase.executionId ||
    !phase.abilityId ||
    !phase.phase ||
    !Number.isFinite(phase.startedAt) ||
    (phase.durationMs !== undefined &&
      (!Number.isFinite(phase.durationMs) || phase.durationMs < 0)) ||
    (phase.generation !== undefined &&
      (!Number.isSafeInteger(phase.generation) || phase.generation < 0))
  ) {
    throw createAnimatorError("animator.invalid_config", "Animator gameplay phase is invalid", {
      controllerId: state.binding.controllerId,
      executionId: phase.executionId
    });
  }
}
