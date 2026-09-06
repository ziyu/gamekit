import { createMemoryPhysicsBackend, createPhysicsPredictionIsland } from "../src";
import { runPhysicsBodyCommandConformance } from "../src/testing";
import { describe, expect, it } from "vitest";

describe("Physics body command", () => {
  it.each(["2d", "3d"] as const)("passes the reusable memory %s conformance", (dimension) => {
    const report = runPhysicsBodyCommandConformance({
      dimension,
      createBackend: () => createMemoryPhysicsBackend({ dimension })
    });

    expect(report.dimension).toBe(dimension);
    expect(report.checks).toHaveLength(8);
    expect(report.linearVelocity.x).toBeGreaterThan(0);
  });

  it("rejects dimension-invalid impulse payloads explicitly", () => {
    const scene = createMemoryPhysicsBackend({ dimension: "2d" }).createScene();
    scene.createBody({ id: "dynamic", kind: "dynamic" });

    expect(
      scene.applyBodyCommand?.({
        type: "linear-impulse",
        bodyId: "dynamic",
        impulse: { x: 1, y: 0, z: 1 }
      })
    ).toMatchObject({ status: "invalid-command" });
    expect(
      scene.applyBodyCommand?.({
        type: "angular-impulse",
        bodyId: "dynamic",
        impulse: { x: 0, y: 0, z: 1 }
      })
    ).toMatchObject({ status: "invalid-command" });

    scene.dispose();
  });

  it("sorts, deduplicates, and replays body commands inside one prediction island", () => {
    const island = createPhysicsPredictionIsland({
      backend: createMemoryPhysicsBackend(),
      generation: 1,
      scene: { gravity: { x: 0, y: 0 } },
      initialMembers: [
        {
          id: "actor",
          body: { id: "actor.body", kind: "dynamic", linearVelocity: { x: 0, y: 0 } }
        }
      ]
    });
    const wakeCommand = {
      type: "body-command" as const,
      tick: 1,
      sequence: 1,
      memberId: "actor",
      command: {
        type: "linear-impulse" as const,
        impulse: { x: 2, y: 0 },
        wake: "wake" as const
      }
    };
    expect(
      island.queue({
        type: "patch",
        tick: 1,
        sequence: 2,
        memberId: "actor",
        patch: { sleeping: true }
      }).status
    ).toBe("queued");
    expect(island.queue(wakeCommand).status).toBe("queued");
    expect(island.queue(wakeCommand).status).toBe("duplicate");
    island.advanceTo(1);

    expect(island.body("actor")).toMatchObject({
      linearVelocity: { x: 2, y: 0 },
      sleeping: true
    });
    expect(
      island.queue({
        type: "body-command",
        tick: 1,
        sequence: 3,
        memberId: "actor",
        command: { type: "linear-impulse", impulse: { x: 3, y: 0 }, wake: "preserve" }
      })
    ).toMatchObject({ status: "replayed", replayedTicks: 1 });
    expect(island.body("actor")).toMatchObject({
      linearVelocity: { x: 5, y: 0 },
      sleeping: true
    });
    expect(island.diagnostics()).toMatchObject({
      duplicateCommands: 1,
      bodyCommandsApplied: 3,
      bodyCommandsRejected: 0,
      resimulations: 1,
      resimulatedTicks: 1
    });

    island.dispose();
  });
});
