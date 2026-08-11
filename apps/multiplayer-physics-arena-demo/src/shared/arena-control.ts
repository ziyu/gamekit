import type { PhysicsBodyPatch, PhysicsVector } from "@gamekit/physics-core";

import { ARENA_JUMP_SPEED, ARENA_MOVE_SPEED, type ArenaActorControl } from "./config";

export type ArenaActorControlPatch = {
  memberId: string;
  patch: PhysicsBodyPatch;
};

/** Maps the same gameplay motor into authority and predicted-island body commands. */
export function createArenaActorMotionPatch(
  control: ArenaActorControl,
  currentVelocity: PhysicsVector
): PhysicsBodyPatch {
  const length = Math.hypot(control.moveX, control.moveZ);
  const scale = length > 1 ? 1 / length : 1;
  const canJump = control.jump && Math.abs(currentVelocity.y) < 0.35;
  return {
    linearVelocity: {
      x: control.moveX * scale * ARENA_MOVE_SPEED,
      y: canJump ? ARENA_JUMP_SPEED : currentVelocity.y,
      z: control.moveZ * scale * ARENA_MOVE_SPEED
    }
  };
}

export function createArenaActorControlPatches(
  controlsByMemberId: Readonly<Record<string, ArenaActorControl>>,
  resolveVelocity: (memberId: string) => PhysicsVector | undefined
): ArenaActorControlPatch[] {
  return Object.entries(controlsByMemberId)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([memberId, control]) => {
      const velocity = resolveVelocity(memberId);
      return velocity === undefined
        ? []
        : [{ memberId, patch: createArenaActorMotionPatch(control, velocity) }];
    });
}
