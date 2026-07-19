import type { AiAgentBinding, AiRuntime } from "./types";

export type AiConformanceHarness = {
  runtime: AiRuntime;
  binding: AiAgentBinding;
  dispose(): void;
};

export type AiConformanceReport = {
  checks: string[];
  selectedGoalId: string;
  checkpointAgents: number;
};

export function runAiRuntimeConformance(
  createHarness: () => AiConformanceHarness
): AiConformanceReport {
  const harness = createHarness();
  try {
    harness.runtime.bind(harness.binding);
    const scores = harness.runtime.scoreGoals(harness.binding.agentId);
    const winner = scores.find((score) => score.eligible);
    assertConformance(winner !== undefined, "utility scoring exposes an eligible goal");

    harness.runtime.update(1_000, 1_000);
    const snapshot = harness.runtime.getAgent(harness.binding.agentId);
    assertConformance(snapshot !== undefined, "bound agent remains queryable");
    assertConformance(snapshot.goalId !== undefined, "scheduled decision selects a goal");

    const checkpoint = harness.runtime.captureCheckpoint();
    assertConformance(checkpoint.version === 1, "checkpoint has a stable version");
    assertConformance(checkpoint.agents.length === 1, "checkpoint captures bound agents");

    harness.runtime.restoreCheckpoint(checkpoint);
    assertConformance(
      harness.runtime.hasAgent(harness.binding.agentId),
      "checkpoint restores agents"
    );
    harness.runtime.unbind(harness.binding.agentId);
    assertConformance(!harness.runtime.hasAgent(harness.binding.agentId), "unbind releases agents");

    return {
      checks: [
        "utility scoring exposes an eligible goal",
        "scheduled decision selects a goal",
        "checkpoint captures bound agents",
        "checkpoint restores agents",
        "unbind releases agents"
      ],
      selectedGoalId: snapshot.goalId,
      checkpointAgents: checkpoint.agents.length
    };
  } finally {
    harness.dispose();
  }
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`AI conformance failed: ${message}`);
  }
}
