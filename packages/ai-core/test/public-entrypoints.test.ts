import { describe, expect, it } from "vitest";
import * as aiRoot from "../src";
import * as aiTesting from "../src/testing";

describe("AI public entrypoints", () => {
  it("keeps conformance helpers out of the gameplay root", () => {
    expect("runAiRuntimeConformance" in aiRoot).toBe(false);
    expect(aiTesting.runAiRuntimeConformance).toBeTypeOf("function");
    expect("createMemoryAiRuntimeFixture" in aiRoot).toBe(false);
    expect(aiTesting.createMemoryAiRuntimeFixture).toBeTypeOf("function");
  });

  it("does not export package-internal controllers and stores", () => {
    for (const internalName of [
      "createAiAgentDefinitionCompiler",
      "createAiBlackboard",
      "createAiDecisionScheduler",
      "createAiGoalController",
      "createAiPerceptionController",
      "createAiTaskController",
      "createAiTraceStore",
      "scoreAiGoals",
      "selectAiGoal"
    ]) {
      expect(aiRoot).not.toHaveProperty(internalName);
    }
  });
});
