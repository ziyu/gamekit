import { describe, expect, it } from "vitest";
import {
  createJsonSaveCodec,
  createMemorySaveStore,
  createPlatformStorageSaveStore,
  createSaveManager,
  createSaveMigrationRegistry,
  type SaveContributor,
  type SaveEnvelope
} from "@gamekit/save";

function runtime(ticks = 1) {
  return {
    seed: "test-seed",
    clock: {
      ticks,
      elapsed: ticks * 16
    }
  };
}

describe("save manager", () => {
  it("captures contributors, stores a slot, and restores in contributor order", async () => {
    const calls: string[] = [];
    const store = createMemorySaveStore();
    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store,
      clock: () => 100
    });

    manager.registerContributor(createContributor("b", calls, 20));
    manager.registerContributor(createContributor("a", calls, 10));

    const saved = await manager.save("slot-1", {
      runtime: runtime(),
      metadata: { label: "First Slot" }
    });
    const loaded = await manager.load("slot-1");

    expect(saved.slotId).toBe("slot-1");
    expect(await store.exists("slot-1")).toBe(true);
    expect((await manager.list())[0]).toMatchObject({ id: "slot-1", label: "First Slot" });
    expect(loaded.restored).toBe(true);
    expect(calls).toEqual(["a.capture", "b.capture", "a.restore", "b.restore"]);
  });

  it("inspects save metadata without returning payload data", async () => {
    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store: createMemorySaveStore()
    });
    manager.registerContributor({
      id: "game.inventory",
      version: "1.0.0",
      capture() {
        return { id: "game.inventory", version: "1.0.0", data: { coins: 10 } };
      }
    });

    await manager.save("slot-1", { runtime: runtime() });
    const inspection = await manager.inspect("slot-1");

    expect(inspection.envelope).not.toHaveProperty("payload");
    expect(inspection.sections).toEqual([{ id: "game.inventory", version: "1.0.0" }]);
  });

  it("selects contributors by id, tag, and scope", async () => {
    const calls: string[] = [];
    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store: createMemorySaveStore(),
      contributorPolicy: {
        excludeScopes: ["presentation"]
      }
    });

    manager.registerContributor({
      ...createContributor("world.position", calls, 10),
      scope: "world",
      tags: ["gameplay"]
    });
    manager.registerContributor({
      ...createContributor("ui.overlay", calls, 20),
      scope: "presentation",
      tags: ["ui"]
    });
    manager.registerContributor({
      ...createContributor("gas.actors", calls, 30),
      scope: "gameplay",
      tags: ["gas"]
    });

    const saved = await manager.save("slot-filtered", {
      runtime: runtime(),
      contributors: {
        includeTags: ["gameplay", "gas"],
        excludeIds: ["gas.actors"]
      }
    });

    expect(Object.keys(saved.envelope.payload.sections)).toEqual(["world.position"]);
    expect(calls).toEqual(["world.position.capture"]);
  });

  it("migrates old envelopes before restore", async () => {
    const calls: string[] = [];
    const store = createMemorySaveStore();
    const codec = createJsonSaveCodec();
    const migrationRegistry = createSaveMigrationRegistry([
      {
        id: "save-0-to-1",
        from: "0.9.0",
        to: "1.0.0",
        migrate(envelope) {
          return {
            ...envelope,
            formatVersion: "1.0.0",
            payload: {
              ...envelope.payload,
              sections: {
                ...envelope.payload.sections,
                migrated: { id: "migrated", version: "1.0.0", data: true }
              }
            }
          };
        }
      }
    ]);
    const oldEnvelope: SaveEnvelope = {
      format: "gamekit.save",
      formatVersion: "0.9.0",
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      createdAt: 1,
      updatedAt: 1,
      slot: { id: "old-slot" },
      compatibility: {},
      payload: {
        runtime: runtime(),
        sections: {
          migrated: { id: "migrated", version: "1.0.0", data: false }
        }
      }
    };
    await store.write("old-slot", await codec.encode(oldEnvelope), {
      id: "old-slot",
      formatVersion: "0.9.0"
    });

    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store,
      codec,
      migrations: migrationRegistry
    });
    manager.registerContributor({
      id: "migrated",
      version: "1.0.0",
      restore(_ctx, section) {
        calls.push(String(section.data));
      },
      capture() {
        return undefined;
      }
    });

    const result = await manager.load("old-slot");

    expect(result.migrated).toBe(true);
    expect(result.envelope.formatVersion).toBe("1.0.0");
    expect(calls).toEqual(["true"]);
  });

  it("throws clear errors for corrupted saves and missing migration paths", async () => {
    const store = createMemorySaveStore();
    await store.write("broken", new TextEncoder().encode("{"), { id: "broken" });
    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store
    });

    await expect(manager.load("broken")).rejects.toMatchObject({ code: "save.decode_failed" });

    const codec = createJsonSaveCodec();
    await store.write(
      "old",
      await codec.encode({
        format: "gamekit.save",
        formatVersion: "0.1.0",
        appId: "app",
        gameId: "game",
        gameVersion: "0.1.0",
        createdAt: 1,
        updatedAt: 1,
        slot: { id: "old" },
        compatibility: {},
        payload: { runtime: runtime(), sections: {} }
      }),
      { id: "old", formatVersion: "0.1.0" }
    );
    await expect(manager.load("old")).rejects.toMatchObject({ code: "save.migration_missing" });
  });

  it("stores slots through platform storage without exposing platform details", async () => {
    const values = new Map<string, string>();
    const store = createPlatformStorageSaveStore({
      storage: {
        async getItem(key) {
          return values.get(key);
        },
        async setItem(key, value) {
          values.set(key, value);
        },
        async removeItem(key) {
          values.delete(key);
        },
        async clear() {
          values.clear();
        }
      }
    });
    const manager = createSaveManager({
      appId: "app",
      gameId: "game",
      gameVersion: "0.1.0",
      formatVersion: "1.0.0",
      store
    });

    await manager.save("slot-1", { runtime: runtime(5) });
    expect(await store.exists("slot-1")).toBe(true);
    expect(await manager.list()).toHaveLength(1);

    await manager.delete("slot-1");
    expect(await store.exists("slot-1")).toBe(false);
  });
});

function createContributor(id: string, calls: string[], order: number): SaveContributor {
  return {
    id,
    version: "1.0.0",
    order,
    capture() {
      calls.push(`${id}.capture`);
      return { id, version: "1.0.0", data: { id } };
    },
    restore() {
      calls.push(`${id}.restore`);
    }
  };
}
