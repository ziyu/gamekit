import type { PhysicsTraceEntry, PhysicsTraceStore } from "./types";

export type CreatePhysicsTraceStoreOptions = {
  limit?: number;
  onEntry?(entry: PhysicsTraceEntry): void;
  onEntryError?(error: unknown, entry: PhysicsTraceEntry): void;
};

export function createPhysicsTraceStore(
  options: CreatePhysicsTraceStoreOptions = {}
): PhysicsTraceStore {
  const limit = options.limit ?? 200;
  const entries: PhysicsTraceEntry[] = [];
  let nextId = 1;

  return {
    push(entry) {
      const materialized: PhysicsTraceEntry = {
        id: `physics-trace-${nextId}`,
        ...entry
      };
      nextId += 1;
      entries.push(materialized);
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
      notifyEntry(options, materialized);

      return materialized;
    },
    list() {
      return [...entries];
    },
    clear() {
      entries.length = 0;
    }
  };
}

function notifyEntry(options: CreatePhysicsTraceStoreOptions, entry: PhysicsTraceEntry): void {
  if (!options.onEntry) {
    return;
  }
  try {
    options.onEntry(entry);
  } catch (error) {
    try {
      options.onEntryError?.(error, entry);
    } catch {
      // Trace observers are diagnostic-only and must never interrupt gameplay.
    }
  }
}
