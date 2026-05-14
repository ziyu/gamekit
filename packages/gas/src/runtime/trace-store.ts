import type { GasTraceEntry, GasTraceStore } from "./types";

export function createGasTraceStore(options: { limit?: number } = {}): GasTraceStore {
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
