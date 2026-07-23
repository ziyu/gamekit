export type AnimatorTraceKind =
  | "lifecycle"
  | "parameter"
  | "transition"
  | "one-shot"
  | "phase"
  | "marker"
  | "playback"
  | "diagnostic";

export type AnimatorTraceEntry = {
  sequence: number;
  kind: AnimatorTraceKind;
  label: string;
  timestamp: number;
  controllerId?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export function cloneAnimatorTrace(trace: AnimatorTraceEntry): AnimatorTraceEntry {
  return {
    ...trace,
    ...(trace.payload === undefined ? {} : { payload: { ...trace.payload } })
  };
}
