import type { AiAgentBinding } from "../contracts/agent-binding";
import type { AiTaskState } from "../task/task-executor";

export type AiAgentSnapshot = {
  binding: AiAgentBinding;
  schedulerClassId: string;
  goalId?: string | undefined;
  goalScore?: number | undefined;
  committedUntil?: number | undefined;
  task?: AiTaskState | undefined;
  memorySize: number;
  blackboardSize: number;
  blackboardLimit: number;
  blackboardKeys: string[];
  nextDecisionAt: number;
  delayedDecisions: number;
};

export type AiRuntimeSnapshot = {
  id: string;
  elapsed: number;
  disposed: boolean;
  compiledDefinitions: number;
  agents: AiAgentSnapshot[];
  activeTasks: number;
  memoryFacts: number;
  intentsEmitted: number;
  delayedSensorSamples: number;
  delayedDecisions: number;
  rejectedPathRequests: number;
  droppedTraceEntries: number;
  traceEntries: number;
};
