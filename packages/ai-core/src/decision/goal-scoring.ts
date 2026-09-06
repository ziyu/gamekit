import type { AiAgentReadContext } from "../contracts/agent-context";
import type { AiGoalDefinition } from "../definition/goal-definition";
import { clampAiUtilityValue, evaluateAiUtilityCurve } from "./utility-curve";
import type { AiGoalScore, AiUtilityInputResolver } from "./utility";

export type ScoreAiGoalsOptions = {
  goals: readonly AiGoalDefinition[];
  context: AiAgentReadContext;
  cooldowns: ReadonlyMap<string, number>;
  elapsed: number;
  resolveInput(id: string): AiUtilityInputResolver | undefined;
};

export function scoreAiGoals(options: ScoreAiGoalsOptions): AiGoalScore[] {
  const scores = options.goals.map((goal) => {
    const considerations = goal.considerations.map((consideration) => {
      const raw =
        options.resolveInput(consideration.input)?.read(options.context, consideration) ?? 0;
      return {
        input: consideration.input,
        raw,
        curved: evaluateAiUtilityCurve(consideration.curve, raw),
        weight: consideration.weight ?? 1
      };
    });
    const totalWeight = considerations.reduce((total, item) => total + item.weight, 0);
    const utility = considerations.some((item) => item.curved <= 0)
      ? 0
      : Math.exp(
          considerations.reduce(
            (total, item) => total + Math.log(clampAiUtilityValue(item.curved)) * item.weight,
            0
          ) / Math.max(totalWeight, 1)
        );
    const score = clampAiUtilityValue(utility * (goal.weight ?? 1));
    const cooldownUntil = options.cooldowns.get(goal.id) ?? 0;
    return {
      goalId: goal.id,
      score,
      eligible: score >= (goal.minScore ?? 0) && cooldownUntil <= options.elapsed,
      considerations
    };
  });
  scores.sort((left, right) =>
    left.score === right.score ? left.goalId.localeCompare(right.goalId) : right.score - left.score
  );
  return scores;
}
