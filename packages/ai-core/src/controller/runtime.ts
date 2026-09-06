import type { AiAgentBinding, AiAgentId } from "../contracts/agent-binding";
import type { AiBlackboardValue } from "../contracts/blackboard-value";
import type { AiGoalScore } from "../decision/utility";
import type { AiAgentSnapshot, AiRuntimeSnapshot } from "../observability/snapshot";
import type { AiTraceEntry } from "../observability/trace";
import type { AiPerceptionFact } from "../perception/perception-fact";
import type { AiRestoreOptions, AiRuntimeCheckpoint } from "../persistence/checkpoint";

export type AiRuntime = {
  bind(binding: AiAgentBinding): void;
  unbind(agentId: AiAgentId, reason?: string | undefined): void;
  hasAgent(agentId: AiAgentId): boolean;
  observe(agentId: AiAgentId, facts: AiPerceptionFact[]): void;
  setBlackboard(agentId: AiAgentId, key: string, value: AiBlackboardValue): void;
  deleteBlackboard(agentId: AiAgentId, key: string): void;
  setSchedulerClass(agentId: AiAgentId, schedulerClassId: string): void;
  getAgent(agentId: AiAgentId): AiAgentSnapshot | undefined;
  listAgents(): AiAgentSnapshot[];
  scoreGoals(agentId: AiAgentId): AiGoalScore[];
  update(deltaMs: number, elapsedMs: number): void;
  captureCheckpoint(): AiRuntimeCheckpoint;
  restoreCheckpoint(checkpoint: AiRuntimeCheckpoint, options?: AiRestoreOptions | undefined): void;
  snapshot(): AiRuntimeSnapshot;
  traces(): AiTraceEntry[];
  dispose(): void;
};

export type AiHandle = Omit<AiRuntime, "update" | "dispose"> & {
  isBound(): boolean;
};
