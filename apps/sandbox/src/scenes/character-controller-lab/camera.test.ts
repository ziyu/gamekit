import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyCharacterControllerLabCameraGroundClearance,
  applyCharacterControllerLabCameraInput,
  cameraRelativeCharacterMovement,
  characterControllerLabCameraCollisionDistance
} from "./camera";

const UNIT = 42;

describe("Character Controller Lab third-person camera", () => {
  it("maps movement through the horizontal camera basis", () => {
    expect(cameraRelativeCharacterMovement(0, -1, 0)).toEqual({ x: 0, z: -1 });
    expect(cameraRelativeCharacterMovement(0, -1, Math.PI / 2).x).toBeCloseTo(-1);
    expect(cameraRelativeCharacterMovement(1, 0, Math.PI / 2).z).toBeCloseTo(-1);
  });

  it("normalizes diagonal input before rotating it", () => {
    const movement = cameraRelativeCharacterMovement(1, -1, Math.PI / 3);
    expect(Math.hypot(movement.x, movement.z)).toBeCloseTo(1);
  });

  it("supports low-angle and near-overhead orbit without flipping", () => {
    const low = applyCharacterControllerLabCameraInput(
      { yaw: 0, pitch: 0.38, distance: 8.4 },
      { lookDeltaX: 0, lookDeltaY: 1_000, zoomDelta: 0 }
    );
    const overhead = applyCharacterControllerLabCameraInput(low, {
      lookDeltaX: 0,
      lookDeltaY: -1_000,
      zoomDelta: 0
    });

    expect(low.pitch).toBeCloseTo(-0.35);
    expect(overhead.pitch).toBeCloseTo(1.4);
  });

  it("allows close inspection and a wide proving-park overview", () => {
    const close = applyCharacterControllerLabCameraInput(
      { yaw: 0, pitch: 0.38, distance: 8.4 },
      { lookDeltaX: 0, lookDeltaY: 0, zoomDelta: -10_000 }
    );
    const overview = applyCharacterControllerLabCameraInput(close, {
      lookDeltaX: 0,
      lookDeltaY: 0,
      zoomDelta: 10_000
    });

    expect(close.distance).toBe(3.2);
    expect(overview.distance).toBe(20);
  });

  it("keeps yaw continuous across repeated full orbit input", () => {
    const state = applyCharacterControllerLabCameraInput(
      { yaw: Math.PI - 0.02, pitch: 0.38, distance: 8.4 },
      { lookDeltaX: -20, lookDeltaY: 0, zoomDelta: 0 }
    );

    expect(state.yaw).toBeGreaterThan(-Math.PI);
    expect(state.yaw).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(state.yaw)).toBeGreaterThan(2.9);
  });

  it("stops a low orbit at floor geometry and keeps the camera above ground", () => {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(34 * UNIT, 0.7 * UNIT, 34 * UNIT));
    floor.position.y = -0.35 * UNIT;
    floor.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 1.66 * UNIT, 0);
    const direction = new THREE.Vector3(0, Math.sin(-0.35), Math.cos(-0.35)).normalize();
    const desiredDistance = 20 * UNIT;
    const collisionDistance = characterControllerLabCameraCollisionDistance(
      new THREE.Raycaster(),
      target,
      direction,
      desiredDistance,
      [floor]
    );
    const position = target.clone().addScaledVector(direction, collisionDistance);
    applyCharacterControllerLabCameraGroundClearance(position);

    expect(collisionDistance).toBeLessThan(desiredDistance);
    expect(position.y / UNIT).toBeGreaterThanOrEqual(0.28);
    floor.geometry.dispose();
  });

  it("keeps ground clearance beyond finite floor geometry", () => {
    const position = new THREE.Vector3(22 * UNIT, -4 * UNIT, 0);

    applyCharacterControllerLabCameraGroundClearance(position);

    expect(position.y / UNIT).toBeCloseTo(0.28);
  });
});
