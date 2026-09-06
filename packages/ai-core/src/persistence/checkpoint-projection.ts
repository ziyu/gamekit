import { cloneAiAgentBinding } from "../contracts/clone-binding";
import type { AiAgentState } from "../controller/agent-state";
import { listAiPerceptionFacts, retainAiPerceptionFacts } from "../perception/perception-memory";
import { cloneAiTaskState } from "../task/clone-task-state";
import type { AiAgentCheckpoint } from "./checkpoint";

export function projectAiAgentCheckpoint(state: AiAgentState): AiAgentCheckpoint {
  return {
    binding: cloneAiAgentBinding(state.binding),
    schedulerClassId: state.schedulerClass.id,
    memory: listAiPerceptionFacts(state.memory),
    blackboard: state.blackboard.capture(),
    ...(state.currentGoalId === undefined ? {} : { currentGoalId: state.currentGoalId }),
    ...(state.currentGoalScore === undefined ? {} : { currentGoalScore: state.currentGoalScore }),
    ...(state.committedUntil === undefined ? {} : { committedUntil: state.committedUntil }),
    ...(state.task === undefined ? {} : { task: cloneAiTaskState(state.task) }),
    cooldowns: [...state.cooldowns.entries()].sort(([left], [right]) => left.localeCompare(right)),
    nextDecisionAt: state.nextDecisionAt,
    nextSensorAt: [...state.nextSensorAt.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    ),
    delayedDecisions: state.delayedDecisions
  };
}

export function restoreAiAgentCheckpoint(state: AiAgentState, checkpoint: AiAgentCheckpoint): void {
  state.memory.clear();
  retainAiPerceptionFacts(state.memory, checkpoint.memory, state.definition.memoryLimit);
  state.blackboard.replace(checkpoint.blackboard);
  state.currentGoalId = checkpoint.currentGoalId;
  state.currentGoalScore = checkpoint.currentGoalScore;
  state.committedUntil = checkpoint.committedUntil;
  state.task = checkpoint.task === undefined ? undefined : cloneAiTaskState(checkpoint.task);
  state.cooldowns = new Map(checkpoint.cooldowns);
  state.nextDecisionAt = checkpoint.nextDecisionAt;
  state.nextSensorAt = new Map(checkpoint.nextSensorAt);
  state.delayedDecisions = checkpoint.delayedDecisions;
}
