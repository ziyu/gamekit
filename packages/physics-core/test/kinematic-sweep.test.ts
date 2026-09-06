import { describe, expect, it } from "vitest";
import {
  createMemoryPhysicsBackend,
  raycast,
  shapeCast,
  sweepPhysicsKinematicStep,
  type PhysicsKinematicSweepQueries
} from "../src";

describe("Physics kinematic sweep", () => {
  it("stops a fast projectile at the first real scene blocker", () => {
    const scene = createMemoryPhysicsBackend().createScene({ gravity: { x: 0, y: 0 } });
    scene.createBody({ id: "wall.body", kind: "static", position: { x: 5, y: 0 } });
    scene.createCollider({
      id: "wall.collider",
      bodyId: "wall.body",
      shape: { type: "box", width: 1, height: 8 }
    });
    const queries = sceneQueries(scene);

    const result = sweepPhysicsKinematicStep({
      queries,
      mode: "ray",
      position: { x: 0, y: 0 },
      velocity: { x: 100, y: 0 },
      deltaMs: 100
    });

    expect(result.hit).toMatchObject({ colliderId: "wall.collider" });
    expect(result.position.x).toBeLessThanOrEqual(5);
    expect(result.position.x).toBeGreaterThanOrEqual(4.49);
    scene.dispose();
  });

  it("uses the declared shape and keeps caller inputs immutable", () => {
    const scene = createMemoryPhysicsBackend().createScene({ gravity: { x: 0, y: 0 } });
    scene.createBody({ id: "wall.body", kind: "static", position: { x: 5, y: 0 } });
    scene.createCollider({
      id: "wall.collider",
      bodyId: "wall.body",
      shape: { type: "box", width: 1, height: 8 }
    });
    const position = { x: 0, y: 0 };
    const velocity = { x: 100, y: 0 };
    const ignoreBodies = ["ignored.body"];
    const result = sweepPhysicsKinematicStep({
      queries: sceneQueries(scene),
      mode: "shape",
      shape: { type: "circle", radius: 0.5 },
      position,
      velocity,
      deltaMs: 100,
      query: { ignoreBodies }
    });

    expect(result.hit).toMatchObject({ colliderId: "wall.collider" });
    expect(position).toEqual({ x: 0, y: 0 });
    expect(velocity).toEqual({ x: 100, y: 0 });
    expect(ignoreBodies).toEqual(["ignored.body"]);
    scene.dispose();
  });

  it("keeps a shape origin at time of impact while preserving the contact witness", () => {
    const result = sweepPhysicsKinematicStep({
      queries: {
        raycast: () => [],
        shapeCast: () => [
          {
            colliderId: "wall.collider",
            point: { x: 5, y: 0 },
            normal: { x: -1, y: 0 },
            distance: 4,
            fraction: 0.4
          }
        ]
      },
      mode: "shape",
      shape: { type: "circle", radius: 1 },
      position: { x: 0, y: 0 },
      velocity: { x: 100, y: 0 },
      deltaMs: 100
    });

    expect(result.position).toEqual({ x: 4, y: 0 });
    expect(result.hit?.point).toEqual({ x: 5, y: 0 });
  });

  it("rejects invalid shape sweeps and disposed-scene access stays backend-owned", () => {
    const scene = createMemoryPhysicsBackend().createScene({ gravity: { x: 0, y: 0 } });
    const queries = sceneQueries(scene);
    expect(() =>
      sweepPhysicsKinematicStep({
        queries,
        mode: "shape",
        position: { x: 0, y: 0 },
        velocity: { x: 1, y: 0 },
        deltaMs: 16
      })
    ).toThrow("requires a shape");
    scene.dispose();
    expect(() =>
      sweepPhysicsKinematicStep({
        queries,
        mode: "ray",
        position: { x: 0, y: 0 },
        velocity: { x: 1, y: 0 },
        deltaMs: 16
      })
    ).toThrow();
  });
});

function sceneQueries(
  scene: ReturnType<ReturnType<typeof createMemoryPhysicsBackend>["createScene"]>
): PhysicsKinematicSweepQueries {
  return {
    raycast(origin, direction, options) {
      return raycast(scene, origin, direction, options);
    },
    shapeCast(shape, position, direction, options) {
      return shapeCast(scene, shape, position, direction, options);
    }
  };
}
