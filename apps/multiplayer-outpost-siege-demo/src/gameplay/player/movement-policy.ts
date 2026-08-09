import type { OutpostMovementProfileDefinition } from "../../domain";

export type OutpostMovementState = {
  velocityX: number;
  velocityY: number;
  facing: number;
  dashSequence: number;
  dashRemainingMs: number;
  dashDirectionX: number;
  dashDirectionY: number;
};

export type OutpostMovementInput = {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  dashSequence: number;
};

export type OutpostMovementStepOptions = {
  deltaMs: number;
  position: { x: number; y: number };
  acceptDashInput?: boolean | undefined;
};

export function createOutpostMovementState(
  input: Partial<OutpostMovementState> = {}
): OutpostMovementState {
  return {
    velocityX: input.velocityX ?? 0,
    velocityY: input.velocityY ?? 0,
    facing: input.facing ?? 0,
    dashSequence: input.dashSequence ?? 0,
    dashRemainingMs: input.dashRemainingMs ?? 0,
    dashDirectionX: input.dashDirectionX ?? 0,
    dashDirectionY: input.dashDirectionY ?? 0
  };
}

export function advanceOutpostMovement(
  state: OutpostMovementState,
  input: OutpostMovementInput,
  profile: OutpostMovementProfileDefinition,
  options: OutpostMovementStepOptions
): OutpostMovementState {
  updateFacing(state, input, options.position);
  if (
    options.acceptDashInput !== false &&
    isNewerOutpostInputSequence(input.dashSequence, state.dashSequence)
  ) {
    startOutpostDash(state, input, profile, options.position, input.dashSequence);
  }

  const deltaMs = Math.max(0, options.deltaMs);
  if (
    state.dashRemainingMs > 0 &&
    state.dashRemainingMs < profile.dashDurationMs &&
    state.velocityX * state.dashDirectionX + state.velocityY * state.dashDirectionY <
      profile.dashSpeed * profile.dashCollisionVelocityRatio
  ) {
    state.dashRemainingMs = 0;
  }
  if (state.dashRemainingMs > 0) {
    state.velocityX = state.dashDirectionX * profile.dashSpeed;
    state.velocityY = state.dashDirectionY * profile.dashSpeed;
    state.dashRemainingMs = Math.max(0, state.dashRemainingMs - deltaMs);
    return state;
  }

  const direction = normalized(input.moveX, input.moveY);
  const targetX = direction.x * profile.maxSpeed;
  const targetY = direction.y * profile.maxSpeed;
  const targetMagnitude = Math.hypot(targetX, targetY);
  const currentMagnitude = Math.hypot(state.velocityX, state.velocityY);
  const rate = targetMagnitude < currentMagnitude ? profile.deceleration : profile.acceleration;
  const maximumDelta = rate * (deltaMs / 1_000);
  const next = moveVectorToward(
    { x: state.velocityX, y: state.velocityY },
    { x: targetX, y: targetY },
    maximumDelta
  );
  state.velocityX = next.x;
  state.velocityY = next.y;
  return state;
}

export function startOutpostDash(
  state: OutpostMovementState,
  input: Pick<OutpostMovementInput, "moveX" | "moveY" | "aimX" | "aimY">,
  profile: OutpostMovementProfileDefinition,
  position: { x: number; y: number },
  dashSequence: number
): OutpostMovementState {
  const movementDirection = normalized(input.moveX, input.moveY);
  const aimDirection = normalized(input.aimX - position.x, input.aimY - position.y);
  const fallbackDirection = { x: Math.cos(state.facing), y: Math.sin(state.facing) };
  const direction =
    movementDirection.length > 0
      ? movementDirection
      : aimDirection.length > 0
        ? aimDirection
        : fallbackDirection;
  state.dashSequence = dashSequence >>> 0;
  state.dashRemainingMs = profile.dashDurationMs;
  state.dashDirectionX = direction.x;
  state.dashDirectionY = direction.y;
  state.velocityX = direction.x * profile.dashSpeed;
  state.velocityY = direction.y * profile.dashSpeed;
  return state;
}

export function acknowledgeOutpostDashSequence(
  state: OutpostMovementState,
  dashSequence: number
): void {
  if (isNewerOutpostInputSequence(dashSequence, state.dashSequence)) {
    state.dashSequence = dashSequence >>> 0;
  }
}

export function isNewerOutpostInputSequence(candidate: number, current: number): boolean {
  const difference = (candidate - current) >>> 0;
  return difference !== 0 && difference < 0x8000_0000;
}

function updateFacing(
  state: OutpostMovementState,
  input: Pick<OutpostMovementInput, "aimX" | "aimY">,
  position: { x: number; y: number }
): void {
  const aimX = input.aimX - position.x;
  const aimY = input.aimY - position.y;
  if (aimX !== 0 || aimY !== 0) {
    state.facing = Math.atan2(aimY, aimX);
  }
}

function normalized(x: number, y: number): { x: number; y: number; length: number } {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0, length: 0 } : { x: x / length, y: y / length, length };
}

function moveVectorToward(
  current: { x: number; y: number },
  target: { x: number; y: number },
  maximumDelta: number
): { x: number; y: number } {
  const deltaX = target.x - current.x;
  const deltaY = target.y - current.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0 || distance <= maximumDelta) {
    return target;
  }
  const scale = maximumDelta / distance;
  return { x: current.x + deltaX * scale, y: current.y + deltaY * scale };
}
