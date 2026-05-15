import { describe, expect, it } from "vitest";
import { createCameraController } from "@gamekit/camera-core";
import { createPhaserCameraAdapter, type PhaserCameraDriver } from "../src";

describe("createPhaserCameraAdapter", () => {
  it("applies CameraState2D to a Phaser-like camera driver", () => {
    const driver = new FakePhaserCameraDriver();
    const adapter = createPhaserCameraAdapter({ driver });
    const camera = createCameraController({
      viewport: { width: 200, height: 100 },
      state: {
        x: 100,
        y: 50,
        zoom: 2,
        rotation: 0.1
      }
    });

    adapter.applyCameraState(camera.getState());

    expect(driver.scroll).toEqual({ x: 50, y: 25 });
    expect(driver.zoom).toBe(2);
    expect(driver.rotation).toBe(0.1);
  });

  it("falls back to core coordinate conversion", () => {
    const adapter = createPhaserCameraAdapter({ driver: new FakePhaserCameraDriver() });
    const camera = createCameraController({
      viewport: { width: 100, height: 100 },
      state: { x: 50, y: 50, zoom: 2 }
    });

    adapter.applyCameraState(camera.getState());

    expect(adapter.worldToScreen({ x: 60, y: 60 })).toEqual({ x: 70, y: 70 });
    expect(adapter.screenToWorld({ x: 70, y: 70 })).toEqual({ x: 60, y: 60 });
  });

  it("uses applied camera state for rotated coordinate conversion", () => {
    const adapter = createPhaserCameraAdapter({ driver: new FakePhaserCameraDriver() });
    const camera = createCameraController({
      viewport: { width: 200, height: 100 },
      state: { x: 100, y: 50, zoom: 2, rotation: Math.PI / 2 }
    });

    adapter.applyCameraState(camera.getState());

    const screen = adapter.worldToScreen({ x: 110, y: 50 });
    expect(screen.x).toBeCloseTo(100);
    expect(screen.y).toBeCloseTo(30);
    expect(adapter.screenToWorld(screen).x).toBeCloseTo(110);
    expect(adapter.screenToWorld(screen).y).toBeCloseTo(50);
  });
});

class FakePhaserCameraDriver implements PhaserCameraDriver {
  scroll = { x: 0, y: 0 };
  zoom = 1;
  rotation = 0;

  setScroll(x: number, y: number): void {
    this.scroll = { x, y };
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  setRotation(rotation: number): void {
    this.rotation = rotation;
  }
}
