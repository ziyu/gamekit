import { describe, expect, it } from "vitest";

import { createArenaMatchDirector } from "../match/match-director";
import { createArenaStageRule } from "../match/stage-rule";
import type { ArenaStageDefinition } from "../content/types";

describe("Knockout Arena match director", () => {
  it("advances lobby, countdown, running, results, and rematch with stable trace", () => {
    const director = createArenaMatchDirector({
      stageRules: [createArenaStageRule(stage("final", 20))],
      countdownTicks: 3,
      resultsTicks: 2,
      traceCapacity: 8
    });
    const entrants = ["a", "b", "c"];

    expect(advance(director, 0, 1, entrants, entrants).snapshot.phase).toBe("countdown");
    expect(advance(director, 2, 1, entrants, entrants).actions).toHaveLength(0);
    expect(advance(director, 3, 1, entrants, entrants)).toMatchObject({
      snapshot: { phase: "running", stageId: "stage.fixture" },
      actions: [{ type: "stage-started" }]
    });
    expect(advance(director, 4, 1, entrants, ["b"])).toMatchObject({
      snapshot: { phase: "results", winnerParticipantId: "b", stageStartedAtTick: 3 },
      actions: [{ type: "stage-completed", reason: "last-standing", winnerParticipantId: "b" }]
    });
    expect(director.runningTimeMs(1000 / 60, 5)).toBeCloseTo((2 * 1000) / 60);
    expect(advance(director, 6, 1, entrants, ["b"])).toMatchObject({
      snapshot: { phase: "countdown", round: 2, matchId: "match.2" },
      actions: [{ type: "rematch-reset", round: 2, matchId: "match.2" }]
    });
    expect(director.trace().map((entry) => `${entry.from}->${entry.to}:${entry.reason}`)).toEqual([
      "lobby->countdown:roster-ready",
      "countdown->running:countdown-complete",
      "running->results:last-standing",
      "results->countdown:results-complete"
    ]);
    expect(director.diagnostics()).toMatchObject({ transitions: 4, invalidTicks: 0 });

    director.dispose();
    expect(director.diagnostics()).toMatchObject({ traceEntries: 0, disposed: true });
  });

  it("cancels countdown when the human roster becomes empty and uses stage deadlines", () => {
    const rule = createArenaStageRule(stage("qualifier", 2));
    const director = createArenaMatchDirector({
      stageRules: [rule],
      countdownTicks: 2,
      resultsTicks: 2
    });
    const entrants = ["a", "b"];

    advance(director, 0, 1, entrants, entrants);
    expect(advance(director, 1, 0, entrants, entrants).snapshot.phase).toBe("lobby");
    advance(director, 2, 1, entrants, entrants);
    expect(advance(director, 4, 1, entrants, entrants).snapshot.phase).toBe("running");
    expect(advance(director, 6, 1, entrants, entrants)).toMatchObject({
      snapshot: { phase: "results" },
      actions: [{ type: "stage-completed", reason: "deadline" }]
    });
    expect(rule.diagnostics()).toMatchObject({ evaluations: 1, completions: 1 });
    director.dispose();
  });

  it("advances three unique stage generations before opening the next match", () => {
    const director = createArenaMatchDirector({
      stageRules: [
        createArenaStageRule(stage("qualifier", 1, "stage.qualifier", 2)),
        createArenaStageRule(stage("brawl", 1, "stage.brawl", 1)),
        createArenaStageRule(stage("final", 20, "stage.final", 1))
      ],
      countdownTicks: 1,
      resultsTicks: 1
    });

    advance(director, 0, 1, ["a", "b", "c"], ["a", "b", "c"]);
    expect(advance(director, 1, 1, ["a", "b", "c"], ["a", "b", "c"])).toMatchObject({
      snapshot: { stageIndex: 0, stageCount: 3, stageKind: "qualifier" },
      actions: [{ type: "stage-started", stageInstanceId: "match.1:stage.qualifier:1" }]
    });
    advance(director, 2, 1, ["a", "b", "c"], ["a", "b", "c"]);
    expect(advance(director, 3, 1, ["a", "b", "c"], ["a", "b"])).toMatchObject({
      snapshot: { phase: "countdown", stageIndex: 1, stageKind: "brawl" },
      actions: [{ type: "stage-prepared", stageInstanceId: "match.1:stage.brawl:2" }]
    });
    advance(director, 4, 1, ["a", "b"], ["a", "b"]);
    advance(director, 5, 1, ["a", "b"], ["a", "b"]);
    expect(advance(director, 6, 1, ["a", "b"], ["b"])).toMatchObject({
      snapshot: { phase: "countdown", stageIndex: 2, stageKind: "final" },
      actions: [{ type: "stage-prepared", stageInstanceId: "match.1:stage.final:3" }]
    });
    advance(director, 7, 1, ["b"], ["b"]);
    expect(advance(director, 8, 1, ["b"], ["b"])).toMatchObject({
      snapshot: { phase: "results", winnerParticipantId: "b", matchId: "match.1" },
      actions: [{ type: "stage-completed", finalStage: true, winnerParticipantId: "b" }]
    });
    expect(advance(director, 9, 1, ["b"], ["b"])).toMatchObject({
      snapshot: { phase: "countdown", round: 2, stageIndex: 0 },
      actions: [{ type: "rematch-reset", matchId: "match.2" }]
    });
    director.dispose();
  });

  it("completes a qualifier when the required finish count is reached", () => {
    const director = createArenaMatchDirector({
      stageRules: [createArenaStageRule(stage("qualifier", 120, "stage.race", 2))],
      countdownTicks: 1,
      resultsTicks: 2
    });
    const entrants = ["a", "b", "c"];
    advance(director, 0, 1, entrants, entrants);
    advance(director, 1, 1, entrants, entrants);
    expect(advance(director, 2, 1, entrants, entrants, ["a", "b"])).toMatchObject({
      snapshot: { phase: "results" },
      actions: [{ type: "stage-completed", reason: "qualification-reached" }]
    });
    director.dispose();
  });

  it("rejects stage rule inputs whose active set is not a subset of entrants", () => {
    const rule = createArenaStageRule(stage("brawl", 20));

    expect(() =>
      rule.evaluate({
        elapsedTicks: 1,
        entrantParticipantIds: ["a"],
        activeParticipantIds: ["b"]
      })
    ).toThrow("Invalid Arena stage rule input");
    expect(rule.diagnostics()).toMatchObject({ evaluations: 1, invalidInputs: 1 });
    rule.dispose();
  });
});

function advance(
  director: ReturnType<typeof createArenaMatchDirector>,
  tick: number,
  connectedHumans: number,
  entrantParticipantIds: readonly string[],
  activeParticipantIds: readonly string[],
  completedParticipantIds?: readonly string[]
) {
  return director.advance({
    tick,
    connectedHumans,
    entrantParticipantIds,
    activeParticipantIds,
    completedParticipantIds
  });
}

function stage(
  kind: ArenaStageDefinition["kind"],
  durationTicks: number,
  id = "stage.fixture",
  qualificationCount = 1
): ArenaStageDefinition {
  return {
    id,
    kind,
    course: { type: "arena.course", id: "course.fixture" },
    qualificationCount,
    durationTicks,
    itemPool: [],
    botArchetypes: []
  };
}
