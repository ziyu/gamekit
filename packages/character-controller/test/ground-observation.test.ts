import { describe, expect, it } from "vitest";
import type { PhysicsBodyState, PhysicsQuery } from "@gamekit/physics-core";
import { compileCharacterMotorDefinition, observeCharacterGround } from "../src";

const definition = compileCharacterMotorDefinition({
  id: "ground.fixture",
  version: "1",
  capsuleRadius: 0.5,
  capsuleHeight: 1.8,
  maxGroundSpeed: 6,
  groundAcceleration: 20,
  groundBraking: 25,
  maxAirSpeed: 4,
  airAcceleration: 8,
  airBraking: 3,
  maxSlopeRadians: Math.PI / 4,
  stepHeight: 0.4,
  groundProbeDistance: 0.25,
  groundSnapDistance: 0.1,
  ceilingClearance: 0.1,
  coyoteTimeMs: 80,
  jumpBufferMs: 100,
  jumpSpeed: 6,
  jumpHoldDurationMs: 100,
  jumpHoldAcceleration: 5,
  diveSpeed: 8,
  diveVerticalSpeed: 1,
  minimumDiveAirTimeMs: 80,
  diveDurationMs: 300,
  recoveryDurationMs: 200,
  diveCooldownMs: 700,
  diveSteeringScale: 0.4,
  staggerControlScale: 0.1,
  recoveryControlScale: 0.5,
  maxPlatformSpeed: 10,
  platformDepartureVelocityScale: 0.75,
  maxFacingRateRadiansPerSecond: Math.PI * 4
});

const body: PhysicsBodyState = {
  id: "actor",
  kind: "dynamic",
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  sleeping: false
};

describe("character ground observation", () => {
  it("uses a capsule cast, rejects unstable hits, and chooses the stable closest support", () => {
    let query: PhysicsQuery | undefined;
    const observation = observeCharacterGround({
      body,
      definition,
      simulation: {
        query(nextQuery) {
          query = nextQuery;
          return [
            {
              colliderId: "surface.far",
              bodyId: "platform",
              distance: 0.2,
              normal: { x: 0, y: 1, z: 0 }
            },
            { colliderId: "surface.invalid", distance: 0.01 },
            {
              colliderId: "surface.near",
              bodyId: "platform",
              distance: 0.04,
              normal: { x: 0, y: 1, z: 0 }
            }
          ];
        },
        body(bodyId) {
          return bodyId === "platform"
            ? { ...body, id: "platform", linearVelocity: { x: 2, y: 0, z: -1 } }
            : undefined;
        }
      },
      ignoreColliderIds: ["actor.collider"]
    });

    expect(query).toMatchObject({
      type: "shape-cast",
      shape: { type: "capsule", radius: 0.5, height: 0.8 },
      position: { x: 1, y: 2.1, z: 3 },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: 0.35,
      options: {
        triggerInteraction: "exclude",
        ignoreBodies: ["actor"],
        ignoreColliders: ["actor.collider"]
      }
    });
    expect(observation).toEqual({
      ground: {
        distance: 0,
        normal: { x: 0, y: 1, z: 0 },
        bodyId: "platform",
        bodyLinearVelocity: { x: 2, y: 0, z: -1 },
        surfaceId: "surface.near"
      },
      queryCount: 1,
      rejectedQueryCount: 1
    });
  });

  it("returns a bounded empty observation when no support is hit", () => {
    expect(
      observeCharacterGround({
        body,
        definition,
        simulation: { query: () => [] }
      })
    ).toEqual({ queryCount: 1, rejectedQueryCount: 0 });
  });
});
