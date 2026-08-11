export type ArenaGeneration = {
  match: number;
  stage: number;
  membershipRevision: number;
};

export function createArenaGeneration(input: ArenaGeneration): ArenaGeneration {
  return Object.freeze({
    match: positiveInteger(input.match, "match"),
    stage: positiveInteger(input.stage, "stage"),
    membershipRevision: positiveInteger(input.membershipRevision, "membershipRevision")
  });
}

export function arenaGenerationKey(generation: ArenaGeneration): string {
  const value = createArenaGeneration(generation);
  return `m${value.match}.s${value.stage}.r${value.membershipRevision}`;
}

export function arenaParticipantCommandEpoch(
  generation: string | number,
  participantRevision: number
): string {
  const generationKey =
    typeof generation === "string"
      ? segment(generation, "generation")
      : nonNegativeInteger(generation, "generation");
  return `${generationKey}.p${nonNegativeInteger(participantRevision, "participantRevision")}`;
}

export function arenaParticipantId(sessionId: string, seat: number): string {
  return `participant.${segment(sessionId, "sessionId")}.${nonNegativeInteger(seat, "seat")}`;
}

export function arenaActorId(participantId: string, generation: ArenaGeneration): string {
  return `actor.${segment(participantId, "participantId")}.${arenaGenerationKey(generation)}`;
}

export function arenaItemInstanceId(
  definitionId: string,
  spawnId: string,
  generation: ArenaGeneration,
  instanceGeneration: number
): string {
  return `item.${segment(definitionId, "definitionId")}.${segment(spawnId, "spawnId")}.${arenaGenerationKey(generation)}.g${nonNegativeInteger(instanceGeneration, "instanceGeneration")}`;
}

export function arenaPickupClaimId(
  actorId: string,
  itemId: string,
  tick: number,
  sequence: number
): string {
  return eventId("claim", actorId, itemId, tick, sequence);
}

export function arenaAttackExecutionId(
  actorId: string,
  itemId: string,
  tick: number,
  sequence: number
): string {
  return eventId("execution", actorId, itemId, tick, sequence);
}

export function arenaHitTicketId(executionId: string, targetActorId: string): string {
  return `hit.${segment(executionId, "executionId")}.${segment(targetActorId, "targetActorId")}`;
}

export function arenaKnockoutCreditId(victimActorId: string, eliminationTick: number): string {
  return `ko.${segment(victimActorId, "victimActorId")}.t${nonNegativeInteger(eliminationTick, "eliminationTick")}`;
}

function eventId(
  kind: "claim" | "execution",
  actorId: string,
  itemId: string,
  tick: number,
  sequence: number
): string {
  return `${kind}.${segment(actorId, "actorId")}.${segment(itemId, "itemId")}.t${nonNegativeInteger(tick, "tick")}.q${nonNegativeInteger(sequence, "sequence")}`;
}

function segment(value: string, field: string): string {
  if (value.length === 0 || value.length > 256 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Arena identity ${field} must be a stable non-empty segment`);
  }
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Arena generation ${field} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Arena identity ${field} must be a non-negative integer`);
  }
  return value;
}
