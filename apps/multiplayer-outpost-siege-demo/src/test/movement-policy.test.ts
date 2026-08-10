import { describe, expect, it } from "vitest";

import type { OutpostMovementProfileDefinition } from "../domain";
import {
  acknowledgeOutpostDashSequence,
  advanceOutpostMovement,
  createOutpostMovementState
} from "../gameplay/player/movement-policy";

const PROFILE: OutpostMovementProfileDefinition = {
  id: "movement.test.ranger",
  maxSpeed: 220,
  acceleration: 2_100,
  deceleration: 2_800,
  staminaRecoveryPerSecond: 12,
  dashSpeed: 640,
  dashDurationMs: 180,
  dashCollisionVelocityRatio: 0.45,
  cameraLookaheadDistance: 72,
  cameraLookaheadResponse: 8,
  cameraDashImpulse: 22
};

describe("Outpost shared movement policy", () => {
  it("applies bounded acceleration, deceleration, and normalized diagonal movement", () => {
    const state = createOutpostMovementState();
    const input = { moveX: 1, moveY: 0, aimX: 100, aimY: 0, dashSequence: 0 };

    advanceOutpostMovement(state, input, PROFILE, {
      deltaMs: 50,
      position: { x: 0, y: 0 }
    });
    expect(state.velocityX).toBeCloseTo(105);
    expect(state.velocityY).toBe(0);

    advanceOutpostMovement(state, { ...input, moveX: 1, moveY: 1 }, PROFILE, {
      deltaMs: 100,
      position: { x: 0, y: 0 }
    });
    expect(Math.hypot(state.velocityX, state.velocityY)).toBeLessThanOrEqual(PROFILE.maxSpeed);

    advanceOutpostMovement(state, { ...input, moveX: 0 }, PROFILE, {
      deltaMs: 100,
      position: { x: 0, y: 0 }
    });
    expect(state.velocityX).toBe(0);
    expect(state.velocityY).toBe(0);
  });

  it("uses deterministic fallback directions and ends a dash after a blocking collision", () => {
    const state = createOutpostMovementState({ facing: Math.PI / 2 });
    const idleAim = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, dashSequence: 1 };

    advanceOutpostMovement(state, idleAim, PROFILE, {
      deltaMs: 50,
      position: { x: 0, y: 0 }
    });
    expect(state.dashSequence).toBe(1);
    expect(state.dashRemainingMs).toBe(130);
    expect(state.velocityX).toBeCloseTo(0);
    expect(state.velocityY).toBeCloseTo(PROFILE.dashSpeed);

    state.velocityX = 0;
    state.velocityY = 0;
    advanceOutpostMovement(state, idleAim, PROFILE, {
      deltaMs: 50,
      position: { x: 0, y: 0 }
    });
    expect(state.dashRemainingMs).toBe(0);
    expect(state.velocityY).toBe(0);

    advanceOutpostMovement(
      state,
      { moveX: 1, moveY: 1, aimX: 0, aimY: 100, dashSequence: 2 },
      PROFILE,
      { deltaMs: 50, position: { x: 0, y: 0 } }
    );
    expect(state.dashDirectionX).toBeCloseTo(Math.SQRT1_2);
    expect(state.dashDirectionY).toBeCloseTo(Math.SQRT1_2);
  });

  it("does not replay a rejected dash after authority confirms its action sequence", () => {
    const state = createOutpostMovementState();
    acknowledgeOutpostDashSequence(state, 4);

    advanceOutpostMovement(
      state,
      { moveX: 0, moveY: 0, aimX: 100, aimY: 0, dashSequence: 4 },
      PROFILE,
      { deltaMs: 50, position: { x: 0, y: 0 } }
    );

    expect(state.dashSequence).toBe(4);
    expect(state.dashRemainingMs).toBe(0);
    expect(state.velocityX).toBe(0);
  });
});
