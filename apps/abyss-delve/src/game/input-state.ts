import type { AbyssInputState } from "./types";

export function createAbyssInputState(): AbyssInputState {
  return {
    moveX: 0,
    moveY: 0,
    held: {
      up: false,
      down: false,
      left: false,
      right: false
    },
    aimX: 1,
    aimY: 0,
    attackRequested: false,
    skillPrimaryRequested: false,
    skillSecondaryRequested: false,
    dodgeRequested: false,
    interactRequested: false,
    inventoryToggleRequested: false,
    pauseToggleRequested: false,
    gameplayBlocked: false
  };
}
