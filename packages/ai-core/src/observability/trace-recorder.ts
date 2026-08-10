import type { AiTraceEntry, AiTraceKind } from "./trace";
import type { AiTraceStore } from "./trace-store";

export type AiTraceRecorder = {
  beginUpdate(): void;
  push(entry: Omit<AiTraceEntry, "sequence"> & { kind: AiTraceKind }): void;
  endUpdate(timestamp: number): void;
  dropped(): number;
};

export function createAiTraceRecorder(options: {
  store: AiTraceStore;
  enabled: boolean;
  maxEntriesPerUpdate: number;
  emitDropSummary: boolean;
}): AiTraceRecorder {
  let updating = false;
  let producedThisUpdate = 0;
  let droppedThisUpdate = 0;
  let droppedTotal = 0;
  const droppedKinds = new Map<AiTraceKind, number>();

  return {
    beginUpdate() {
      updating = true;
      producedThisUpdate = 0;
      droppedThisUpdate = 0;
      droppedKinds.clear();
    },
    push(entry) {
      if (!options.enabled) {
        return;
      }
      if (updating && producedThisUpdate >= options.maxEntriesPerUpdate) {
        droppedThisUpdate += 1;
        droppedTotal += 1;
        droppedKinds.set(entry.kind, (droppedKinds.get(entry.kind) ?? 0) + 1);
        return;
      }
      if (updating) {
        producedThisUpdate += 1;
      }
      options.store.push(entry);
    },
    endUpdate(timestamp) {
      updating = false;
      if (!options.enabled || !options.emitDropSummary || droppedThisUpdate === 0) {
        return;
      }
      options.store.push({
        kind: "budget",
        label: "ai.trace_dropped",
        timestamp,
        payload: {
          dropped: droppedThisUpdate,
          kinds: Object.fromEntries(
            [...droppedKinds.entries()].sort(([left], [right]) => left.localeCompare(right))
          )
        }
      });
    },
    dropped() {
      return droppedTotal;
    }
  };
}
