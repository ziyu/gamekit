import type { AiAgentBinding } from "../contracts/agent-binding";
import type { AiAgentReadContext } from "../contracts/agent-context";
import type { AiAgentDefinition } from "../definition/agent-definition";
import type { AiSensorDefinition } from "../definition/sensor-definition";
import { compareAiDueWork } from "../scheduler/due-work";
import type { AiSchedulerClass } from "../scheduler/scheduler-class";
import { effectiveAiInterval } from "../scheduler/timing";
import type { AiPerceptionFact } from "./perception-fact";
import { retainAiPerceptionFacts } from "./perception-memory";
import type { AiSensorSampler } from "./sensor-sampler";

export type AiPerceptionAgent = {
  binding: AiAgentBinding;
  definition: AiAgentDefinition;
  sensors: AiSensorDefinition[];
  schedulerClass: AiSchedulerClass;
  memory: Map<string, AiPerceptionFact>;
  nextSensorAt: Map<string, number>;
};

export type AiPerceptionController<TAgent extends AiPerceptionAgent> = {
  sample(agents: readonly TAgent[]): number;
};

export function createAiPerceptionController<TAgent extends AiPerceptionAgent>(options: {
  elapsed(): number;
  maxSamplesPerTick: number;
  samplerFor(samplerId: string): AiSensorSampler | undefined;
  contextFor(agent: TAgent): AiAgentReadContext;
  onSample(agent: TAgent, sensor: AiSensorDefinition, facts: readonly AiPerceptionFact[]): void;
  onDelayed(agent: TAgent, sensor: AiSensorDefinition): void;
}): AiPerceptionController<TAgent> {
  return {
    sample(agents) {
      const elapsed = options.elapsed();
      const due = agents.flatMap((agent) =>
        agent.sensors.flatMap((sensor) => {
          const dueAt = agent.nextSensorAt.get(sensor.id) ?? elapsed;
          return dueAt <= elapsed ? [{ agent, sensor, dueAt }] : [];
        })
      );
      due.sort((left, right) =>
        compareAiDueWork(
          {
            dueAt: left.dueAt,
            priority: left.agent.schedulerClass.priority ?? 0,
            agentId: left.agent.binding.agentId,
            itemId: left.sensor.id
          },
          {
            dueAt: right.dueAt,
            priority: right.agent.schedulerClass.priority ?? 0,
            agentId: right.agent.binding.agentId,
            itemId: right.sensor.id
          }
        )
      );
      let samples = 0;
      let delayed = 0;
      for (const { agent, sensor } of due) {
        if (samples >= options.maxSamplesPerTick) {
          delayed += 1;
          options.onDelayed(agent, sensor);
          continue;
        }
        const sampler = options.samplerFor(sensor.sampler);
        if (sampler === undefined) {
          continue;
        }
        const facts = sampler.sample(options.contextFor(agent), sensor);
        retainAiPerceptionFacts(agent.memory, facts, agent.definition.memoryLimit);
        agent.nextSensorAt.set(
          sensor.id,
          elapsed +
            effectiveAiInterval(sensor.intervalMs, agent.schedulerClass.sensorIntervalMultiplier)
        );
        samples += 1;
        options.onSample(agent, sensor, facts);
      }
      return delayed;
    }
  };
}
