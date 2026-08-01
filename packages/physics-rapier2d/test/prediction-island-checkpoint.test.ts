import { initRapier2dPhysicsBackend } from "../src";
import { describe, expect, it } from "vitest";

describe("Rapier 2D prediction island foundation", () => {
  it("restores a full solver checkpoint and deterministically replays a CCD material bounce", async () => {
    const backend = await initRapier2dPhysicsBackend();
    const scene = backend.createScene({
      id: "rapier2d.prediction-island.checkpoint",
      gravity: { x: 0, y: 9.81 },
      fixedDeltaMs: 1000 / 60,
      materialDefinitions: [
        {
          id: "material.ballistic",
          friction: 0.05,
          restitution: 0.88,
          density: 3,
          combine: { restitution: "max" }
        },
        {
          id: "material.steel",
          friction: 0.4,
          restitution: 0.8,
          combine: { restitution: "max" }
        }
      ]
    });
    scene.createBody({ id: "ground.body", kind: "static", position: { x: 0, y: 10 } });
    scene.createCollider({
      id: "ground.collider",
      bodyId: "ground.body",
      shape: { type: "box", width: 80, height: 1 },
      material: "material.steel"
    });
    scene.createBody({
      id: "bullet.body",
      kind: "dynamic",
      position: { x: 0, y: 0 },
      linearVelocity: { x: 7, y: 80 },
      continuousCollisionDetection: true
    });
    scene.createCollider({
      id: "bullet.collider",
      bodyId: "bullet.body",
      shape: { type: "circle", radius: 0.45 },
      material: "material.ballistic"
    });

    const checkpoint = scene.captureCheckpoint?.();
    expect(checkpoint).toBeDefined();
    for (let tick = 0; tick < 20; tick += 1) {
      scene.step(1000 / 60);
    }
    const firstReplay = scene.getBodyState("bullet.body");
    expect(firstReplay?.linearVelocity.y).toBeLessThan(0);

    scene.restoreCheckpoint?.(checkpoint!);
    for (let tick = 0; tick < 20; tick += 1) {
      scene.step(1000 / 60);
    }
    const secondReplay = scene.getBodyState("bullet.body");

    expect(secondReplay?.position.x).toBeCloseTo(firstReplay?.position.x ?? Number.NaN, 6);
    expect(secondReplay?.position.y).toBeCloseTo(firstReplay?.position.y ?? Number.NaN, 6);
    expect(secondReplay?.linearVelocity.x).toBeCloseTo(
      firstReplay?.linearVelocity.x ?? Number.NaN,
      6
    );
    expect(secondReplay?.linearVelocity.y).toBeCloseTo(
      firstReplay?.linearVelocity.y ?? Number.NaN,
      6
    );
    expect(backend.capabilities().checkpoints).toMatchObject({
      captureRestore: true,
      fullScene: true,
      deterministicReplay: true
    });
    scene.dispose();
  });
});
