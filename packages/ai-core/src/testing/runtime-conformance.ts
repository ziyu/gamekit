import type { AiAgentBinding } from "../contracts/agent-binding";
import type { AiRuntime } from "../controller/runtime";

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
    assertConformance(
      JSON.stringify(harness.runtime.scoreGoals(harness.binding.agentId)) ===
        JSON.stringify(scores),
      "utility scoring is deterministic for unchanged state"
    );

    harness.runtime.update(1_000, 1_000);
    const snapshot = harness.runtime.getAgent(harness.binding.agentId);
    assertConformance(snapshot !== undefined, "bound agent remains queryable");
    assertConformance(snapshot.goalId !== undefined, "scheduled decision selects a goal");

    const checkpoint = harness.runtime.captureCheckpoint();
    assertConformance(checkpoint.version === 1, "checkpoint has a stable version");
    assertConformance(checkpoint.agents.length === 1, "checkpoint captures bound agents");

    const invalidCheckpoint = {
      ...checkpoint,
      agents: [...checkpoint.agents, checkpoint.agents[0]!]
    };
    let rejectedInvalidCheckpoint = false;
    try {
      harness.runtime.restoreCheckpoint(invalidCheckpoint);
    } catch {
      rejectedInvalidCheckpoint = true;
    }
    assertConformance(
      rejectedInvalidCheckpoint && harness.runtime.hasAgent(harness.binding.agentId),
      "invalid checkpoint rejection is atomic"
    );

    harness.runtime.restoreCheckpoint(checkpoint);
    assertConformance(
      harness.runtime.hasAgent(harness.binding.agentId),
      "checkpoint restores agents"
    );
    harness.runtime.unbind(harness.binding.agentId);
    assertConformance(!harness.runtime.hasAgent(harness.binding.agentId), "unbind releases agents");
    harness.runtime.bind(harness.binding);
    harness.runtime.dispose();
    const disposed = harness.runtime.snapshot();
    assertConformance(
      disposed.disposed &&
        disposed.agents.length === 0 &&
        disposed.memoryFacts === 0 &&
        disposed.activeTasks === 0 &&
        disposed.traceEntries === 0,
      "dispose releases retained runtime state"
    );

    return {
      checks: [
        "utility scoring exposes an eligible goal",
        "utility scoring is deterministic for unchanged state",
        "scheduled decision selects a goal",
        "checkpoint captures bound agents",
        "invalid checkpoint rejection is atomic",
        "checkpoint restores agents",
        "unbind releases agents",
        "dispose releases retained runtime state"
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
