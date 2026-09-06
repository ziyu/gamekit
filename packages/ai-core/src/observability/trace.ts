import type { AiAgentId } from "../contracts/agent-binding";

export const AI_TRACE_KINDS = [
  "lifecycle",
  "perception",
  "decision",
  "goal",
  "task",
  "intent",
  "budget"
] as const;

export type AiTraceKind = (typeof AI_TRACE_KINDS)[number];

export type AiTraceRetentionOptions = {
  /** Global hard limit for retained entries. */
  limit?: number | undefined;
  /** Optional allow-list. Omit it to retain every trace kind. */
  kinds?: readonly AiTraceKind[] | undefined;
  /** Optional caps applied before the global hard limit. Zero disables retention for that kind. */
  kindLimits?: Partial<Record<AiTraceKind, number>> | undefined;
};

export type AiGoalScoreTraceDetail = "summary" | "winner" | "all";

export type AiTraceProductionOptions = {
  /** Hard cap for trace entries produced by one runtime update. */
  maxEntriesPerUpdate?: number | undefined;
  /** Controls whether utility consideration details are copied into decision trace. */
  goalScoreDetail?: AiGoalScoreTraceDetail | undefined;
  /** Emits one budget summary when entries are dropped during an update. */
  emitDropSummary?: boolean | undefined;
};

export type AiTraceEntry = {
  sequence: number;
  kind: AiTraceKind;
  label: string;
  timestamp: number;
  agentId?: AiAgentId | undefined;
  payload?: Record<string, unknown> | undefined;
};
