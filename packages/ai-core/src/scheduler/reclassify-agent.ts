import type { AiSensorDefinition } from "../definition/sensor-definition";
import type { AiSchedulerClass } from "./scheduler-class";
import { effectiveAiInterval } from "./timing";

export type AiReclassifiableAgent = {
  definition: { decisionIntervalMs: number };
  sensors: readonly AiSensorDefinition[];
  schedulerClass: AiSchedulerClass;
  nextDecisionAt: number;
  nextSensorAt: Map<string, number>;
};

export function reclassifyAiAgent(
  agent: AiReclassifiableAgent,
  schedulerClass: AiSchedulerClass,
  elapsed: number
): void {
  const previous = agent.schedulerClass;
  if (previous.id === schedulerClass.id) {
    return;
  }
  agent.nextDecisionAt = rescaleDueAt(
    agent.nextDecisionAt,
    elapsed,
    effectiveAiInterval(agent.definition.decisionIntervalMs, previous.decisionIntervalMultiplier),
    effectiveAiInterval(
      agent.definition.decisionIntervalMs,
      schedulerClass.decisionIntervalMultiplier
    )
  );
  for (const sensor of agent.sensors) {
    const dueAt = agent.nextSensorAt.get(sensor.id);
    if (dueAt === undefined) {
      continue;
    }
    agent.nextSensorAt.set(
      sensor.id,
      rescaleDueAt(
        dueAt,
        elapsed,
        effectiveAiInterval(sensor.intervalMs, previous.sensorIntervalMultiplier),
        effectiveAiInterval(sensor.intervalMs, schedulerClass.sensorIntervalMultiplier)
      )
    );
  }
  agent.schedulerClass = schedulerClass;
}

function rescaleDueAt(
  dueAt: number,
  elapsed: number,
  previousInterval: number,
  nextInterval: number
): number {
  if (dueAt <= elapsed) {
    return dueAt;
  }
  return elapsed + Math.max(1, ((dueAt - elapsed) / previousInterval) * nextInterval);
}
