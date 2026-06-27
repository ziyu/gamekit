import { describe, expect, it } from "vitest";
import { createPhaserDriver } from "../src";
import { createPhaserDriverCameraAdapter } from "../src/driver/camera";

describe("createPhaserDriver", () => {
  it("exposes a cohesive adapter bundle", () => {
    const driver = createPhaserDriver({ id: "test.phaser" });
    const adapters = driver.adapters();

    expect(driver.id).toBe("test.phaser");
    expect(driver.capabilities()).toMatchObject({
      renderer: true,
      assets: true,
      input: true,
      camera: true
    });
    expect(adapters.renderer.id).toBe("test.phaser.renderer");
    expect(adapters.assetLoader.id).toBe("test.phaser.asset-loader");
    expect(driver.snapshot()).toMatchObject({
      id: "test.phaser",
      kind: "phaser",
      adapters: ["renderer", "assetLoader", "camera", "inputSource"]
    });
  });

  it("fails clearly when a runtime-backed adapter is used before boot", async () => {
    const driver = createPhaserDriver({ id: "test.phaser" });

    await expect(
      driver.adapters().assetLoader.load({
        id: "asset.hero",
        type: "image",
        source: { type: "url", url: "/hero.png" }
      })
    ).rejects.toMatchObject({
      code: "driver.phaser.assets_unavailable"
    });
    driver.adapters().camera.applyCameraState({
      mode: "free",
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
      viewport: { width: 1, height: 1 },
      minZoom: 0.5,
      maxZoom: 2
    });
    expect(driver.adapters().camera.getState()).toMatchObject({ x: 0, y: 0, zoom: 1 });
  });
});

describe("createPhaserDriverCameraAdapter", () => {
  it("maps centered camera state to Phaser scroll using zoom", () => {
    const calls: Array<{ x: number; y: number }> = [];
    const camera = createPhaserDriverCameraAdapter({
      runtime: {
        setScroll(x, y) {
          calls.push({ x, y });
        },
        setZoom() {},
        setRotation() {}
      }
    });

    camera.applyCameraState({
      mode: "free",
      x: 200,
      y: 120,
      zoom: 2,
      rotation: 0,
      viewport: { width: 100, height: 80 },
      minZoom: 0.5,
      maxZoom: 4
    });

    expect(calls.at(-1)).toEqual({ x: 175, y: 100 });
    expect(camera.worldToScreen({ x: 200, y: 120 })).toEqual({ x: 50, y: 40 });
    expect(camera.screenToWorld({ x: 50, y: 40 })).toEqual({ x: 200, y: 120 });
  });
});
