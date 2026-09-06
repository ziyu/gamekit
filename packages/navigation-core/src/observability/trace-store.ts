import type { NavigationTraceEntry, NavigationTraceKind } from "../contracts/observability";

export type NavigationTraceStore = {
  push(
    entry: Omit<NavigationTraceEntry, "sequence"> & { kind: NavigationTraceKind }
  ): NavigationTraceEntry;
  snapshot(): NavigationTraceEntry[];
  clear(): void;
  size(): number;
};

export type CreateNavigationTraceStoreOptions = {
  limit?: number | undefined;
  onEntry?: ((entry: NavigationTraceEntry) => void) | undefined;
  onEntryError?: ((error: unknown, entry: NavigationTraceEntry) => void) | undefined;
};

export function createNavigationTraceStore(
  options: CreateNavigationTraceStoreOptions = {}
): NavigationTraceStore {
  const limit = readLimit(options.limit, 256);
  const entries: NavigationTraceEntry[] = [];
  let sequence = 0;
  return {
    push(entry) {
      const value = { ...entry, sequence };
      sequence += 1;
      if (limit > 0) {
        entries.push(value);
        if (entries.length > limit) {
          entries.splice(0, entries.length - limit);
        }
      }
      notifyEntry(options, value);
      return value;
    },
    snapshot: () => entries.map(cloneTrace),
    clear: () => {
      entries.length = 0;
    },
    size: () => entries.length
  };
}

function notifyEntry(
  options: CreateNavigationTraceStoreOptions,
  entry: NavigationTraceEntry
): void {
  if (options.onEntry === undefined) {
    return;
  }
  try {
    options.onEntry(cloneTrace(entry));
  } catch (error) {
    try {
      options.onEntryError?.(error, cloneTrace(entry));
    } catch {
      // Trace observers are diagnostic-only and cannot change navigation results.
    }
  }
}

function cloneTrace(entry: NavigationTraceEntry): NavigationTraceEntry {
  return {
    ...entry,
    ...(entry.payload === undefined ? {} : { payload: { ...entry.payload } })
  };
}

function readLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError("Navigation trace limit must be a non-negative integer");
  }
  return resolved;
}
