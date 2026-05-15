import { describe, expect, it } from "vitest";
import {
  clientToViewportPoint,
  createCameraController,
  viewportToClientPoint,
  worldToScreen,
  screenToWorld
} from "../src";

describe("createCameraController", () => {
  it("pans and clamps to bounds", () => {
    const camera = createCameraController({
      viewport: { width: 100, height: 100 },
      state: {
        x: 50,
        y: 50,
        bounds: { x: 0, y: 0, width: 200, height: 200 }
      }
    });

    camera.pan(-1000, -1000);

    expect(camera.getState()).toMatchObject({
      x: 50,
      y: 50
    });

    camera.pan(1000, 1000);

    expect(camera.getState()).toMatchObject({
      x: 150,
      y: 150
    });
  });

  it("zooms with clamping", () => {
    const camera = createCameraController({
      viewport: { width: 100, height: 100 },
      state: {
        minZoom: 0.5,
        maxZoom: 2
      }
    });

    camera.zoom(100);
    expect(camera.getState().zoom).toBe(2);

    camera.zoom(-100);
    expect(camera.getState().zoom).toBe(0.5);
  });

  it("keeps the anchored screen point stable while zooming", () => {
    const camera = createCameraController({
      viewport: { width: 200, height: 100 },
      state: {
        x: 100,
        y: 50,
        minZoom: 0.5,
        maxZoom: 4
      }
    });
    const anchor = { x: 160, y: 70 };
    const before = camera.screenToWorld(anchor);

    camera.zoom(1, anchor);

    expect(camera.screenToWorld(anchor)).toEqual(before);
  });

  it("converts between world and screen coordinates", () => {
    const camera = createCameraController({
      viewport: { width: 200, height: 100 },
      state: {
        x: 100,
        y: 50,
        zoom: 2
      }
    });

    const screen = camera.worldToScreen({ x: 110, y: 60 });

    expect(screen).toEqual({ x: 120, y: 70 });
    expect(camera.screenToWorld(screen)).toEqual({ x: 110, y: 60 });
  });

  it("converts rotated camera coordinates symmetrically", () => {
    const state = createCameraController({
      viewport: { width: 200, height: 100 },
      state: {
        x: 100,
        y: 50,
        zoom: 2,
        rotation: Math.PI / 2
      }
    }).getState();
    const world = { x: 110, y: 50 };
    const screen = worldToScreen(state, world);

    expect(screen.x).toBeCloseTo(100);
    expect(screen.y).toBeCloseTo(30);
    expect(screenToWorld(state, screen).x).toBeCloseTo(world.x);
    expect(screenToWorld(state, screen).y).toBeCloseTo(world.y);
  });

  it("converts browser client points through a scaled viewport rect", () => {
    const viewport = { width: 720, height: 524 };
    const rect = { left: 10, top: 20, width: 360, height: 262 };
    const viewportPoint = clientToViewportPoint({ x: 190, y: 151 }, rect, viewport);

    expect(viewportPoint).toEqual({ x: 360, y: 262 });
    expect(viewportToClientPoint(viewportPoint, rect, viewport)).toEqual({ x: 190, y: 151 });
  });

  it("tracks follow mode without requiring world access", () => {
    const camera = createCameraController({
      viewport: { width: 100, height: 100 }
    });

    camera.follow("hero");
    expect(camera.getState()).toMatchObject({
      mode: "follow",
      targetEntity: "hero"
    });

    camera.stopFollow();
    expect(camera.getState()).toMatchObject({
      mode: "free"
    });
    expect(camera.getState().targetEntity).toBeUndefined();
  });
});
