import { createAiError } from "../contracts/errors";
import type { AiAgentCheckpoint, AiRuntimeCheckpoint } from "./checkpoint";

export function validateAiRuntimeCheckpoint(checkpoint: AiRuntimeCheckpoint): void {
  if (
    checkpoint.version !== 1 ||
    !Number.isFinite(checkpoint.elapsed) ||
    checkpoint.elapsed < 0 ||
    !Array.isArray(checkpoint.agents)
  ) {
    throw createAiError("ai.invalid_config", "AI checkpoint is invalid");
  }
  const agentIds = new Set<string>();
  for (const rawAgent of checkpoint.agents as unknown[]) {
    if (!isRecord(rawAgent)) {
      throw createAiError("ai.invalid_config", "AI checkpoint agent state is invalid");
    }
    const agent = rawAgent as AiAgentCheckpoint;
    if (
      typeof agent.binding?.agentId !== "string" ||
      agent.binding.agentId.length === 0 ||
      agentIds.has(agent.binding.agentId) ||
      typeof agent.binding.definitionId !== "string" ||
      agent.binding.definitionId.length === 0 ||
      (agent.schedulerClassId !== undefined &&
        (typeof agent.schedulerClassId !== "string" || agent.schedulerClassId.length === 0)) ||
      !Array.isArray(agent.memory) ||
      typeof agent.blackboard !== "object" ||
      agent.blackboard === null ||
      Array.isArray(agent.blackboard) ||
      !Array.isArray(agent.cooldowns) ||
      !agent.cooldowns.every(validScheduleEntry) ||
      !Array.isArray(agent.nextSensorAt) ||
      !agent.nextSensorAt.every(validScheduleEntry) ||
      !Number.isFinite(agent.nextDecisionAt) ||
      agent.nextDecisionAt < 0 ||
      !Number.isSafeInteger(agent.delayedDecisions) ||
      agent.delayedDecisions < 0 ||
      !validOptionalFinite(agent.currentGoalScore, 0, 1) ||
      !validOptionalFinite(agent.committedUntil, 0) ||
      (agent.currentGoalId !== undefined &&
        (typeof agent.currentGoalId !== "string" || agent.currentGoalId.length === 0)) ||
      !validTask(agent.task)
    ) {
      throw createAiError("ai.invalid_config", "AI checkpoint agent state is invalid", {
        agentId: agent.binding?.agentId
      });
    }
    agentIds.add(agent.binding.agentId);
  }
}

function validScheduleEntry(entry: [string, number]): boolean {
  return (
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === "string" &&
    entry[0].length > 0 &&
    Number.isFinite(entry[1]) &&
    entry[1] >= 0
  );
}

function validTask(task: AiAgentCheckpoint["task"]): boolean {
  return (
    task === undefined ||
    (typeof task.taskId === "string" &&
      task.taskId.length > 0 &&
      typeof task.executorId === "string" &&
      task.executorId.length > 0 &&
      (["starting", "running"] as unknown[]).includes(task.status) &&
      Number.isFinite(task.startedAt) &&
      task.startedAt >= 0 &&
      Number.isFinite(task.updatedAt) &&
      task.updatedAt >= task.startedAt &&
      typeof task.safeToInterrupt === "boolean" &&
      isRecord(task.state))
  );
}

function validOptionalFinite(
  value: number | undefined,
  minimum: number,
  maximum?: number
): boolean {
  return (
    value === undefined ||
    (Number.isFinite(value) && value >= minimum && (maximum === undefined || value <= maximum))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
