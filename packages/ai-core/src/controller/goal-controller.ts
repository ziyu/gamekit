import type { AiAgentReadContext } from "../contracts/agent-context";
import type { AiGoalDecision } from "../decision/goal-selection";
import { selectAiGoal } from "../decision/goal-selection";
import { scoreAiGoals } from "../decision/goal-scoring";
import type { AiGoalScore, AiUtilityInputResolver } from "../decision/utility";
import type { AiGoalDefinition } from "../definition/goal-definition";
import type { AiTaskController } from "../task/task-controller";
import type { AiAgentState } from "./agent-state";

export type AiGoalController = {
  score(state: AiAgentState): AiGoalScore[];
  decide(state: AiAgentState): void;
};

export function createAiGoalController(options: {
  elapsed(): number;
  resolveInput(inputId: string): AiUtilityInputResolver | undefined;
  readContext(state: AiAgentState): AiAgentReadContext;
  goalFor(state: AiAgentState, goalId: string): AiGoalDefinition;
  tasks: AiTaskController<AiAgentState>;
  onScores(state: AiAgentState, scores: readonly AiGoalScore[]): void;
  onDecision(state: AiAgentState, decision: AiGoalDecision): void;
  onSelected(state: AiAgentState, goal: AiGoalDefinition, score: number): void;
}): AiGoalController {
  const controller: AiGoalController = {
    score(state) {
      const scores = scoreAiGoals({
        goals: state.goals,
        context: options.readContext(state),
        cooldowns: state.cooldowns,
        elapsed: options.elapsed(),
        resolveInput: options.resolveInput
      });
      options.onScores(state, scores);
      return scores;
    },
    decide(state) {
      const scores = controller.score(state);
      const currentGoal =
        state.currentGoalId === undefined ? undefined : options.goalFor(state, state.currentGoalId);
      const elapsed = options.elapsed();
      const decision = selectAiGoal({
        scores,
        currentGoalId: state.currentGoalId,
        committedUntil: state.committedUntil,
        elapsed,
        switchThreshold: currentGoal?.switchThreshold ?? 0,
        canInterrupt: options.tasks.canInterrupt(state)
      });
      options.onDecision(state, decision);
      if (decision.action === "keep") {
        if (decision.current !== undefined) {
          state.currentGoalScore = decision.current.score;
        }
        return;
      }
      if (decision.action === "clear") {
        if (state.currentGoalId !== undefined) {
          options.tasks.cancel(state, "no-eligible-goal");
          state.currentGoalId = undefined;
          state.currentGoalScore = undefined;
          state.committedUntil = undefined;
        }
        return;
      }
      const candidate = decision.candidate;
      if (candidate === undefined) {
        return;
      }
      if (state.currentGoalId !== undefined && currentGoal !== undefined) {
        options.tasks.cancel(state, "goal-switched");
        if ((currentGoal.cooldownMs ?? 0) > 0) {
          state.cooldowns.set(currentGoal.id, elapsed + (currentGoal.cooldownMs ?? 0));
        }
      }
      const goal = options.goalFor(state, candidate.goalId);
      state.currentGoalId = goal.id;
      state.currentGoalScore = candidate.score;
      state.committedUntil = elapsed + (goal.commitmentMs ?? 0);
      options.onSelected(state, goal, candidate.score);
      options.tasks.start(state, goal);
    }
  };
  return controller;
}
