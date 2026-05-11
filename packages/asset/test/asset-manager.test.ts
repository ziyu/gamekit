import { describe, expect, it } from "vitest";
import { createDataRegistry } from "@gamekit/data";
import { createAssetDataKind, createAssetManager, type AssetDefinition } from "../src";

describe("createAssetManager", () => {
  it("registers assets and loads a single asset", async () => {
    const loaded: string[] = [];
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load(asset) {
          loaded.push(asset.id);
        }
      },
      clock: () => 10
    });

    manager.register(asset("asset.hero"));
    const state = await manager.load("asset.hero");

    expect(loaded).toEqual(["asset.hero"]);
    expect(state).toEqual({ id: "asset.hero", status: "loaded", loadedAt: 10 });
    expect(manager.state("asset.hero").status).toBe("loaded");
  });

  it("registers asset definitions from DataRegistry", () => {
    const registry = createDataRegistry();
    registry.registerKind(createAssetDataKind({ supportedTypes: ["image"] }));
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      data: {
        asset: [asset("asset.hero")]
      }
    });
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load() {}
      }
    });

    expect(manager.registerFromDataRegistry(registry).map((definition) => definition.id)).toEqual([
      "asset.hero"
    ]);
    expect(manager.has("asset.hero")).toBe(true);
  });

  it("loads a group of assets", async () => {
    const loaded: string[] = [];
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load(nextAsset) {
          loaded.push(nextAsset.id);
        }
      }
    });
    manager.registerMany([
      asset("asset.hero", { group: "preload" }),
      asset("asset.enemy", { group: "preload" }),
      asset("asset.lazy", { group: "lazy" })
    ]);

    await manager.loadGroup("preload");

    expect(loaded).toEqual(["asset.hero", "asset.enemy"]);
  });

  it("throws for duplicate, missing, and unsupported assets", async () => {
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => false,
        async load() {}
      }
    });

    manager.register(asset("asset.hero"));

    expect(() => manager.register(asset("asset.hero"))).toThrow(/Duplicate asset/);
    expect(() => manager.get("asset.missing")).toThrow(/Missing asset/);
    await expect(manager.load("asset.hero")).rejects.toThrow(/does not support asset/);
  });

  it("records failed load state", async () => {
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load() {
          throw new Error("boom");
        }
      }
    });

    manager.register(asset("asset.hero"));
    const state = await manager.load("asset.hero");

    expect(state).toMatchObject({
      id: "asset.hero",
      status: "failed",
      error: "boom"
    });
  });
});

function asset(id: string, patch: Partial<AssetDefinition> = {}): AssetDefinition {
  return {
    id,
    type: "image",
    source: {
      type: "url",
      url: `/assets/${id}.png`
    },
    ...patch
  };
}
