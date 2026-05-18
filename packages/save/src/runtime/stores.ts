import type {
  FsBaseDir,
  PlatformFileSystem,
  PlatformPath,
  PlatformStorage
} from "@gamekit/platform-core";
import { createMissingSlotError } from "./errors";
import type { SaveSlotId, SaveSlotSummary, SaveStore } from "./types";

export type PlatformStorageSaveStoreOptions = {
  storage: PlatformStorage;
  prefix?: string;
};

export type PlatformFileSaveStoreOptions = {
  fs: PlatformFileSystem;
  path: PlatformPath;
  directory?: string;
  baseDir?: FsBaseDir;
};

export function createMemorySaveStore(
  initialEntries: Array<{
    slotId: SaveSlotId;
    data: Uint8Array;
    metadata: SaveSlotSummary;
  }> = []
): SaveStore {
  const slots = new Map<SaveSlotId, { data: Uint8Array; metadata: SaveSlotSummary }>();
  for (const entry of initialEntries) {
    slots.set(entry.slotId, {
      data: copyBytes(entry.data),
      metadata: { ...entry.metadata }
    });
  }

  return {
    async list() {
      return [...slots.values()].map((entry) => ({ ...entry.metadata }));
    },
    async read(slotId) {
      const entry = slots.get(slotId);
      if (!entry) {
        throw createMissingSlotError(slotId);
      }
      return copyBytes(entry.data);
    },
    async write(slotId, data, metadata) {
      slots.set(slotId, {
        data: copyBytes(data),
        metadata: { ...metadata, id: slotId }
      });
    },
    async delete(slotId) {
      if (!slots.delete(slotId)) {
        throw createMissingSlotError(slotId);
      }
    },
    async exists(slotId) {
      return slots.has(slotId);
    }
  };
}

export function createPlatformStorageSaveStore(
  options: PlatformStorageSaveStoreOptions
): SaveStore {
  const prefix = options.prefix ?? "gamekit.save";
  const indexKey = `${prefix}.index`;

  return {
    async list() {
      return readStorageIndex(options.storage, indexKey);
    },
    async read(slotId) {
      const value = await options.storage.getItem(slotKey(prefix, slotId));
      if (value === undefined) {
        throw createMissingSlotError(slotId);
      }
      return decodeBase64(value);
    },
    async write(slotId, data, metadata) {
      await options.storage.setItem(slotKey(prefix, slotId), encodeBase64(data));
      const index = await readStorageIndex(options.storage, indexKey);
      const nextIndex = [
        ...index.filter((entry) => entry.id !== slotId),
        { ...metadata, id: slotId }
      ];
      await options.storage.setItem(indexKey, JSON.stringify(nextIndex));
    },
    async delete(slotId) {
      if (!(await this.exists(slotId))) {
        throw createMissingSlotError(slotId);
      }
      await options.storage.removeItem(slotKey(prefix, slotId));
      const index = await readStorageIndex(options.storage, indexKey);
      await options.storage.setItem(
        indexKey,
        JSON.stringify(index.filter((entry) => entry.id !== slotId))
      );
    },
    async exists(slotId) {
      return (await options.storage.getItem(slotKey(prefix, slotId))) !== undefined;
    }
  };
}

export function createPlatformFileSaveStore(options: PlatformFileSaveStoreOptions): SaveStore {
  const directory = options.directory ?? "saves";
  const baseDir = options.baseDir ?? "appData";
  const deletedSlots = new Set<SaveSlotId>();

  return {
    async list() {
      if (!(await options.fs.exists(directory, { baseDir }))) {
        return [];
      }
      const entries = await options.fs.listDir(directory, { baseDir });
      const summaries: SaveSlotSummary[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name.endsWith(".json")) {
          continue;
        }
        const text = await options.fs.readText(options.path.join(directory, entry.name), {
          baseDir
        });
        const metadata = JSON.parse(text) as SaveSlotSummary;
        if (metadata && !deletedSlots.has(metadata.id)) {
          summaries.push(metadata);
        }
      }
      return summaries;
    },
    async read(slotId) {
      const path = slotDataPath(options.path, directory, slotId);
      if (!(await options.fs.exists(path, { baseDir }))) {
        throw createMissingSlotError(slotId);
      }
      return options.fs.readBinary(path, { baseDir });
    },
    async write(slotId, data, metadata) {
      deletedSlots.delete(slotId);
      await options.fs.createDir(directory, { baseDir, recursive: true });
      await options.fs.writeBinary(slotDataPath(options.path, directory, slotId), data, {
        baseDir
      });
      await options.fs.writeText(
        slotMetadataPath(options.path, directory, slotId),
        JSON.stringify({ ...metadata, id: slotId }),
        { baseDir }
      );
    },
    async delete(slotId) {
      if (!(await this.exists(slotId))) {
        throw createMissingSlotError(slotId);
      }
      deletedSlots.add(slotId);
    },
    async exists(slotId) {
      return (
        !deletedSlots.has(slotId) &&
        (await options.fs.exists(slotDataPath(options.path, directory, slotId), { baseDir }))
      );
    }
  };
}

function slotKey(prefix: string, slotId: SaveSlotId): string {
  return `${prefix}.slot.${slotId}`;
}

function slotDataPath(path: PlatformPath, directory: string, slotId: SaveSlotId): string {
  return path.join(directory, `${slotId}.save`);
}

function slotMetadataPath(path: PlatformPath, directory: string, slotId: SaveSlotId): string {
  return path.join(directory, `${slotId}.json`);
}

async function readStorageIndex(
  storage: PlatformStorage,
  indexKey: string
): Promise<SaveSlotSummary[]> {
  const value = await storage.getItem(indexKey);
  if (!value) {
    return [];
  }
  return JSON.parse(value) as SaveSlotSummary[];
}

function copyBytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(data);
}

function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(data: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(data, "base64"));
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
