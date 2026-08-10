import type { AiAgentBinding } from "../contracts/agent-binding";
import { cloneAiAgentBinding } from "../contracts/clone-binding";
import type { CompiledAiAgentDefinition } from "../definition/compiled-agent-definition";
import { createAiBlackboard, type AiBlackboardValueLimits } from "../memory";
import { effectiveAiInterval, stableAiScheduleOffset } from "../scheduler/timing";
import type { AiAgentState } from "./agent-state";

export function createAiAgentState(options: {
  binding: AiAgentBinding;
  compiled: CompiledAiAgentDefinition;
  elapsed: number;
  blackboardLimit: number;
  blackboardValueLimits: AiBlackboardValueLimits;
}): AiAgentState {
  const { binding, compiled } = options;
  const decisionInterval = effectiveAiInterval(
    compiled.definition.decisionIntervalMs,
    compiled.schedulerClass.decisionIntervalMultiplier
  );
  const state: AiAgentState = {
    binding: cloneAiAgentBinding(binding),
    definition: compiled.definition,
    sensors: compiled.sensors,
    goals: compiled.goals,
    goalsById: compiled.goalsById,
    tasksById: compiled.tasksById,
    schedulerClass: compiled.schedulerClass,
    memory: new Map(),
    blackboard: createAiBlackboard({
      limit: options.blackboardLimit,
      valueLimits: options.blackboardValueLimits
    }),
    currentGoalId: undefined,
    currentGoalScore: undefined,
    committedUntil: undefined,
    task: undefined,
    cooldowns: new Map(),
    nextDecisionAt: options.elapsed + stableAiScheduleOffset(binding.agentId, decisionInterval),
    nextSensorAt: new Map(),
    delayedDecisions: 0
  };
  for (const sensor of compiled.sensors) {
    const interval = effectiveAiInterval(
      sensor.intervalMs,
      compiled.schedulerClass.sensorIntervalMultiplier
    );
    state.nextSensorAt.set(
      sensor.id,
      options.elapsed + stableAiScheduleOffset(`${binding.agentId}:${sensor.id}`, interval)
    );
  }
  return state;
}
