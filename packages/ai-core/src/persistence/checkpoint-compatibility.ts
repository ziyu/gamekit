import { createAiError } from "../contracts/errors";
import type { AiAgentState } from "../controller/agent-state";
import type { AiAgentCheckpoint } from "./checkpoint";

export function validateAiCheckpointCompatibility(
  state: AiAgentState,
  checkpoint: AiAgentCheckpoint
): void {
  if (checkpoint.currentGoalId !== undefined && !state.goalsById.has(checkpoint.currentGoalId)) {
    throw incompatible(checkpoint, `goal ${checkpoint.currentGoalId} is not defined`);
  }
  if (checkpoint.task !== undefined) {
    const task = state.tasksById.get(checkpoint.task.taskId);
    if (
      checkpoint.currentGoalId === undefined ||
      task === undefined ||
      task.executor !== checkpoint.task.executorId
    ) {
      throw incompatible(checkpoint, `task ${checkpoint.task.taskId} is not compatible`);
    }
  }
  for (const [goalId] of checkpoint.cooldowns) {
    if (!state.goalsById.has(goalId)) {
      throw incompatible(checkpoint, `cooldown goal ${goalId} is not defined`);
    }
  }
  const sensorIds = new Set(state.sensors.map((sensor) => sensor.id));
  for (const [sensorId] of checkpoint.nextSensorAt) {
    if (!sensorIds.has(sensorId)) {
      throw incompatible(checkpoint, `sensor ${sensorId} is not defined`);
    }
  }
}

function incompatible(checkpoint: AiAgentCheckpoint, reason: string) {
  return createAiError("ai.invalid_config", "AI checkpoint does not match its definition", {
    agentId: checkpoint.binding.agentId,
    definitionId: checkpoint.binding.definitionId,
    reason
  });
}
