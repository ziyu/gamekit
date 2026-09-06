export type ArenaItemTargetCandidate = {
  itemId: string;
  itemGeneration: number;
  distance: number;
  viewAlignment: number;
  priority: number;
  visible: boolean;
  inRange: boolean;
  state: "world" | "unavailable";
};

export type ArenaItemClaimRequest = {
  id: string;
  itemId: string;
  itemGeneration: number;
  participantId: string;
  tick: number;
  sequence: number;
  distance: number;
};

export type ArenaItemClaimDecision = {
  requestId: string;
  itemId: string;
  participantId: string;
  status: "winner" | "rejected";
  code: "claim-won" | "already-claimed" | "stale-generation";
};

export type ArenaItemClaimBatchResult = {
  decisions: ArenaItemClaimDecision[];
  authorityResults: ArenaItemAuthorityCommandResult[];
};

export function selectArenaItemTarget(
  candidates: readonly ArenaItemTargetCandidate[]
): ArenaItemTargetCandidate | undefined {
  validateCandidates(candidates);
  const selected = candidates
    .filter((candidate) => candidate.visible && candidate.inRange && candidate.state === "world")
    .sort(
      (left, right) =>
        right.viewAlignment - left.viewAlignment ||
        left.distance - right.distance ||
        right.priority - left.priority ||
        left.itemId.localeCompare(right.itemId) ||
        left.itemGeneration - right.itemGeneration
    )[0];
  return selected === undefined ? undefined : structuredClone(selected);
}

export function arbitrateArenaItemClaims(input: {
  requests: readonly ArenaItemClaimRequest[];
  currentGenerationByItemId: Readonly<Record<string, number>>;
}): ArenaItemClaimDecision[] {
  validateClaims(input.requests);
  const decisions: ArenaItemClaimDecision[] = [];
  const groups = new Map<string, ArenaItemClaimRequest[]>();
  for (const request of input.requests) {
    const group = groups.get(request.itemId) ?? [];
    group.push(request);
    groups.set(request.itemId, group);
  }
  for (const itemId of [...groups.keys()].sort()) {
    const requests = groups.get(itemId)!;
    const currentGeneration = input.currentGenerationByItemId[itemId];
    const eligible = requests.filter((request) => request.itemGeneration === currentGeneration);
    eligible.sort(
      (left, right) =>
        left.tick - right.tick ||
        left.sequence - right.sequence ||
        left.distance - right.distance ||
        left.participantId.localeCompare(right.participantId) ||
        left.id.localeCompare(right.id)
    );
    const winner = eligible[0];
    for (const request of requests.sort((left, right) => left.id.localeCompare(right.id))) {
      decisions.push({
        requestId: request.id,
        itemId,
        participantId: request.participantId,
        status: request === winner ? "winner" : "rejected",
        code: request.itemGeneration !== currentGeneration ? "stale-generation" : "already-claimed"
      });
      if (request === winner) decisions.at(-1)!.code = "claim-won";
    }
  }
  return decisions;
}

export function commitArenaItemClaimBatch(input: {
  runtime: ArenaItemAuthorityRuntime;
  requests: readonly ArenaItemClaimRequest[];
  currentGenerationByItemId: Readonly<Record<string, number>>;
}): ArenaItemClaimBatchResult {
  const decisions = arbitrateArenaItemClaims(input);
  const requestById = new Map(input.requests.map((request) => [request.id, request]));
  const authorityResults: ArenaItemAuthorityCommandResult[] = [];
  for (const decision of decisions.filter((entry) => entry.status === "winner")) {
    const request = requestById.get(decision.requestId)!;
    const claimed = input.runtime.dispatch({
      type: "claim",
      id: request.id,
      itemId: request.itemId,
      itemGeneration: request.itemGeneration,
      participantId: request.participantId,
      tick: request.tick
    });
    authorityResults.push(claimed);
    if (claimed.status === "applied") {
      authorityResults.push(
        input.runtime.dispatch({
          type: "resolve-claim",
          id: `${request.id}:resolve`,
          claimId: request.id,
          accepted: true,
          tick: request.tick
        })
      );
    }
  }
  return { decisions, authorityResults };
}

function validateCandidates(candidates: readonly ArenaItemTargetCandidate[]): void {
  if (
    candidates.length > 64 ||
    candidates.some(
      (candidate) =>
        !validId(candidate.itemId) ||
        !positiveInteger(candidate.itemGeneration) ||
        !nonNegativeFinite(candidate.distance) ||
        !Number.isFinite(candidate.viewAlignment) ||
        candidate.viewAlignment < -1 ||
        candidate.viewAlignment > 1 ||
        !Number.isFinite(candidate.priority)
    )
  ) {
    throw new Error("Invalid Arena item target candidates");
  }
}

function validateClaims(requests: readonly ArenaItemClaimRequest[]): void {
  if (
    requests.length > 64 ||
    new Set(requests.map((request) => request.id)).size !== requests.length ||
    requests.some(
      (request) =>
        !validId(request.id) ||
        !validId(request.itemId) ||
        !validId(request.participantId) ||
        !positiveInteger(request.itemGeneration) ||
        !nonNegativeInteger(request.tick) ||
        !nonNegativeInteger(request.sequence) ||
        !nonNegativeFinite(request.distance)
    )
  ) {
    throw new Error("Invalid Arena item claim requests");
  }
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 256;
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
import type {
  ArenaItemAuthorityCommandResult,
  ArenaItemAuthorityRuntime
} from "./item-authority-runtime";
