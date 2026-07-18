import type { CombatTraceEntry, CombatTraceStore } from "./types";

export type CreateCombatTraceStoreOptions = {
  enabled?: boolean | undefined;
  limit?: number | undefined;
  onEntry?(entry: CombatTraceEntry): void;
  onEntryError?(error: unknown, entry: CombatTraceEntry): void;
};

export function createCombatTraceStore(
  options: CreateCombatTraceStoreOptions = {}
): CombatTraceStore {
  const limit = readLimit(options.limit);
  const entries: CombatTraceEntry[] = [];
  let sequence = 0;

  return {
    add(entry) {
      sequence += 1;
      const trace: CombatTraceEntry = {
        id: `combat-trace-${sequence}`,
        ...entry
      };
      if (options.enabled === false) {
        return trace;
      }
      entries.push(trace);
      if (entries.length > limit) {
        entries.splice(0, entries.length - limit);
      }
      notifyEntry(options, trace);
      return trace;
    },
    list() {
      return entries.map(cloneTrace);
    },
    clear() {
      entries.length = 0;
    },
    snapshot() {
      return { entries: entries.map(cloneTrace) };
    }
  };
}

function readLimit(value: number | undefined): number {
  if (value === undefined) {
    return 256;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Combat trace limit must be a non-negative integer");
  }
  return value;
}

function notifyEntry(options: CreateCombatTraceStoreOptions, entry: CombatTraceEntry): void {
  if (!options.onEntry) {
    return;
  }
  try {
    options.onEntry(cloneTrace(entry));
  } catch (error) {
    try {
      options.onEntryError?.(error, cloneTrace(entry));
    } catch {
      // Diagnostic observers cannot change combat results.
    }
  }
}

function cloneTrace(entry: CombatTraceEntry): CombatTraceEntry {
  return {
    ...entry,
    ...(entry.details === undefined ? {} : { details: { ...entry.details } })
  };
}
