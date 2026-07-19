import type { AiTraceEntry, AiTraceKind } from "./types";

export type AiTraceStore = {
  push(entry: Omit<AiTraceEntry, "sequence"> & { kind: AiTraceKind }): void;
  snapshot(): AiTraceEntry[];
  clear(): void;
  size(): number;
};

export type CreateAiTraceStoreOptions = {
  limit?: number | undefined;
  onEntry?: ((entry: AiTraceEntry) => void) | undefined;
  onEntryError?: ((error: unknown, entry: AiTraceEntry) => void) | undefined;
};

export function createAiTraceStore(options: CreateAiTraceStoreOptions = {}): AiTraceStore {
  const limit = readLimit(options.limit, 512);
  const entries: AiTraceEntry[] = [];
  let sequence = 0;
  return {
    push(entry) {
      if (limit <= 0) {
        return;
      }
      const value = { ...entry, sequence };
      entries.push(value);
      sequence += 1;
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
      notifyEntry(options, value);
    },
    snapshot() {
      return entries.map((entry) => ({
        ...entry,
        ...(entry.payload === undefined ? {} : { payload: { ...entry.payload } })
      }));
    },
    clear() {
      entries.length = 0;
    },
    size() {
      return entries.length;
    }
  };
}

function notifyEntry(options: CreateAiTraceStoreOptions, entry: AiTraceEntry): void {
  if (options.onEntry === undefined) {
    return;
  }
  try {
    options.onEntry(cloneTrace(entry));
  } catch (error) {
    try {
      options.onEntryError?.(error, cloneTrace(entry));
    } catch {
      // Trace observers are diagnostic-only and cannot change AI decisions.
    }
  }
}

function cloneTrace(entry: AiTraceEntry): AiTraceEntry {
  return {
    ...entry,
    ...(entry.payload === undefined ? {} : { payload: { ...entry.payload } })
  };
}

function readLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError("AI trace limit must be a non-negative integer");
  }
  return resolved;
}
