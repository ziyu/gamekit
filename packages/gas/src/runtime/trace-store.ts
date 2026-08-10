import type { GasTraceEntry, GasTraceStore } from "./types";

export type CreateGasTraceStoreOptions = {
  enabled?: boolean;
  limit?: number;
  onEntry?(entry: GasTraceEntry): void;
  onEntryError?(error: unknown, entry: GasTraceEntry): void;
};

export function createGasTraceStore(options: CreateGasTraceStoreOptions = {}): GasTraceStore {
  const limit = options.limit ?? 100;
  const entries: GasTraceEntry[] = [];
  let sequence = 0;

  return {
    add(entry) {
      sequence += 1;
      const trace: GasTraceEntry = {
        id: `gas-trace-${sequence}`,
        ...entry
      };
      if (options.enabled === false) {
        return trace;
      }
      entries.push(trace);
      if (entries.length > limit) {
        entries.shift();
      }
      notifyEntry(options, trace);
      return trace;
    },
    list() {
      return [...entries];
    },
    clear() {
      entries.length = 0;
    },
    snapshot() {
      return {
        entries: [...entries]
      };
    }
  };
}

function notifyEntry(options: CreateGasTraceStoreOptions, entry: GasTraceEntry): void {
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
