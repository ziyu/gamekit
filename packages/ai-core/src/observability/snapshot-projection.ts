import { cloneAiAgentBinding } from "../contracts/clone-binding";
import type { AiAgentState } from "../controller/agent-state";
import { cloneAiTaskState } from "../task/clone-task-state";
import type { AiAgentSnapshot, AiRuntimeSnapshot } from "./snapshot";

export function projectAiAgentSnapshot(state: AiAgentState): AiAgentSnapshot {
  return {
    binding: cloneAiAgentBinding(state.binding),
    schedulerClassId: state.schedulerClass.id,
    ...(state.currentGoalId === undefined ? {} : { goalId: state.currentGoalId }),
    ...(state.currentGoalScore === undefined ? {} : { goalScore: state.currentGoalScore }),
    ...(state.committedUntil === undefined ? {} : { committedUntil: state.committedUntil }),
    ...(state.task === undefined ? {} : { task: cloneAiTaskState(state.task) }),
    memorySize: state.memory.size,
    blackboardSize: state.blackboard.size,
    blackboardLimit: state.blackboard.limit,
    blackboardKeys: state.blackboard.keys(),
    nextDecisionAt: state.nextDecisionAt,
    delayedDecisions: state.delayedDecisions
  };
}

export function projectAiRuntimeSnapshot(options: {
  id: string;
  elapsed: number;
  disposed: boolean;
  compiledDefinitions: number;
  agents: readonly AiAgentState[];
  intentsEmitted: number;
  delayedSensorSamples: number;
  delayedDecisions: number;
  rejectedPathRequests: number;
  droppedTraceEntries: number;
  traceEntries: number;
}): AiRuntimeSnapshot {
  const agents = options.agents.map(projectAiAgentSnapshot);
  return {
    id: options.id,
    elapsed: options.elapsed,
    disposed: options.disposed,
    compiledDefinitions: options.compiledDefinitions,
    agents,
    activeTasks: agents.filter((agent) => agent.task?.status === "running").length,
    memoryFacts: agents.reduce((total, agent) => total + agent.memorySize, 0),
    intentsEmitted: options.intentsEmitted,
    delayedSensorSamples: options.delayedSensorSamples,
    delayedDecisions: options.delayedDecisions,
    rejectedPathRequests: options.rejectedPathRequests,
    droppedTraceEntries: options.droppedTraceEntries,
    traceEntries: options.traceEntries
  };
}
