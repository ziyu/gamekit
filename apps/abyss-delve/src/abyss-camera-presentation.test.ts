import { describe, expect, it } from "vitest";
import { Actor, Position } from "./game";
import { createAbyssTestHarness } from "./test/abyss-test-utils";

describe("Abyss Delve camera presentation", () => {
  it("follows the player with aim lookahead and syncs the driver adapter", () => {
    const harness = createAbyssTestHarness();
    harness.tick(16);
    const initial = harness.abyss.snapshot().camera;
    expect(initial).toBeDefined();

    const player = findPlayer(harness);
    const position = harness.abyss.runtime.world.get(player, Position)!;
    position.x += 140;
    position.y += 40;
    harness.abyss.input.aimX = position.x + 300;
    harness.abyss.input.aimY = position.y;
    harness.tick(16);

    const camera = harness.abyss.snapshot().camera!;
    expect(camera.x).toBeGreaterThan(initial!.x);
    expect(camera.displayX).toBeGreaterThan(initial!.displayX);
    expect(harness.cameraStates.at(-1)).toMatchObject({
      x: camera.displayX,
      y: camera.displayY,
      zoom: camera.zoom
    });
  });

  it("applies viewport-anchored zoom requests through input state", () => {
    const harness = createAbyssTestHarness();
    harness.tick(16);

    harness.abyss.input.cameraZoomDelta = -120;
    harness.abyss.input.cameraZoomX = 220;
    harness.abyss.input.cameraZoomY = 180;
    harness.tick(16);

    expect(harness.abyss.snapshot().camera?.zoom).toBeGreaterThan(1);
    expect(harness.cameraStates.at(-1)?.zoom).toBe(harness.abyss.snapshot().camera?.zoom);
    expect(harness.abyss.input.cameraZoomDelta).toBeUndefined();
  });

  it("shows a transient camera shake from combat cues without moving the target camera", () => {
    const harness = createAbyssTestHarness();
    harness.tick(16);
    const before = harness.abyss.snapshot().camera!;

    harness.abyss.runtime.eventBus.emit(
      "gas.effect_applied",
      { effectId: "effect.basic_damage" },
      "test"
    );
    harness.tick(16);

    const shaken = harness.abyss.snapshot().camera!;
    expect(shaken.x).toBeCloseTo(before.x);
    expect(shaken.displayX).not.toBeCloseTo(shaken.x);
  });
});

function findPlayer(harness: ReturnType<typeof createAbyssTestHarness>) {
  const player = harness.abyss.runtime.world
    .query([Actor])
    .find((entity) => harness.abyss.runtime.world.get(entity, Actor)?.faction === "player");
  if (player === undefined) {
    throw new Error("Missing player");
  }
  return player;
}
