import type { AiAgentBinding } from "../contracts/agent-binding";
import type { AiAgentDefinition } from "../definition/agent-definition";
import { compareAiDueWork } from "./due-work";
import type { AiSchedulerClass } from "./scheduler-class";
import { effectiveAiInterval } from "./timing";

export type AiDecisionAgent = {
  binding: AiAgentBinding;
  definition: AiAgentDefinition;
  schedulerClass: AiSchedulerClass;
  nextDecisionAt: number;
  delayedDecisions: number;
};

export type AiDecisionScheduler<TAgent extends AiDecisionAgent> = {
  run(agents: readonly TAgent[]): number;
};

export function createAiDecisionScheduler<TAgent extends AiDecisionAgent>(options: {
  elapsed(): number;
  maxDecisionsPerTick: number;
  onDecision(agent: TAgent): void;
  onDelayed(agent: TAgent): void;
}): AiDecisionScheduler<TAgent> {
  return {
    run(agents) {
      const elapsed = options.elapsed();
      const due = agents
        .filter((agent) => agent.nextDecisionAt <= elapsed)
        .sort((left, right) =>
          compareAiDueWork(
            {
              dueAt: left.nextDecisionAt,
              priority: left.schedulerClass.priority ?? 0,
              agentId: left.binding.agentId
            },
            {
              dueAt: right.nextDecisionAt,
              priority: right.schedulerClass.priority ?? 0,
              agentId: right.binding.agentId
            }
          )
        );
      let decisions = 0;
      let delayed = 0;
      for (const agent of due) {
        if (decisions >= options.maxDecisionsPerTick) {
          agent.delayedDecisions += 1;
          delayed += 1;
          options.onDelayed(agent);
          continue;
        }
        agent.nextDecisionAt =
          elapsed +
          effectiveAiInterval(
            agent.definition.decisionIntervalMs,
            agent.schedulerClass.decisionIntervalMultiplier
          );
        options.onDecision(agent);
        decisions += 1;
      }
      return delayed;
    }
  };
}
