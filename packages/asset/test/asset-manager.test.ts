import { describe, expect, it } from "vitest";
import { createDataRegistry } from "@gamekit/data";
import {
  createAssetDataType,
  createAssetManager,
  loadAssetGroupWithRetry,
  type AssetDefinition
} from "../src";

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
    registry.registerType(createAssetDataType({ supportedTypes: ["image"] }));
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      entries: [{ type: "asset.definition", id: "asset.hero", data: asset("asset.hero") }]
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

  it("retries failed group members without reloading successful assets", async () => {
    const attempts = new Map<string, number>();
    const observedAttempts: number[] = [];
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load(nextAsset) {
          const attempt = (attempts.get(nextAsset.id) ?? 0) + 1;
          attempts.set(nextAsset.id, attempt);
          if (nextAsset.id === "asset.flaky" && attempt < 2) {
            throw new Error("transient");
          }
        }
      }
    });
    manager.registerMany([
      asset("asset.stable", { group: "match" }),
      asset("asset.flaky", { group: "match" })
    ]);

    const result = await loadAssetGroupWithRetry(manager, "match", {
      maxAttempts: 3,
      onAttempt(attempt) {
        observedAttempts.push(attempt.attempt);
      }
    });

    expect(result).toMatchObject({ group: "match", attempt: 2, succeeded: true });
    expect(result.states.every((state) => state.status === "loaded")).toBe(true);
    expect(attempts).toEqual(
      new Map([
        ["asset.stable", 1],
        ["asset.flaky", 2]
      ])
    );
    expect(observedAttempts).toEqual([1, 2]);
  });

  it("reports a missing group without retrying an empty plan", async () => {
    const diagnostics: string[] = [];
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load() {}
      },
      onDiagnostic(event) {
        diagnostics.push(event.type);
      }
    });

    const result = await loadAssetGroupWithRetry(manager, "missing", { maxAttempts: 3 });

    expect(result).toEqual({
      group: "missing",
      attempt: 1,
      states: [],
      succeeded: false
    });
    expect(diagnostics).toEqual(["asset.group_missing"]);
  });

  it("isolates retry progress observer failures from loading", async () => {
    const manager = createAssetManager({
      adapter: {
        id: "test",
        supports: () => true,
        async load() {}
      }
    });
    manager.register(asset("asset.safe", { group: "safe" }));

    const result = await loadAssetGroupWithRetry(manager, "safe", {
      onAttempt() {
        throw new Error("observer failed");
      },
      onAttemptError() {
        throw new Error("error observer failed");
      }
    });

    expect(result.succeeded).toBe(true);
    expect(manager.state("asset.safe").status).toBe("loaded");
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
