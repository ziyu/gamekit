import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIndexedDbSaveStore, type IndexedDbSaveStore } from "../src";
import { openSaveDatabase, SLOT_STORE } from "../src/adapter/database";

const stores: IndexedDbSaveStore[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
});
function fixture() {
  const indexedDB = new IDBFactory();
  const databaseName = crypto.randomUUID();
  const events: string[] = [];
  const open = (maxSaveBytes?: number) => {
    const store = createIndexedDbSaveStore({
      indexedDB,
      databaseName,
      ...(maxSaveBytes === undefined ? {} : { maxSaveBytes }),
      onDiagnostic: (event) => {
        events.push(event.code);
      }
    });
    stores.push(store);
    return store;
  };
  const corrupt = async (id: string, both = false) => {
    const db = await openSaveDatabase(indexedDB, databaseName);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SLOT_STORE, "readwrite");
      const store = transaction.objectStore(SLOT_STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        const value = request.result;
        value.current.data[0] ^= 255;
        if (both) value.backup.data[0] ^= 255;
        store.put(value);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  };
  return { open, corrupt, events };
}
const bytes = (value: number) => new Uint8Array([value, value + 1]);
async function write(store: IndexedDbSaveStore, value: number, id = "slot") {
  await store.write(id, bytes(value), { id, label: `revision-${value}` });
}

describe("IndexedDB transactional saves", () => {
  it("persists data, metadata and one previous revision across connections", async () => {
    const f = fixture(),
      first = f.open();
    await write(first, 1);
    await write(first, 2);
    await first.dispose();
    const second = f.open();
    expect(await second.read("slot")).toEqual(bytes(2));
    expect(await second.readBackup("slot")).toEqual(bytes(1));
    expect(await second.list()).toEqual([{ id: "slot", label: "revision-2" }]);
    await second.delete("slot");
    expect(await second.list()).toEqual([]);
    await expect(second.readBackup("slot")).rejects.toMatchObject({ code: "save.missing_slot" });
  });
  it("rejects stale writes and deletes from another window", async () => {
    const f = fixture(),
      a = f.open(),
      b = f.open();
    await write(a, 1);
    await b.read("slot");
    await write(a, 2);
    await expect(write(b, 3)).rejects.toMatchObject({ code: "save.write_conflict" });
    await expect(b.delete("slot")).rejects.toMatchObject({ code: "save.write_conflict" });
    expect(await b.read("slot")).toEqual(bytes(2));
    await write(b, 4);
    expect(await a.read("slot")).toEqual(bytes(4));
  });
  it("does not silently overwrite an existing slot without reading it", async () => {
    const f = fixture(),
      a = f.open(),
      b = f.open();
    await write(a, 1);
    await b.exists("slot");
    await b.list();
    await expect(write(b, 2)).rejects.toMatchObject({ code: "save.write_conflict" });
  });
  it("allows only one concurrent first commit across connections", async () => {
    const f = fixture(),
      a = f.open(),
      b = f.open();
    const results = await Promise.allSettled([write(a, 1), write(b, 2)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await a.read("slot")).toEqual(await b.read("slot"));
  });
  it("leaves the complete previous record unchanged when a transaction aborts", async () => {
    const f = fixture(),
      store = f.open();
    await write(store, 1);
    await write(store, 2);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = original.apply(this, args);
      queueMicrotask(() => this.transaction.abort());
      return request;
    });
    await expect(write(store, 3)).rejects.toThrow();
    expect(await store.read("slot")).toEqual(bytes(2));
    expect(await store.readBackup("slot")).toEqual(bytes(1));
    expect(await store.list()).toEqual([{ id: "slot", label: "revision-2" }]);
  });
  it("reports quota failure and preserves progress", async () => {
    const f = fixture(),
      store = f.open();
    await write(store, 1);
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await expect(write(store, 2)).rejects.toMatchObject({ code: "save.quota_exceeded" });
    expect(await store.read("slot")).toEqual(bytes(1));
  });
  it("loads a valid backup after corruption and does not rotate corruption into backup", async () => {
    const f = fixture(),
      store = f.open();
    await write(store, 1);
    await write(store, 2);
    await f.corrupt("slot");
    expect(await store.read("slot")).toEqual(bytes(1));
    expect(await store.list()).toEqual([{ id: "slot", label: "revision-1" }]);
    expect(f.events).toContain("save.backup_recovered");
    await write(store, 3);
    expect(await store.readBackup("slot")).toEqual(bytes(1));
    expect(await store.read("slot")).toEqual(bytes(3));
  });
  it("isolates a corrupt slot from the remaining slot list", async () => {
    const f = fixture(),
      store = f.open();
    await write(store, 1);
    await write(store, 2);
    await write(store, 4, "good");
    await f.corrupt("slot", true);
    await expect(store.read("slot")).rejects.toMatchObject({ code: "save.corrupted" });
    expect(await store.list()).toEqual([{ id: "good", label: "revision-4" }]);
    await expect(write(store, 3)).rejects.toMatchObject({ code: "save.corrupted" });
  });
  it("copies caller data before asynchronous writes and rejects oversized saves", async () => {
    const f = fixture(),
      store = f.open(2);
    const data = bytes(1),
      metadata = { id: "slot", tags: ["safe"] };
    const saving = store.write("slot", data, metadata);
    data.fill(9);
    metadata.tags[0] = "mutated";
    await saving;
    expect(await store.read("slot")).toEqual(bytes(1));
    expect(await store.list()).toEqual([{ id: "slot", tags: ["safe"] }]);
    await expect(store.write("slot", new Uint8Array(3), metadata)).rejects.toMatchObject({
      code: "save.size_exceeded"
    });
  });
  it("isolates observer errors and closes without reopening", async () => {
    const store = createIndexedDbSaveStore({
      indexedDB: new IDBFactory(),
      databaseName: "observer",
      onDiagnostic() {
        throw new Error("observer");
      }
    });
    stores.push(store);
    await write(store, 1);
    await store.dispose();
    await store.dispose();
    await expect(store.read("slot")).rejects.toMatchObject({ code: "save.store_disposed" });
  });
});
