import { describe, expect, it } from "vitest";
import { SANDBOX_RENDER_SIZE, type SandboxSnapshot } from "./game";
import { resolveSandboxSceneClickTarget } from "./scene-hit-test";

describe("sandbox scene hit test", () => {
  it("selects an entity only when the scene click lands inside its screen hit area", () => {
    const camera = {
      mode: "free" as const,
      x: SANDBOX_RENDER_SIZE.width / 2,
      y: SANDBOX_RENDER_SIZE.height / 2,
      zoom: 1,
      rotation: 0,
      viewport: SANDBOX_RENDER_SIZE,
      minZoom: 0.5,
      maxZoom: 3
    };
    const snapshot = {
      entities: [
        {
          id: "worker-1",
          actorId: "actor.worker.1",
          role: "worker",
          x: 50,
          y: 50
        }
      ]
    } as unknown as SandboxSnapshot;

    expect(resolveSandboxSceneClickTarget(snapshot, { x: 360, y: 262 }, camera)).toEqual({
      entityId: "worker-1",
      actorId: "actor.worker.1"
    });
    expect(resolveSandboxSceneClickTarget(snapshot, { x: 390, y: 262 }, camera)).toBeUndefined();
  });

  it("keeps blank clicks blank after camera zoom changes", () => {
    const camera = {
      mode: "free" as const,
      x: SANDBOX_RENDER_SIZE.width / 2,
      y: SANDBOX_RENDER_SIZE.height / 2,
      zoom: 2,
      rotation: 0,
      viewport: SANDBOX_RENDER_SIZE,
      minZoom: 0.5,
      maxZoom: 3
    };
    const snapshot = {
      entities: [
        {
          id: "campfire-1",
          role: "campfire",
          x: 50,
          y: 50
        }
      ]
    } as unknown as SandboxSnapshot;

    expect(resolveSandboxSceneClickTarget(snapshot, { x: 405, y: 262 }, camera)).toBeUndefined();
  });
});
