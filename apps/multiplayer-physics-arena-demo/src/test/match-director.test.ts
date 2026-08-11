import { describe, expect, it } from "vitest";

import { createArenaMatchDirector } from "../match/match-director";
import { createArenaStageRule } from "../match/stage-rule";
import type { ArenaStageDefinition } from "../content/types";

describe("Knockout Arena match director", () => {
  it("advances lobby, countdown, running, results, and rematch with stable trace", () => {
    const director = createArenaMatchDirector({
      stageRule: createArenaStageRule(stage("final", 20)),
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
      stageRule: rule,
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
  activeParticipantIds: readonly string[]
) {
  return director.advance({ tick, connectedHumans, entrantParticipantIds, activeParticipantIds });
}

function stage(kind: ArenaStageDefinition["kind"], durationTicks: number): ArenaStageDefinition {
  return {
    id: "stage.fixture",
    kind,
    course: { type: "arena.course", id: "course.fixture" },
    qualificationCount: 1,
    durationTicks,
    itemPool: [],
    botArchetypes: []
  };
}
