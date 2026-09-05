import { describe, expect, it } from "vitest";

import {
  rankArenaStageParticipants,
  settleArenaStageRanking,
  type ArenaStageRankingFact
} from "../match/ranking-policy";

describe("Knockout Arena deterministic ranking", () => {
  it("ranks qualifier progress and uses participant id as the final stable tie-break", () => {
    const facts = [
      fact("c", { checkpointCount: 2, progress: 4, progressTick: 30 }),
      fact("b", { checkpointCount: 2, progress: 4, progressTick: 30 }),
      fact("a", { finished: true, progressTick: 40 }),
      fact("fallen", { eligible: false, finished: true, progressTick: 1 })
    ];

    expect(
      rankArenaStageParticipants("qualifier", facts).map((entry) => entry.participantId)
    ).toEqual(["a", "b", "c", "fallen"]);
    const settlement = settleArenaStageRanking({
      stageInstanceId: "match.1:stage.qualifier:1",
      stageKind: "qualifier",
      qualificationCount: 2,
      completionReason: "deadline",
      facts
    });
    expect(settlement).toMatchObject({
      reason: "timeout-tiebreak",
      qualifiedParticipantIds: ["a", "b"],
      eliminatedParticipantIds: ["c", "fallen"]
    });
    expect(settlement.placements.map((placement) => placement.id)).toEqual([
      "match.1:stage.qualifier:1:placement:1:a",
      "match.1:stage.qualifier:1:placement:2:b",
      "match.1:stage.qualifier:1:placement:3:c",
      "match.1:stage.qualifier:1:placement:4:fallen"
    ]);
  });

  it("uses brawl and final authority facts in their documented order", () => {
    const brawl = [
      fact("stable", { objectiveScore: 3, knockoutCredits: 1, instability: 0.2 }),
      fact("assist", { objectiveScore: 3, knockoutCredits: 1, assistCredits: 2, instability: 0.8 }),
      fact("out", { active: false, objectiveScore: 99 })
    ];
    expect(rankArenaStageParticipants("brawl", brawl).map((entry) => entry.participantId)).toEqual([
      "assist",
      "stable",
      "out"
    ]);

    const finalSettlement = settleArenaStageRanking({
      stageInstanceId: "match.1:stage.final:1",
      stageKind: "final",
      qualificationCount: 1,
      completionReason: "last-standing",
      facts: [
        fact("winner", { active: true }),
        fact("later", { active: false, eliminationTick: 80, instability: 0.7 }),
        fact("earlier", { active: false, eliminationTick: 70, instability: 0.1 })
      ]
    });
    expect(finalSettlement).toMatchObject({
      winnerParticipantId: "winner",
      qualifiedParticipantIds: ["winner"],
      eliminatedParticipantIds: ["later", "earlier"]
    });
    expect(finalSettlement.placements[0]?.outcome).toBe("winner");
  });

  it("rejects duplicate or non-finite authority facts", () => {
    expect(() => rankArenaStageParticipants("qualifier", [fact("a"), fact("a")])).toThrow(
      "Invalid Arena ranking fact"
    );
    expect(() =>
      rankArenaStageParticipants("brawl", [fact("a", { instability: Infinity })])
    ).toThrow("Invalid Arena ranking fact");
  });

  it("settles an empty field as a no-contest result without inventing a winner", () => {
    expect(
      settleArenaStageRanking({
        stageInstanceId: "match.1:stage.final:1",
        stageKind: "final",
        qualificationCount: 0,
        completionReason: "all-eliminated",
        facts: []
      })
    ).toMatchObject({
      placements: [],
      qualifiedParticipantIds: [],
      eliminatedParticipantIds: []
    });
  });
});

function fact(
  participantId: string,
  overrides: Partial<ArenaStageRankingFact> = {}
): ArenaStageRankingFact {
  return {
    participantId,
    eligible: true,
    active: true,
    finished: false,
    checkpointCount: 0,
    progress: 0,
    progressTick: 0,
    objectiveScore: 0,
    knockoutCredits: 0,
    assistCredits: 0,
    instability: 0,
    centerDistance: 0,
    ...overrides
  };
}
