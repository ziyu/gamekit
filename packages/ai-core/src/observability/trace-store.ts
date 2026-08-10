import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiTraceEntry, AiTraceKind, AiTraceRetentionOptions } from "./trace";

export type AiTraceStore = {
  push(entry: Omit<AiTraceEntry, "sequence"> & { kind: AiTraceKind }): void;
  snapshot(): AiTraceEntry[];
  clear(): void;
  size(): number;
};

export type CreateAiTraceStoreOptions = AiTraceRetentionOptions & {
  onEntry?: ((entry: AiTraceEntry) => void) | undefined;
  onEntryError?: ((error: unknown, entry: AiTraceEntry) => void) | undefined;
};

export function createAiTraceStore(options: CreateAiTraceStoreOptions = {}): AiTraceStore {
  const limit = readLimit(options.limit, 512);
  const retainedKinds = options.kinds === undefined ? undefined : new Set(options.kinds);
  const kindLimits = new Map<AiTraceKind, number>();
  for (const [kind, kindLimit] of Object.entries(options.kindLimits ?? {})) {
    if (kindLimit !== undefined) {
      kindLimits.set(kind as AiTraceKind, readLimit(kindLimit, limit));
    }
  }
  const retainedKindCounts = new Map<AiTraceKind, number>();
  const entries: AiTraceEntry[] = [];
  let sequence = 0;
  return {
    push(entry) {
      const value = cloneTrace({ ...entry, sequence });
      sequence += 1;
      const kindLimit = kindLimits.get(entry.kind) ?? limit;
      if (limit > 0 && kindLimit > 0 && retainedKinds?.has(entry.kind) !== false) {
        entries.push(value);
        if (kindLimits.has(entry.kind)) {
          retainedKindCounts.set(entry.kind, (retainedKindCounts.get(entry.kind) ?? 0) + 1);
          if ((retainedKindCounts.get(entry.kind) ?? 0) > kindLimit) {
            const oldestKindIndex = entries.findIndex((candidate) => candidate.kind === entry.kind);
            if (oldestKindIndex >= 0) {
              const [removed] = entries.splice(oldestKindIndex, 1);
              decrementRetainedKindCount(retainedKindCounts, removed?.kind);
            }
          }
        }
        if (entries.length > limit) {
          const removed = entries.splice(0, entries.length - limit);
          for (const removedEntry of removed) {
            decrementRetainedKindCount(retainedKindCounts, removedEntry.kind);
          }
        }
      }
      notifyEntry(options, value);
    },
    snapshot() {
      return entries.map(cloneTrace);
    },
    clear() {
      entries.length = 0;
      retainedKindCounts.clear();
    },
    size() {
      return entries.length;
    }
  };
}

function decrementRetainedKindCount(
  counts: Map<AiTraceKind, number>,
  kind: AiTraceKind | undefined
): void {
  if (kind === undefined || !counts.has(kind)) {
    return;
  }
  const next = (counts.get(kind) ?? 0) - 1;
  if (next <= 0) {
    counts.delete(kind);
    return;
  }
  counts.set(kind, next);
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
    ...(entry.payload === undefined ? {} : { payload: cloneAiRecord(entry.payload) })
  };
}

function readLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError("AI trace limit must be a non-negative integer");
  }
  return resolved;
}
