import type { AiGoalScore } from "./utility";

export type AiGoalDecisionReason =
  | "initial"
  | "unchanged"
  | "commitment-active"
  | "switch-threshold"
  | "interrupt-policy"
  | "no-eligible-goal"
  | "higher-score"
  | "current-ineligible";

export type AiGoalDecision = {
  action: "select" | "keep" | "clear";
  reason: AiGoalDecisionReason;
  candidate: AiGoalScore | undefined;
  current: AiGoalScore | undefined;
};

export function selectAiGoal(options: {
  scores: readonly AiGoalScore[];
  currentGoalId: string | undefined;
  committedUntil: number | undefined;
  elapsed: number;
  switchThreshold: number;
  canInterrupt: boolean;
}): AiGoalDecision {
  const candidate = options.scores.find((score) => score.eligible);
  const current =
    options.currentGoalId === undefined
      ? undefined
      : options.scores.find((score) => score.goalId === options.currentGoalId);

  if (options.currentGoalId === undefined) {
    return {
      action: candidate === undefined ? "clear" : "select",
      reason: candidate === undefined ? "no-eligible-goal" : "initial",
      candidate,
      current
    };
  }
  if (candidate?.goalId === options.currentGoalId) {
    return { action: "keep", reason: "unchanged", candidate, current };
  }
  if (current?.eligible && (options.committedUntil ?? 0) > options.elapsed) {
    return { action: "keep", reason: "commitment-active", candidate, current };
  }
  if (candidate === undefined) {
    return {
      action: options.canInterrupt ? "clear" : "keep",
      reason: options.canInterrupt ? "no-eligible-goal" : "interrupt-policy",
      candidate,
      current
    };
  }
  if (current?.eligible && candidate.score < current.score + options.switchThreshold) {
    return { action: "keep", reason: "switch-threshold", candidate, current };
  }
  if (!options.canInterrupt) {
    return { action: "keep", reason: "interrupt-policy", candidate, current };
  }
  return {
    action: "select",
    reason: current?.eligible ? "higher-score" : "current-ineligible",
    candidate,
    current
  };
}
