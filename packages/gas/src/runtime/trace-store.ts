import type { GasTraceEntry, GasTraceStore } from "./types";

export type CreateGasTraceStoreOptions = {
  limit?: number;
  onEntry?(entry: GasTraceEntry): void;
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
      entries.push(trace);
      if (entries.length > limit) {
        entries.shift();
      }
      options.onEntry?.(trace);
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
