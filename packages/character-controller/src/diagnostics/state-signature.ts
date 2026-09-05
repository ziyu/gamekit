import type { CharacterMotorState, CharacterMotorStepResult } from "../contracts";

export function characterMotorStateSignature(state: Readonly<CharacterMotorState>): string {
  return JSON.stringify([
    state.mode,
    state.grounded,
    vectorTuple(state.groundNormal),
    state.groundBodyId ?? null,
    state.surfaceId ?? null,
    vectorTuple(state.inheritedPlatformVelocity),
    round(state.facingYaw),
    round(state.coyoteRemainingMs),
    round(state.jumpBufferRemainingMs),
    round(state.jumpHoldRemainingMs),
    round(state.diveRemainingMs),
    round(state.diveCooldownRemainingMs),
    round(state.recoveryRemainingMs),
    round(state.staggerRemainingMs),
    round(state.airborneTimeMs),
    state.lastConsumedJumpSequence,
    state.lastConsumedDiveSequence,
    state.lastStableTick
  ]);
}

export function characterMotorCommandSignature(result: CharacterMotorStepResult): string {
  return JSON.stringify({
    patch: result.bodyPatch,
    commands: result.bodyCommands,
    state: characterMotorStateSignature(result.state)
  });
}

function vectorTuple(vector: { x: number; y: number; z?: number }): number[] {
  return [round(vector.x), round(vector.y), round(vector.z ?? 0)];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
