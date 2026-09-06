import { describe, expect, it } from "vitest";
import { planArenaStageConvergence } from "../match/stage-convergence";

const safeVolume = {
  id: "safe",
  kind: "safe-zone" as const,
  position: { x: 0, y: 1, z: 0 },
  size: { width: 20, height: 3, depth: 20 }
};

describe("Knockout Arena forced convergence", () => {
  it("reduces a brawl to three survivors with stable farthest-first ordering", () => {
    const plan = planArenaStageConvergence({
      stageKind: "brawl",
      elapsedTicks: 900,
      durationTicks: 1_000,
      qualificationCount: 3,
      safeVolume,
      candidates: candidates(6)
    });

    expect(plan.active).toBe(true);
    expect(plan.minimumSurvivors).toBe(3);
    expect(plan.eliminatedParticipantIds).toEqual(["p5", "p4", "p3"]);
  });

  it("never removes the last final survivor even when everyone is outside", () => {
    const plan = planArenaStageConvergence({
      stageKind: "final",
      elapsedTicks: 900,
      durationTicks: 1_000,
      qualificationCount: 1,
      safeVolume,
      candidates: candidates(3)
    });

    expect(plan.eliminatedParticipantIds).toEqual(["p2", "p1"]);
    expect(plan.eliminatedParticipantIds).not.toContain("p0");
  });

  it("does not force qualifier eliminations", () => {
    expect(
      planArenaStageConvergence({
        stageKind: "qualifier",
        elapsedTicks: 999,
        durationTicks: 1_000,
        qualificationCount: 6,
        safeVolume,
        candidates: candidates(8)
      }).eliminatedParticipantIds
    ).toEqual([]);
  });
});

function candidates(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `p${index}`,
    memberId: `actor.${index}`,
    position: { x: index * 4, y: 1, z: 0 }
  }));
}
