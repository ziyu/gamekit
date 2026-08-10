import type { AnimatorTraceEntry, AnimatorTraceKind } from "./animator-trace";
import { cloneAnimatorTrace } from "./animator-trace";

export type AnimatorTraceStore = {
  push(
    kind: AnimatorTraceKind,
    label: string,
    controllerId?: string | undefined,
    payload?: Record<string, unknown> | undefined
  ): void;
  entries(): AnimatorTraceEntry[];
  size(): number;
  clear(): void;
};

export function createAnimatorTraceStore(options: {
  limit: number;
  clock: () => number;
  onTrace?: ((entry: AnimatorTraceEntry) => void) | undefined;
  onTraceError?: ((error: unknown, entry: AnimatorTraceEntry) => void) | undefined;
}): AnimatorTraceStore {
  const traces: AnimatorTraceEntry[] = [];
  let sequence = 0;

  return {
    push(kind, label, controllerId, payload) {
      if (options.limit === 0) {
        return;
      }
      const entry: AnimatorTraceEntry = {
        sequence,
        kind,
        label,
        timestamp: options.clock(),
        ...(controllerId === undefined ? {} : { controllerId }),
        ...(payload === undefined ? {} : { payload: { ...payload } })
      };
      sequence += 1;
      traces.push(entry);
      if (traces.length > options.limit) {
        traces.splice(0, traces.length - options.limit);
      }
      notifyTraceObservers(options, entry);
    },
    entries() {
      return traces.map(cloneAnimatorTrace);
    },
    size() {
      return traces.length;
    },
    clear() {
      traces.length = 0;
    }
  };
}

function notifyTraceObservers(
  options: {
    onTrace?: ((entry: AnimatorTraceEntry) => void) | undefined;
    onTraceError?: ((error: unknown, entry: AnimatorTraceEntry) => void) | undefined;
  },
  entry: AnimatorTraceEntry
): void {
  if (options.onTrace === undefined) {
    return;
  }
  try {
    options.onTrace(cloneAnimatorTrace(entry));
  } catch (error) {
    try {
      options.onTraceError?.(error, cloneAnimatorTrace(entry));
    } catch {
      // Trace observers are diagnostic-only and cannot change animation playback.
    }
  }
}
