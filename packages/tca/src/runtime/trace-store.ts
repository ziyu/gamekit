import type { TcaTraceEntry, TcaTraceSnapshot, TcaTraceStore } from "./types";

export type CreateTcaTraceStoreOptions = {
  limit?: number | undefined;
  onEntry?(entry: TcaTraceEntry): void;
  onEntryError?(error: unknown, entry: TcaTraceEntry): void;
};

export function createTcaTraceStore(options: CreateTcaTraceStoreOptions = {}): TcaTraceStore {
  const limit = options.limit ?? 100;
  const entries: TcaTraceEntry[] = [];
  let nextId = 0;

  return {
    add(entry) {
      const traceEntry: TcaTraceEntry = {
        ...entry,
        id: entry.id ?? `tca-trace-${nextId}`
      };
      nextId += 1;
      entries.push(traceEntry);
      while (entries.length > limit) {
        entries.shift();
      }
      notifyEntry(options, traceEntry);
      return traceEntry;
    },
    list() {
      return [...entries];
    },
    clear() {
      entries.length = 0;
    },
    snapshot(): TcaTraceSnapshot {
      return {
        entries: [...entries]
      };
    }
  };
}

function notifyEntry(options: CreateTcaTraceStoreOptions, entry: TcaTraceEntry): void {
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
