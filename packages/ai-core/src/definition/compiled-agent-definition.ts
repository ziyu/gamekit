import type { AiUtilityInputResolver } from "../decision/utility";
import type { AiSensorSampler } from "../perception/sensor-sampler";
import type { AiSchedulerClass } from "../scheduler/scheduler-class";
import type { AiTaskExecutor } from "../task/task-executor";
import type { AiAgentDefinition } from "./agent-definition";
import type { AiGoalDefinition } from "./goal-definition";
import type { AiSensorDefinition } from "./sensor-definition";
import type { AiTaskDefinition } from "./task-definition";

export type CompiledAiAgentDefinition = {
  definition: AiAgentDefinition;
  sensors: AiSensorDefinition[];
  goals: AiGoalDefinition[];
  goalsById: Map<string, AiGoalDefinition>;
  tasksById: Map<string, AiTaskDefinition>;
  schedulerClass: AiSchedulerClass;
};

export type AiDefinitionRuntimeRegistries = {
  sensors: ReadonlyMap<string, AiSensorSampler>;
  inputs: ReadonlyMap<string, AiUtilityInputResolver>;
  tasks: ReadonlyMap<string, AiTaskExecutor>;
  schedulerClasses: ReadonlyMap<string, AiSchedulerClass>;
};
