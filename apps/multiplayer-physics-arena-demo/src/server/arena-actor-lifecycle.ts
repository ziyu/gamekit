import type {
  PhysicsBodyPatch,
  PhysicsPredictionIsland,
  PhysicsVector
} from "@gamekit/physics-core";

import { createArenaActorMotionPatch } from "../shared/arena-control";
import type { ArenaActorControl, ArenaMatchPhase, ArenaMoveInput } from "../shared/config";

export type ArenaActorAuthorityAction =
  | { type: "none" }
  | { type: "patch"; patch: PhysicsBodyPatch }
  | { type: "despawn" };

export type ArenaActorAuthorityStep = {
  control: ArenaActorControl;
  action: ArenaActorAuthorityAction;
};

/** Resolves one authority tick without allowing an eliminated actor to re-enter the round. */
export function resolveArenaActorAuthorityStep(options: {
  phase: ArenaMatchPhase;
  eliminated: boolean;
  input: ArenaMoveInput;
  currentVelocity: PhysicsVector | undefined;
}): ArenaActorAuthorityStep {
  if (options.currentVelocity === undefined) {
    return { control: neutralControl(), action: { type: "none" } };
  }
  if (options.eliminated) {
    return { control: neutralControl(), action: { type: "despawn" } };
  }
  if (options.phase === "countdown" || options.phase === "lobby") {
    return {
      control: neutralControl(),
      action: {
        type: "patch",
        patch: { linearVelocity: { x: 0, y: 0, z: 0 } }
      }
    };
  }
  const control = actorControl(options.input);
  return {
    control,
    action: {
      type: "patch",
      patch: createArenaActorMotionPatch(control, options.currentVelocity)
    }
  };
}

/** Restores the initial full island only when a new round begins. */
export function resetArenaRoundPhysics(island: PhysicsPredictionIsland, round: number): void {
  island.reset(`round.${round}`, island.tick());
}

function neutralControl(): ArenaActorControl {
  return { moveX: 0, moveZ: 0, jump: false };
}

function actorControl(input: ArenaMoveInput): ArenaActorControl {
  return { moveX: input.moveX, moveZ: input.moveZ, jump: input.jump };
}
