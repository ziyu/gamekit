import type { AiAgentBinding } from "../contracts/agent-binding";
import type { AiAgentDefinition } from "../definition/agent-definition";
import type { AiGoalDefinition } from "../definition/goal-definition";
import type { AiSensorDefinition } from "../definition/sensor-definition";
import type { AiTaskDefinition } from "../definition/task-definition";
import type { AiBlackboard } from "../memory";
import type { AiPerceptionFact } from "../perception/perception-fact";
import type { AiSchedulerClass } from "../scheduler/scheduler-class";
import type { AiTaskState } from "../task/task-executor";

export type AiAgentState = {
  binding: AiAgentBinding;
  definition: AiAgentDefinition;
  sensors: AiSensorDefinition[];
  goals: AiGoalDefinition[];
  goalsById: Map<string, AiGoalDefinition>;
  tasksById: Map<string, AiTaskDefinition>;
  schedulerClass: AiSchedulerClass;
  memory: Map<string, AiPerceptionFact>;
  blackboard: AiBlackboard;
  currentGoalId: string | undefined;
  currentGoalScore: number | undefined;
  committedUntil: number | undefined;
  task: AiTaskState | undefined;
  cooldowns: Map<string, number>;
  nextDecisionAt: number;
  nextSensorAt: Map<string, number>;
  delayedDecisions: number;
};
