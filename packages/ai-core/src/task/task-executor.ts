import type { AiAgentReadContext } from "../contracts/agent-context";
import type { AiBlackboardValue } from "../contracts/blackboard-value";
import type { AiIntentInput } from "../contracts/intent";
import type { AiGoalDefinition } from "../definition/goal-definition";
import type { AiTaskDefinition } from "../definition/task-definition";

export type AiTaskStatus = "starting" | "running" | "succeeded" | "failed" | "cancelled";

export type AiTaskStep = {
  status: "running" | "succeeded" | "failed";
  state?: Record<string, unknown> | undefined;
  safeToInterrupt?: boolean | undefined;
  reason?: string | undefined;
};

export type AiTaskContext = AiAgentReadContext & {
  goal: AiGoalDefinition;
  task: AiTaskDefinition;
  state: Record<string, unknown>;
  emit(intent: AiIntentInput): void;
  setBlackboard(key: string, value: AiBlackboardValue): void;
  deleteBlackboard(key: string): void;
};

export type AiTaskExecutor = {
  id: string;
  start(context: AiTaskContext): AiTaskStep;
  update(context: AiTaskContext, deltaMs: number): AiTaskStep;
  cancel?(context: AiTaskContext, reason: string): void;
};

export type AiTaskState = {
  taskId: string;
  executorId: string;
  status: AiTaskStatus;
  startedAt: number;
  updatedAt: number;
  safeToInterrupt: boolean;
  state: Record<string, unknown>;
  failureReason?: string | undefined;
};
