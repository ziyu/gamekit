import { describe, expect, it } from "vitest";

import {
  createArenaActorControlPatches,
  createArenaActorMotionPatch
} from "../shared/arena-control";
import { ARENA_MOVE_SPEED } from "../shared/config";

describe("Knockout Arena shared actor controls", () => {
  it("normalizes movement and preserves vertical collision velocity", () => {
    expect(
      createArenaActorMotionPatch({ moveX: 1, moveZ: -1, jump: false }, { x: -2, y: 3.25, z: 1 })
    ).toEqual({
      linearVelocity: {
        x: ARENA_MOVE_SPEED / Math.sqrt(2),
        y: 3.25,
        z: -ARENA_MOVE_SPEED / Math.sqrt(2)
      }
    });
  });

  it("rebuilds stable control patches for local and remote interaction members", () => {
    const controls = {
      "player.1": { moveX: -1, moveZ: 0, jump: false },
      "player.0": { moveX: 1, moveZ: 0, jump: false }
    };
    const patches = createArenaActorControlPatches(controls, () => ({ x: 0, y: 0, z: 0 }));

    expect(patches.map(({ memberId }) => memberId)).toEqual(["player.0", "player.1"]);
    expect(patches[0]?.patch.linearVelocity?.x).toBe(ARENA_MOVE_SPEED);
    expect(patches[1]?.patch.linearVelocity?.x).toBe(-ARENA_MOVE_SPEED);
  });
});
