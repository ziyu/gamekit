import { describe, expect, it, vi } from "vitest";
import { createAssetManager, type AssetDefinition, type CreateAssetManagerOptions } from "../src";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(options: Partial<CreateAssetManagerOptions> = {}) {
  const native = new Set<string>();
  const unload = vi.fn(async (asset: AssetDefinition) => {
    native.delete(asset.id);
  });
  const manager = createAssetManager({
    adapter: {
      id: "test",
      supports: () => true,
      load: async (asset) => {
        native.add(asset.id);
      },
      unload
    },
    ...options
  });
  manager.registerMany(
    ["a", "b", "c"].map((id) => ({
      id,
      type: "image",
      group: "level",
      estimatedBytes: 10,
      source: { type: "url", url: id }
    }))
  );
  return { manager, native, unload };
}

describe("asset ownership and eviction", () => {
  it("keeps shared resources until the last scope releases, including repeated loads", async () => {
    const { manager, native, unload } = fixture();
    const first = manager.createScope("first"),
      second = manager.createScope("second");
    await Promise.all([first.load("a"), first.load("a"), second.load("a")]);
    expect(manager.lifecycleSnapshot().references).toEqual([{ assetId: "a", owners: 2 }]);
    await expect(manager.unload("a")).rejects.toMatchObject({ code: "asset.in_use" });
    await first.dispose();
    expect(native.has("a")).toBe(true);
    await second.dispose();
    await second.dispose();
    expect(native.size).toBe(0);
    expect(unload).toHaveBeenCalledTimes(1);
  });
  it("preserves legacy cached loads when a scope is released", async () => {
    const { manager, native } = fixture();
    await manager.load("a");
    const scope = manager.createScope("scene");
    await scope.load("a");
    await scope.dispose();
    expect(native.has("a")).toBe(true);
    await manager.unload("a");
    expect(native.size).toBe(0);
  });
  it("evicts least recently used unowned assets within configured budgets", async () => {
    const { manager, native } = fixture({ maxResidentAssets: 2, maxResidentBytes: 20 });
    await manager.load("a");
    await manager.load("b");
    await manager.load("a");
    await manager.load("c");
    expect([...native].sort()).toEqual(["a", "c"]);
    expect(manager.lifecycleSnapshot()).toMatchObject({
      residentAssets: 2,
      estimatedResidentBytes: 20
    });
    expect(manager.state("b").status).toBe("registered");
  });
  it("rejects admission instead of evicting live owners", async () => {
    const { manager, native } = fixture({ maxResidentBytes: 10 });
    const scope = manager.createScope("scene");
    await scope.load("a");
    expect(await manager.load("b")).toMatchObject({ status: "failed" });
    expect([...native]).toEqual(["a"]);
    await scope.dispose();
    expect(await manager.load("b")).toMatchObject({ status: "loaded" });
  });
  it("does not report native release failure as a freed cache entry", async () => {
    const { manager, unload } = fixture();
    await manager.load("a");
    unload.mockRejectedValueOnce(new Error("native release"));
    await expect(manager.unload("a")).rejects.toThrow("native release");
    expect(manager.lifecycleSnapshot().residentAssets).toBe(1);
    await manager.unload("a");
    expect(manager.lifecycleSnapshot().residentAssets).toBe(0);
  });
  it("requires explicit adapter support and size estimates", async () => {
    const { manager } = fixture({ maxResidentBytes: 10 });
    manager.register({ id: "unknown-size", type: "image", source: { type: "url", url: "x" } });
    expect(await manager.load("unknown-size")).toMatchObject({ status: "failed" });
    const legacy = createAssetManager({
      adapter: { id: "legacy", supports: () => true, load: async () => {} }
    });
    expect(() => legacy.createScope("scene")).toThrow("unload");
  });
});

