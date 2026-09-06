import { expect, it } from "vitest";
import { createSaveManager, createMemorySaveStore, type SaveEnvelope } from "../src";

it("diagnostic errors cannot turn a completed save into a reported failure", async () => {
  const manager = createSaveManager({
    appId: "app",
    gameId: "game",
    gameVersion: "1",
    formatVersion: "1",
    store: createMemorySaveStore(),
    diagnosticLimit: 2,
    onDiagnostic() {
      throw new Error("observer");
    },
    onDiagnosticError() {
      throw new Error("reporter");
    }
  });
  await manager.save("slot", { runtime: { seed: "s", clock: { ticks: 1, elapsed: 16 } } });
  expect((await manager.load("slot")).restored).toBe(true);
  expect(manager.snapshot().diagnostics).toHaveLength(2);
});

it("validates every section before restoring a supplied snapshot and isolates it from mutation", async () => {
  const manager = createSaveManager({
    appId: "app",
    gameId: "game",
    gameVersion: "1",
    formatVersion: "1",
    store: createMemorySaveStore()
  });
  manager.registerContributor({
    id: "a",
    version: "1",
    capture: () => ({ id: "a", version: "1", data: { value: 1 } }),
    restore(_context, section) {
      (section.data as { value: number }).value = 99;
    }
  });
  const saved = await manager.save("slot", {
    runtime: { seed: "s", clock: { ticks: 1, elapsed: 16 } }
  });
  await manager.restore(saved.envelope);
  expect(saved.envelope.payload.sections.a?.data).toEqual({ value: 1 });
  await expect(manager.restore({ ...saved.envelope, appId: "other" })).rejects.toMatchObject({
    code: "save.incompatible_app"
  });
  await expect(manager.restore({ ...saved.envelope, formatVersion: "other" })).rejects.toThrow();
  await expect(manager.restore(null as unknown as SaveEnvelope)).rejects.toThrow();
});

it("selects the backup only when explicitly requested through SaveManager", async () => {
  const store = createMemorySaveStore();
  let backup: Uint8Array | undefined;
  const manager = createSaveManager({
    appId: "app",
    gameId: "game",
    gameVersion: "1",
    formatVersion: "1",
    store: { ...store, readBackup: async () => backup! }
  });
  await manager.save("slot", { runtime: { seed: "s", clock: { ticks: 1, elapsed: 16 } } });
  backup = await store.read("slot");
  await manager.save("slot", { runtime: { seed: "s", clock: { ticks: 2, elapsed: 32 } } });
  expect((await manager.load("slot", { backup: true })).envelope.payload.runtime.clock.ticks).toBe(
    1
  );
  expect((await manager.load("slot")).envelope.payload.runtime.clock.ticks).toBe(2);
});
