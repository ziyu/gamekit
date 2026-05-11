import { describe, expect, it } from "vitest";
import { createPhaserAssetAdapter } from "../src";

describe("createPhaserAssetAdapter", () => {
  it("loads image assets through the renderer asset runtime", async () => {
    const runtime = createFakeRuntime();
    const adapter = createPhaserAssetAdapter({ runtime });

    await adapter.load({
      id: "asset.hero",
      type: "image",
      source: { type: "url", url: "/hero.png" }
    });

    expect(runtime.loaded).toEqual(["image:asset.hero:/hero.png"]);
  });

  it("loads spritesheet assets through the renderer asset runtime", async () => {
    const runtime = createFakeRuntime();
    const adapter = createPhaserAssetAdapter({ runtime });

    await adapter.load({
      id: "asset.hero.sheet",
      type: "spritesheet",
      source: { type: "url", url: "/hero.png" },
      frame: { width: 16, height: 24 }
    });

    expect(runtime.loaded).toEqual(["spritesheet:asset.hero.sheet:/hero.png:16x24"]);
  });

  it("does not reload existing textures", async () => {
    const runtime = createFakeRuntime(["asset.hero"]);
    const adapter = createPhaserAssetAdapter({ runtime });

    await adapter.load({
      id: "asset.hero",
      type: "image",
      source: { type: "url", url: "/hero.png" }
    });

    expect(runtime.loaded).toEqual([]);
  });

  it("rejects unsupported assets clearly", async () => {
    const adapter = createPhaserAssetAdapter({ runtime: createFakeRuntime() });

    await expect(
      adapter.load({
        id: "asset.audio",
        type: "audio",
        source: { type: "url", url: "/audio.ogg" }
      })
    ).rejects.toMatchObject({ code: "asset.phaser.unsupported" });
  });
});

function createFakeRuntime(existing: string[] = []) {
  const textures = new Set(existing);
  const loaded: string[] = [];

  return {
    loaded,
    hasTexture(id: string) {
      return textures.has(id);
    },
    async loadImage(assetId: string, url: string) {
      loaded.push(`image:${assetId}:${url}`);
      textures.add(assetId);
    },
    async loadSpritesheet(assetId: string, url: string, frame: { width: number; height: number }) {
      loaded.push(`spritesheet:${assetId}:${url}:${frame.width}x${frame.height}`);
      textures.add(assetId);
    }
  };
}