describe("asset loading races", () => {
  it.each([false, true])(
    "does not retain cancelled ordinary loads (shared scope: %s)",
    async (shared) => {
      const ready = deferred();
      const native = new Set<string>();
      let starts = 0;
      const { manager } = fixture({
        adapter: {
          id: "test",
          supports: () => true,
          async load(asset) {
            starts++;
            await ready.promise;
            native.add(asset.id);
          },
          async unload(asset) {
            native.delete(asset.id);
          }
        }
      });
      const controller = new AbortController();
      const cancelled = manager
        .load("a", { signal: controller.signal })
        .catch((error: Error) => error.name);
      const scope = manager.createScope("scene");
      const pending = shared ? scope.load("a") : undefined;
      await vi.waitFor(() => expect(starts).toBe(1));
      controller.abort();
      expect(await cancelled).toBe("AbortError");
      ready.resolve();
      expect((await (pending ?? scope.load("a"))).status).toBe("loaded");
      await scope.dispose();
      expect(native.size).toBe(0);
      expect(manager.lifecycleSnapshot().residentAssets).toBe(0);
      await manager.dispose();
    }
  );
  it("releases a native completion cancelled by the loaded observer", async () => {
    const controller = new AbortController();
    const { manager, native } = fixture({
      onDiagnostic(event) {
        if (event.type === "asset.loaded") controller.abort();
      }
    });
    await expect(manager.load("a", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError"
    });
    await vi.waitFor(() => expect(manager.lifecycleSnapshot().residentAssets).toBe(0));
    expect(native.size).toBe(0);
    await manager.dispose();
  });
  it("rejects scope operations after disposal even for an empty group", async () => {
    const { manager } = fixture();
    const scope = manager.createScope("scene");
    await scope.dispose();
    await expect(scope.loadGroup("empty")).rejects.toMatchObject({ code: "asset.scope_disposed" });
    await manager.dispose();
    await expect(scope.load("a")).rejects.toMatchObject({ code: "asset.disposed" });
    await expect(manager.loadGroup("empty")).rejects.toMatchObject({ code: "asset.disposed" });
  });
  it("cancels one waiter without cancelling a shared adapter request", async () => {
    const ready = deferred();
    let signal: AbortSignal | undefined;
    const { manager } = fixture({
      adapter: {
        id: "test",
        supports: () => true,
        load: async (_asset, options) => {
          signal = options?.signal;
          await ready.promise;
        },
        unload: async () => {}
      }
    });
    const a = manager.createScope("a"),
      b = manager.createScope("b");
    const cancelled = a.load("a").catch((error: Error) => error.name);
    const loaded = b.load("a");
    await vi.waitFor(() => expect(signal).toBeDefined());
    await a.dispose();
    expect(await cancelled).toBe("AbortError");
    expect(signal!.aborted).toBe(false);
    ready.resolve();
    expect((await loaded).status).toBe("loaded");
    await b.dispose();
  });
  it("cleans a non-abortable late completion before reloading the same asset", async () => {
    const first = deferred();
    let loads = 0;
    const native = new Set<string>();
    const { manager } = fixture({
      adapter: {
        id: "test",
        supports: () => true,
        load: async (asset) => {
          if (++loads === 1) await first.promise;
          native.add(asset.id);
        },
        unload: async (asset) => {
          native.delete(asset.id);
        }
      }
    });
    const a = manager.createScope("a");
    const pending = a.load("a").catch((error: Error) => error.name);
    await vi.waitFor(() => expect(loads).toBe(1));
    const release = a.dispose();
    const b = manager.createScope("b");
    const next = b.load("a");
    first.resolve();
    await release;
    expect(await pending).toBe("AbortError");
    expect((await next).status).toBe("loaded");
    expect(loads).toBe(2);
    expect(native.has("a")).toBe(true);
    await b.dispose();
    expect(native.size).toBe(0);
  });
  it("bounds concurrency and removes cancelled queued requests", async () => {
    const ready = deferred();
    const starts: string[] = [];
    const { manager } = fixture({
      maxConcurrentLoads: 1,
      adapter: {
        id: "test",
        supports: () => true,
        load: async (asset) => {
          starts.push(asset.id);
          await ready.promise;
        },
        unload: async () => {}
      }
    });
    const a = manager.load("a");
    const controller = new AbortController();
    const b = manager.load("b", { signal: controller.signal }).catch((error: Error) => error.name);
    const c = manager.load("c");
    await vi.waitFor(() => expect(manager.lifecycleSnapshot().queuedLoads).toBe(2));
    controller.abort();
    expect(await b).toBe("AbortError");
    expect(starts).toEqual(["a"]);
    ready.resolve();
    await a;
    await c;
    expect(starts).toEqual(["a", "c"]);
    await manager.dispose();
  });
  it("repeated scene cycles leave no native resources or ownership references", async () => {
    const { manager, native } = fixture();
    for (let i = 0; i < 100; i++) {
      const scope = manager.createScope(`scene-${i}`);
      await scope.loadGroup("level");
      await scope.dispose();
    }
    expect(native.size).toBe(0);
    expect(manager.lifecycleSnapshot()).toMatchObject({ residentAssets: 0, references: [] });
    const scope = manager.createScope("last");
    await scope.load("a");
    await manager.dispose();
    await manager.dispose();
    await scope.dispose();
    expect(manager.assets()).toEqual([]);
    expect(manager.lifecycleSnapshot().references).toEqual([]);
    await expect(manager.load("a")).rejects.toMatchObject({ code: "asset.disposed" });
  });
});
