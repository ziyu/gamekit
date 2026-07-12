import type { TcaTraceEntry, TcaTraceSnapshot, TcaTraceStore } from "./types";

export type CreateTcaTraceStoreOptions = {
  limit?: number | undefined;
  onEntry?(entry: TcaTraceEntry): void;
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
      options.onEntry?.(traceEntry);
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
