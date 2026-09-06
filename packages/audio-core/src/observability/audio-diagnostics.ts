export type AudioDiagnosticEntry = {
  sequence: number;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
};

export type AudioDiagnosticSink = {
  push(type: string, payload?: Record<string, unknown>): void;
  entries(): AudioDiagnosticEntry[];
  count(): number;
  clear(): void;
};

export function createAudioDiagnosticSink(options: {
  limit: number;
  clock(): number;
  onEntry?: ((entry: AudioDiagnosticEntry) => void) | undefined;
  onEntryError?: ((error: unknown, entry: AudioDiagnosticEntry) => void) | undefined;
}): AudioDiagnosticSink {
  const entries: AudioDiagnosticEntry[] = [];
  let sequence = 0;
  return {
    push(type, payload = {}) {
      if (options.limit === 0) {
        return;
      }
      const entry: AudioDiagnosticEntry = {
        sequence,
        type,
        timestamp: options.clock(),
        payload: { ...payload }
      };
      sequence += 1;
      entries.push(entry);
      if (entries.length > options.limit) {
        entries.splice(0, entries.length - options.limit);
      }
      if (options.onEntry !== undefined) {
        try {
          options.onEntry(cloneDiagnostic(entry));
        } catch (error) {
          try {
            options.onEntryError?.(error, cloneDiagnostic(entry));
          } catch {
            // Diagnostic observers cannot alter audio semantics.
          }
        }
      }
    },
    entries: () => entries.map(cloneDiagnostic),
    count: () => entries.length,
    clear() {
      entries.length = 0;
    }
  };
}

function cloneDiagnostic(entry: AudioDiagnosticEntry): AudioDiagnosticEntry {
  return { ...entry, payload: { ...entry.payload } };
}
