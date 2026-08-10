import { describe, expect, it } from "vitest";
import { runAnimatorRuntimeConformance } from "../../src/testing";
import { animatorController, createAnimatorFixture } from "../fixtures/animator-fixture";

describe("Animator testing contract", () => {
  it("passes the reusable memory adapter conformance suite", () => {
    const report = runAnimatorRuntimeConformance(() => {
      const fixture = createAnimatorFixture();
      return {
        runtime: fixture.runtime,
        adapter: fixture.adapter,
        binding: animatorController("conformance"),
        transitionParameter: "moving",
        oneShotId: "fire",
        dispose: fixture.dispose
      };
    });
    expect(report.checks).toHaveLength(5);
    expect(report.generation).toBe(1);
  });
});
