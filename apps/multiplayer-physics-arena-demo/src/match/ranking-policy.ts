import type { ArenaStageKind } from "../content/types";

export type ArenaStageRankingFact = {
  participantId: string;
  eligible: boolean;
  active: boolean;
  finished: boolean;
  checkpointCount: number;
  progress: number;
  progressTick: number;
  objectiveScore: number;
  knockoutCredits: number;
  assistCredits: number;
  instability: number;
  centerDistance: number;
  eliminationTick?: number | undefined;
};

export type ArenaStagePlacement = {
  id: string;
  rank: number;
  participantId: string;
  outcome: "qualified" | "eliminated" | "winner";
  rankingKey: Array<number | string>;
};

export type ArenaStageSettlement = {
  id: string;
  stageInstanceId: string;
  stageKind: ArenaStageKind;
  reason: "stage-rule" | "timeout-tiebreak";
  placements: ArenaStagePlacement[];
  qualifiedParticipantIds: string[];
  eliminatedParticipantIds: string[];
  winnerParticipantId?: string | undefined;
};

export function settleArenaStageRanking(input: {
  stageInstanceId: string;
  stageKind: ArenaStageKind;
  qualificationCount: number;
  completionReason: string;
  facts: readonly ArenaStageRankingFact[];
}): ArenaStageSettlement {
  validateInput(input);
  const ordered = [...input.facts].sort((left, right) =>
    compareKeys(rankingKey(input.stageKind, left), rankingKey(input.stageKind, right))
  );
  const qualified = ordered
    .filter((fact) => fact.eligible)
    .slice(0, input.qualificationCount)
    .map((fact) => fact.participantId);
  const qualifiedSet = new Set(qualified);
  const winnerParticipantId =
    input.stageKind === "final" && qualified.length > 0 ? qualified[0] : undefined;
  const placements = ordered.map(
    (fact, index): ArenaStagePlacement => ({
      id: `${input.stageInstanceId}:placement:${index + 1}:${fact.participantId}`,
      rank: index + 1,
      participantId: fact.participantId,
      outcome:
        fact.participantId === winnerParticipantId
          ? "winner"
          : qualifiedSet.has(fact.participantId)
            ? "qualified"
            : "eliminated",
      rankingKey: rankingKey(input.stageKind, fact)
    })
  );
  return {
    id: `${input.stageInstanceId}:settlement`,
    stageInstanceId: input.stageInstanceId,
    stageKind: input.stageKind,
    reason: input.completionReason === "deadline" ? "timeout-tiebreak" : "stage-rule",
    placements,
    qualifiedParticipantIds: qualified,
    eliminatedParticipantIds: placements
      .filter((placement) => placement.outcome === "eliminated")
      .map((placement) => placement.participantId),
    ...(winnerParticipantId === undefined ? {} : { winnerParticipantId })
  };
}

export function rankArenaStageParticipants(
  stageKind: ArenaStageKind,
  facts: readonly ArenaStageRankingFact[]
): ArenaStageRankingFact[] {
  validateFacts(facts);
  return [...facts]
    .sort((left, right) => compareKeys(rankingKey(stageKind, left), rankingKey(stageKind, right)))
    .map((fact) => structuredClone(fact));
}

function rankingKey(kind: ArenaStageKind, fact: ArenaStageRankingFact): Array<number | string> {
  const eligible = fact.eligible ? 0 : 1;
  if (kind === "qualifier") {
    return [
      eligible,
      fact.finished ? 0 : 1,
      -fact.checkpointCount,
      -fact.progress,
      fact.progressTick,
      fact.participantId
    ];
  }
  if (kind === "brawl") {
    return [
      eligible,
      fact.active ? 0 : 1,
      -fact.objectiveScore,
      -fact.knockoutCredits,
      -fact.assistCredits,
      fact.instability,
      fact.centerDistance,
      fact.participantId
    ];
  }
  return [
    eligible,
    fact.active ? 0 : 1,
    -(fact.eliminationTick ?? -1),
    fact.instability,
    -fact.knockoutCredits,
    fact.centerDistance,
    fact.participantId
  ];
}

function compareKeys(
  left: readonly (number | string)[],
  right: readonly (number | string)[]
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === rightValue) continue;
    if (leftValue === undefined) return -1;
    if (rightValue === undefined) return 1;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue);
    }
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue - rightValue;
    }
    return String(leftValue).localeCompare(String(rightValue));
  }
  return 0;
}

function validateInput(input: {
  stageInstanceId: string;
  qualificationCount: number;
  facts: readonly ArenaStageRankingFact[];
}): void {
  if (
    input.stageInstanceId.length === 0 ||
    !Number.isSafeInteger(input.qualificationCount) ||
    input.qualificationCount <= 0 ||
    input.qualificationCount > input.facts.length
  ) {
    throw new Error("Invalid Arena stage settlement input");
  }
  validateFacts(input.facts);
}

function validateFacts(facts: readonly ArenaStageRankingFact[]): void {
  const ids = new Set<string>();
  for (const fact of facts) {
    if (
      fact.participantId.length === 0 ||
      ids.has(fact.participantId) ||
      !nonNegativeInteger(fact.checkpointCount) ||
      !finite(fact.progress) ||
      !nonNegativeInteger(fact.progressTick) ||
      !finite(fact.objectiveScore) ||
      !nonNegativeInteger(fact.knockoutCredits) ||
      !nonNegativeInteger(fact.assistCredits) ||
      !nonNegativeFinite(fact.instability) ||
      !nonNegativeFinite(fact.centerDistance) ||
      (fact.eliminationTick !== undefined && !nonNegativeInteger(fact.eliminationTick))
    ) {
      throw new Error(`Invalid Arena ranking fact: ${fact.participantId}`);
    }
    ids.add(fact.participantId);
  }
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function nonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
