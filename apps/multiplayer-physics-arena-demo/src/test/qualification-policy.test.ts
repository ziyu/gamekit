import { describe, expect, it } from "vitest";

import { ARENA_COMPILED_CONTENT } from "../content/default-content";
import { resolveArenaQualificationCount } from "../match/qualification-policy";
import { createArenaStageRule } from "../match/stage-rule";

describe("Knockout Arena dynamic qualification", () => {
  it("clamps configured places to the remaining stage field", () => {
    expect(resolveArenaQualificationCount(6, 8)).toBe(6);
    expect(resolveArenaQualificationCount(6, 2)).toBe(2);
    expect(resolveArenaQualificationCount(3, 0)).toBe(0);
  });

  it("completes reduced and empty fields instead of waiting on impossible places", () => {
    const qualifier = createArenaStageRule({
      ...ARENA_COMPILED_CONTENT.stages[0]!.definition,
      id: "reduced-qualifier",
      kind: "qualifier",
      qualificationCount: 6,
      durationTicks: 600
    });
    expect(
      qualifier.evaluate({
        elapsedTicks: 20,
        entrantParticipantIds: ["a", "b"],
        activeParticipantIds: ["a", "b"],
        completedParticipantIds: ["a", "b"]
      })
    ).toEqual({ status: "complete", reason: "qualification-reached" });

    const brawl = createArenaStageRule({
      ...ARENA_COMPILED_CONTENT.stages[1]!.definition,
      id: "empty-brawl",
      kind: "brawl",
      qualificationCount: 3,
      durationTicks: 600
    });
    expect(
      brawl.evaluate({
        elapsedTicks: 0,
        entrantParticipantIds: [],
        activeParticipantIds: []
      })
    ).toEqual({ status: "complete", reason: "all-eliminated" });
  });
});
