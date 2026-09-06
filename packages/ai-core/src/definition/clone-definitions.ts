import { cloneAiRecord } from "../contracts/clone-runtime-value";
import type { AiAgentDefinition } from "./agent-definition";
import type { AiGoalDefinition } from "./goal-definition";
import type { AiSensorDefinition } from "./sensor-definition";
import type { AiTaskDefinition } from "./task-definition";

export function cloneAiAgentDefinition(definition: AiAgentDefinition): AiAgentDefinition {
  return {
    ...definition,
    sensors: definition.sensors.map((reference) => ({ ...reference })),
    goals: definition.goals.map((reference) => ({ ...reference })),
    ...(definition.tags === undefined ? {} : { tags: [...definition.tags] })
  };
}

export function cloneAiSensorDefinition(sensor: AiSensorDefinition): AiSensorDefinition {
  return {
    ...sensor,
    ...(sensor.args === undefined ? {} : { args: cloneAiRecord(sensor.args) }),
    ...(sensor.tags === undefined ? {} : { tags: [...sensor.tags] })
  };
}

export function cloneAiGoalDefinition(goal: AiGoalDefinition): AiGoalDefinition {
  return {
    ...goal,
    task: { ...goal.task },
    considerations: goal.considerations.map((consideration) => ({
      ...consideration,
      curve:
        consideration.curve.type === "points"
          ? { type: "points", points: consideration.curve.points.map((point) => ({ ...point })) }
          : { ...consideration.curve }
    })),
    ...(goal.tags === undefined ? {} : { tags: [...goal.tags] })
  };
}

export function cloneAiTaskDefinition(task: AiTaskDefinition): AiTaskDefinition {
  return {
    ...task,
    ...(task.args === undefined ? {} : { args: cloneAiRecord(task.args) }),
    ...(task.tags === undefined ? {} : { tags: [...task.tags] })
  };
}
