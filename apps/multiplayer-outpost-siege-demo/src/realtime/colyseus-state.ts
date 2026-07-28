import { schema, type SchemaType } from "@colyseus/schema";
import type { ColyseusNativeStateUpdate } from "@gamekit/multiplayer-colyseus";

import type { OutpostClientAuthoritySnapshot } from "../gameplay/client-shadow-runtime";
import type { OutpostMatchAuthoritySnapshot } from "./match-authority";

export const OUTPOST_COLYSEUS_SCHEMA_VERSION = "outpost.field-state.v6";
export const OUTPOST_COLYSEUS_SOURCE_ENDPOINT_ID = "outpost.colyseus-schema";

export const OutpostColyseusParticipantState = schema(
  {
    peerId: "string",
    playerId: "string",
    status: "string",
    ready: "boolean",
    slot: "int16",
    displayName: "string"
  },
  "OutpostColyseusParticipantState"
);

export type OutpostColyseusParticipantState = SchemaType<typeof OutpostColyseusParticipantState>;

export const OutpostColyseusPlayerState = schema(
  {
    networkEntityId: "string",
    generation: "uint32",
    archetypeId: "string",
    playerId: "string",
    slot: "uint8",
    x: "float64",
    y: "float64",
    velocityX: "float64",
    velocityY: "float64",
    facing: "float64"
  },
  "OutpostColyseusPlayerState"
);

export type OutpostColyseusPlayerState = SchemaType<typeof OutpostColyseusPlayerState>;

export const OutpostColyseusCombatActorState = schema(
  {
    objectId: "string",
    networkEntityId: "string",
    generation: "uint32",
    kind: "string",
    definitionId: "string",
    renderKey: "string",
    x: "float64",
    y: "float64",
    velocityX: "float64",
    velocityY: "float64",
    facing: "float64",
    health: "float64",
    shield: "float64",
    stamina: "float64",
    resource: "float64",
    tags: "string",
    cooldowns: { map: "float64" },
    targetActorId: "string",
    aiGoalId: "string",
    aiTaskPhase: "string",
    abilityExecutionId: "string",
    abilityId: "string",
    abilityPhase: "string",
    abilityPhaseStartedAt: "float64",
    abilityPhaseEndsAt: "float64",
    weaponId: "string",
    weaponMagazine: "int32",
    weaponMagazineSize: "int32",
    weaponReserveAmmo: "int32",
    weaponPhase: "string",
    weaponShotSequence: "uint32",
    weaponLastShotCorrelationId: "string",
    weaponReloadStartedAt: "float64",
    weaponReloadEndsAt: "float64",
    weaponReloadRequestId: "string",
    weaponReloadCorrelationId: "string",
    weaponFeedbackSequence: "uint32",
    weaponFeedbackKind: "string",
    weaponFeedbackAction: "string",
    weaponFeedbackReason: "string",
    weaponFeedbackAt: "float64",
    weaponFeedbackCorrelationId: "string"
  },
  "OutpostColyseusCombatActorState"
);

export type OutpostColyseusCombatActorState = SchemaType<typeof OutpostColyseusCombatActorState>;

export const OutpostColyseusProjectileState = schema(
  {
    objectId: "string",
    networkEntityId: "string",
    generation: "uint32",
    renderKey: "string",
    x: "float64",
    y: "float64",
    velocityX: "float64",
    velocityY: "float64",
    facing: "float64"
  },
  "OutpostColyseusProjectileState"
);

export type OutpostColyseusProjectileState = SchemaType<typeof OutpostColyseusProjectileState>;

export const OutpostColyseusState = schema(
  {
    sessionId: "string",
    sourcePeerId: "string",
    schemaVersion: "string",
    stateVersion: "uint32",
    tick: "uint32",
    elapsedMs: "float64",
    timestamp: "float64",
    phase: "string",
    countdownMsRemaining: "float64",
    participants: { map: OutpostColyseusParticipantState },
    players: { map: OutpostColyseusPlayerState },
    combatActors: { map: OutpostColyseusCombatActorState },
    projectiles: { map: OutpostColyseusProjectileState },
    acceptedCommands: "uint32",
    rejectedCommands: "uint32",
    projectileHits: "uint32",
    enemyAttacks: "uint32",
    kills: "uint32",
    drops: "uint32",
    objectiveProgress: "uint32",
    inputAcksByPeerId: { map: "uint32" }
  },
  "OutpostColyseusState"
);

export type OutpostColyseusState = SchemaType<typeof OutpostColyseusState>;

export function createOutpostColyseusState(
  sessionId: string,
  sourcePeerId: string,
  timestamp = 0
): OutpostColyseusState {
  return new OutpostColyseusState({
    sessionId,
    sourcePeerId,
    schemaVersion: OUTPOST_COLYSEUS_SCHEMA_VERSION,
    stateVersion: 1,
    tick: 0,
    elapsedMs: 0,
    timestamp,
    phase: "lobby",
    countdownMsRemaining: 0
  });
}

export function projectOutpostMatchToColyseusState(
  state: OutpostColyseusState,
  snapshot: OutpostMatchAuthoritySnapshot,
  timestamp: number
): void {
  state.stateVersion += 1;
  state.tick = snapshot.tick;
  state.elapsedMs = snapshot.elapsedMs;
  state.timestamp = timestamp;
  state.phase = snapshot.phase;
  state.countdownMsRemaining = snapshot.countdownMsRemaining;
  state.acceptedCommands = snapshot.combat.acceptedCommands;
  state.rejectedCommands = snapshot.combat.rejectedCommands;
  state.projectileHits = snapshot.combat.projectileHits;
  state.enemyAttacks = snapshot.combat.enemyAttacks;
  state.kills = snapshot.combat.kills;
  state.drops = snapshot.combat.drops;
  state.objectiveProgress = snapshot.combat.objectiveProgress;

  const participantKeys = new Set<string>();
  for (const participant of snapshot.participants) {
    participantKeys.add(participant.peerId);
    const current = state.participants.get(participant.peerId);
    const next =
      current ??
      new OutpostColyseusParticipantState({
        peerId: participant.peerId,
        playerId: participant.playerId,
        status: participant.status,
        ready: participant.ready,
        slot: participant.slot ?? -1,
        displayName: participant.displayName ?? ""
      });
    next.playerId = participant.playerId;
    next.status = participant.status;
    next.ready = participant.ready;
    next.slot = participant.slot ?? -1;
    next.displayName = participant.displayName ?? "";
    if (current === undefined) {
      state.participants.set(participant.peerId, next);
    }
  }
  removeMissingKeys(state.participants, participantKeys);

  const playerKeys = new Set<string>();
  for (const player of snapshot.players) {
    const key = networkIdentityKey(player.networkEntityId, player.generation);
    playerKeys.add(key);
    const current = state.players.get(key);
    const next =
      current ??
      new OutpostColyseusPlayerState({
        networkEntityId: player.networkEntityId,
        generation: player.generation,
        archetypeId: player.archetypeId,
        playerId: player.playerId,
        slot: player.slot,
        x: player.x,
        y: player.y,
        velocityX: player.velocityX,
        velocityY: player.velocityY,
        facing: player.facing
      });
    next.playerId = player.playerId;
    next.slot = player.slot;
    next.x = player.x;
    next.y = player.y;
    next.velocityX = player.velocityX;
    next.velocityY = player.velocityY;
    next.facing = player.facing;
    if (current === undefined) {
      state.players.set(key, next);
    }
  }
  removeMissingKeys(state.players, playerKeys);

  const combatActorKeys = new Set<string>();
  for (const actor of snapshot.combat.actors) {
    const key = networkIdentityKey(actor.networkEntityId, actor.generation);
    combatActorKeys.add(key);
    const current = state.combatActors.get(key);
    const next =
      current ??
      new OutpostColyseusCombatActorState({
        objectId: actor.objectId,
        networkEntityId: actor.networkEntityId,
        generation: actor.generation,
        kind: actor.kind,
        definitionId: actor.definitionId,
        renderKey: actor.renderKey,
        x: actor.x,
        y: actor.y,
        velocityX: actor.velocityX,
        velocityY: actor.velocityY,
        facing: actor.facing,
        health: actor.health,
        shield: actor.shield,
        stamina: actor.stamina,
        resource: actor.resource,
        tags: encodeTags(actor.tags),
        targetActorId: actor.targetActorId ?? "",
        aiGoalId: actor.aiGoalId ?? "",
        aiTaskPhase: actor.aiTaskPhase ?? "",
        abilityExecutionId: actor.abilityExecutionId ?? "",
        abilityId: actor.abilityId ?? "",
        abilityPhase: actor.abilityPhase ?? "",
        abilityPhaseStartedAt: actor.abilityPhaseStartedAt ?? -1,
        abilityPhaseEndsAt: actor.abilityPhaseEndsAt ?? -1,
        weaponId: actor.weapon?.weaponId ?? "",
        weaponMagazine: actor.weapon?.magazine ?? 0,
        weaponMagazineSize: actor.weapon?.magazineSize ?? 0,
        weaponReserveAmmo: actor.weapon?.reserveAmmo ?? 0,
        weaponPhase: actor.weapon?.phase ?? "",
        weaponShotSequence: actor.weapon?.shotSequence ?? 0,
        weaponLastShotCorrelationId: actor.weapon?.lastShotCorrelationId ?? "",
        weaponReloadStartedAt: actor.weapon?.reloadStartedAt ?? -1,
        weaponReloadEndsAt: actor.weapon?.reloadEndsAt ?? -1,
        weaponReloadRequestId: actor.weapon?.reloadRequestId ?? "",
        weaponReloadCorrelationId: actor.weapon?.reloadCorrelationId ?? "",
        weaponFeedbackSequence: actor.weapon?.lastFeedback?.sequence ?? 0,
        weaponFeedbackKind: actor.weapon?.lastFeedback?.kind ?? "",
        weaponFeedbackAction: actor.weapon?.lastFeedback?.action ?? "",
        weaponFeedbackReason: actor.weapon?.lastFeedback?.reason ?? "",
        weaponFeedbackAt: actor.weapon?.lastFeedback?.at ?? -1,
        weaponFeedbackCorrelationId: actor.weapon?.lastFeedback?.correlationId ?? ""
      });
    next.objectId = actor.objectId;
    next.kind = actor.kind;
    next.definitionId = actor.definitionId;
    next.renderKey = actor.renderKey;
    next.x = actor.x;
    next.y = actor.y;
    next.velocityX = actor.velocityX;
    next.velocityY = actor.velocityY;
    next.facing = actor.facing;
    next.health = actor.health;
    next.shield = actor.shield;
    next.stamina = actor.stamina;
    next.resource = actor.resource;
    next.tags = encodeTags(actor.tags);
    next.targetActorId = actor.targetActorId ?? "";
    next.aiGoalId = actor.aiGoalId ?? "";
    next.aiTaskPhase = actor.aiTaskPhase ?? "";
    next.abilityExecutionId = actor.abilityExecutionId ?? "";
    next.abilityId = actor.abilityId ?? "";
    next.abilityPhase = actor.abilityPhase ?? "";
    next.abilityPhaseStartedAt = actor.abilityPhaseStartedAt ?? -1;
    next.abilityPhaseEndsAt = actor.abilityPhaseEndsAt ?? -1;
    next.weaponId = actor.weapon?.weaponId ?? "";
    next.weaponMagazine = actor.weapon?.magazine ?? 0;
    next.weaponMagazineSize = actor.weapon?.magazineSize ?? 0;
    next.weaponReserveAmmo = actor.weapon?.reserveAmmo ?? 0;
    next.weaponPhase = actor.weapon?.phase ?? "";
    next.weaponShotSequence = actor.weapon?.shotSequence ?? 0;
    next.weaponLastShotCorrelationId = actor.weapon?.lastShotCorrelationId ?? "";
    next.weaponReloadStartedAt = actor.weapon?.reloadStartedAt ?? -1;
    next.weaponReloadEndsAt = actor.weapon?.reloadEndsAt ?? -1;
    next.weaponReloadRequestId = actor.weapon?.reloadRequestId ?? "";
    next.weaponReloadCorrelationId = actor.weapon?.reloadCorrelationId ?? "";
    next.weaponFeedbackSequence = actor.weapon?.lastFeedback?.sequence ?? 0;
    next.weaponFeedbackKind = actor.weapon?.lastFeedback?.kind ?? "";
    next.weaponFeedbackAction = actor.weapon?.lastFeedback?.action ?? "";
    next.weaponFeedbackReason = actor.weapon?.lastFeedback?.reason ?? "";
    next.weaponFeedbackAt = actor.weapon?.lastFeedback?.at ?? -1;
    next.weaponFeedbackCorrelationId = actor.weapon?.lastFeedback?.correlationId ?? "";
    syncNumberMap(next.cooldowns, actor.cooldowns);
    if (current === undefined) {
      state.combatActors.set(key, next);
    }
  }
  removeMissingKeys(state.combatActors, combatActorKeys);

  const projectileKeys = new Set<string>();
  for (const projectile of snapshot.combat.projectiles) {
    const key = networkIdentityKey(projectile.networkEntityId, projectile.generation);
    projectileKeys.add(key);
    const current = state.projectiles.get(key);
    const next =
      current ??
      new OutpostColyseusProjectileState({
        objectId: projectile.objectId,
        networkEntityId: projectile.networkEntityId,
        generation: projectile.generation,
        renderKey: projectile.renderKey,
        x: projectile.x,
        y: projectile.y,
        velocityX: projectile.velocityX,
        velocityY: projectile.velocityY,
        facing: projectile.facing
      });
    next.objectId = projectile.objectId;
    next.renderKey = projectile.renderKey;
    next.x = projectile.x;
    next.y = projectile.y;
    next.velocityX = projectile.velocityX;
    next.velocityY = projectile.velocityY;
    next.facing = projectile.facing;
    if (current === undefined) {
      state.projectiles.set(key, next);
    }
  }
  removeMissingKeys(state.projectiles, projectileKeys);

  const ackKeys = new Set<string>();
  for (const [peerId, sequence] of Object.entries(snapshot.inputAcksByPeerId)) {
    ackKeys.add(peerId);
    state.inputAcksByPeerId.set(peerId, sequence);
  }
  removeMissingKeys(state.inputAcksByPeerId, ackKeys);
}

export function readOutpostColyseusStateUpdate(
  value: unknown
): ColyseusNativeStateUpdate<OutpostClientAuthoritySnapshot> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const participants = readCollection(value.participants, readParticipant);
  const players = readCollection(value.players, readPlayer);
  const actors = readCollection(value.combatActors, readCombatActor);
  const projectiles = readCollection(value.projectiles, readProjectile);
  const inputAcksByPeerId = readNumberMap(value.inputAcksByPeerId);
  if (
    !nonEmptyString(value.sessionId) ||
    !nonEmptyString(value.sourcePeerId) ||
    value.schemaVersion !== OUTPOST_COLYSEUS_SCHEMA_VERSION ||
    !positiveInteger(value.stateVersion) ||
    !nonNegativeInteger(value.tick) ||
    !nonNegativeFinite(value.elapsedMs) ||
    !nonNegativeFinite(value.timestamp) ||
    !isMatchPhase(value.phase) ||
    !nonNegativeFinite(value.countdownMsRemaining) ||
    participants === undefined ||
    players === undefined ||
    actors === undefined ||
    projectiles === undefined ||
    !nonNegativeInteger(value.acceptedCommands) ||
    !nonNegativeInteger(value.rejectedCommands) ||
    !nonNegativeInteger(value.projectileHits) ||
    !nonNegativeInteger(value.enemyAttacks) ||
    !nonNegativeInteger(value.kills) ||
    !nonNegativeInteger(value.drops) ||
    !nonNegativeInteger(value.objectiveProgress) ||
    inputAcksByPeerId === undefined
  ) {
    return undefined;
  }

  return {
    sessionId: value.sessionId,
    sourcePeerId: value.sourcePeerId,
    sourceEndpointId: OUTPOST_COLYSEUS_SOURCE_ENDPOINT_ID,
    tick: value.tick,
    stateVersion: value.stateVersion,
    version: value.schemaVersion,
    timestamp: value.timestamp,
    stateBytes: estimateSnapshotBytes(
      participants,
      players,
      actors,
      projectiles,
      inputAcksByPeerId
    ),
    state: {
      phase: value.phase,
      tick: value.tick,
      elapsedMs: value.elapsedMs,
      countdownMsRemaining: value.countdownMsRemaining,
      participants,
      players,
      combat: {
        actors,
        projectiles,
        acceptedCommands: value.acceptedCommands,
        rejectedCommands: value.rejectedCommands,
        projectileHits: value.projectileHits,
        enemyAttacks: value.enemyAttacks,
        kills: value.kills,
        drops: value.drops,
        objectiveProgress: value.objectiveProgress
      },
      inputAcksByPeerId
    }
  };
}

function readParticipant(
  value: unknown
): OutpostClientAuthoritySnapshot["participants"][number] | undefined {
  const slot = isRecord(value) ? value.slot : undefined;
  if (
    !isRecord(value) ||
    !nonEmptyString(value.peerId) ||
    !nonEmptyString(value.playerId) ||
    !isParticipantStatus(value.status) ||
    typeof value.ready !== "boolean" ||
    typeof slot !== "number" ||
    !Number.isInteger(slot) ||
    slot < -1 ||
    slot > 255 ||
    typeof value.displayName !== "string"
  ) {
    return undefined;
  }
  return {
    peerId: value.peerId,
    playerId: value.playerId,
    status: value.status,
    ready: value.ready,
    ...(slot < 0 ? {} : { slot }),
    ...(value.displayName.length === 0 ? {} : { displayName: value.displayName })
  };
}

function readPlayer(value: unknown): OutpostClientAuthoritySnapshot["players"][number] | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.networkEntityId) ||
    !nonNegativeInteger(value.generation) ||
    !nonEmptyString(value.archetypeId) ||
    !nonEmptyString(value.playerId) ||
    !nonNegativeInteger(value.slot) ||
    !finiteNumber(value.x) ||
    !finiteNumber(value.y) ||
    !finiteNumber(value.velocityX) ||
    !finiteNumber(value.velocityY) ||
    !finiteNumber(value.facing)
  ) {
    return undefined;
  }
  return {
    networkEntityId: value.networkEntityId,
    generation: value.generation,
    archetypeId: value.archetypeId,
    playerId: value.playerId,
    slot: value.slot,
    x: value.x,
    y: value.y,
    velocityX: value.velocityX,
    velocityY: value.velocityY,
    facing: value.facing
  };
}

function readCombatActor(
  value: unknown
): OutpostClientAuthoritySnapshot["combat"]["actors"][number] | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.objectId) ||
    !nonEmptyString(value.networkEntityId) ||
    !nonNegativeInteger(value.generation) ||
    !isCombatActorKind(value.kind) ||
    !nonEmptyString(value.definitionId) ||
    !nonEmptyString(value.renderKey) ||
    !finiteNumber(value.x) ||
    !finiteNumber(value.y) ||
    !finiteNumber(value.velocityX) ||
    !finiteNumber(value.velocityY) ||
    !finiteNumber(value.facing) ||
    !finiteNumber(value.health) ||
    !finiteNumber(value.shield) ||
    !finiteNumber(value.stamina) ||
    !finiteNumber(value.resource) ||
    typeof value.tags !== "string" ||
    typeof value.targetActorId !== "string" ||
    typeof value.aiGoalId !== "string" ||
    typeof value.aiTaskPhase !== "string" ||
    typeof value.abilityExecutionId !== "string" ||
    typeof value.abilityId !== "string" ||
    typeof value.abilityPhase !== "string" ||
    !finiteNumber(value.abilityPhaseStartedAt) ||
    !finiteNumber(value.abilityPhaseEndsAt) ||
    typeof value.weaponId !== "string" ||
    !nonNegativeInteger(value.weaponMagazine) ||
    !nonNegativeInteger(value.weaponMagazineSize) ||
    !nonNegativeInteger(value.weaponReserveAmmo) ||
    typeof value.weaponPhase !== "string" ||
    !nonNegativeInteger(value.weaponShotSequence) ||
    typeof value.weaponLastShotCorrelationId !== "string" ||
    value.weaponLastShotCorrelationId.length > 256 ||
    !finiteNumber(value.weaponReloadStartedAt) ||
    !finiteNumber(value.weaponReloadEndsAt) ||
    typeof value.weaponReloadRequestId !== "string" ||
    value.weaponReloadRequestId.length > 256 ||
    typeof value.weaponReloadCorrelationId !== "string" ||
    value.weaponReloadCorrelationId.length > 256 ||
    !nonNegativeInteger(value.weaponFeedbackSequence) ||
    typeof value.weaponFeedbackKind !== "string" ||
    typeof value.weaponFeedbackAction !== "string" ||
    typeof value.weaponFeedbackReason !== "string" ||
    value.weaponFeedbackReason.length > 256 ||
    !finiteNumber(value.weaponFeedbackAt) ||
    typeof value.weaponFeedbackCorrelationId !== "string" ||
    value.weaponFeedbackCorrelationId.length > 256 ||
    (value.weaponId.length > 0 &&
      (!positiveInteger(value.weaponMagazineSize) ||
        value.weaponMagazine > value.weaponMagazineSize ||
        !isWeaponPhase(value.weaponPhase) ||
        (value.weaponFeedbackKind.length > 0 &&
          (!isWeaponFeedbackKind(value.weaponFeedbackKind) ||
            !isWeaponFeedbackAction(value.weaponFeedbackAction) ||
            !nonEmptyString(value.weaponFeedbackReason) ||
            value.weaponFeedbackAt < 0)) ||
        (value.weaponReloadStartedAt >= 0 &&
          value.weaponReloadEndsAt >= 0 &&
          value.weaponReloadEndsAt < value.weaponReloadStartedAt)))
  ) {
    return undefined;
  }
  const cooldowns = readNumberMap(value.cooldowns);
  if (cooldowns === undefined) {
    return undefined;
  }
  return {
    objectId: value.objectId,
    networkEntityId: value.networkEntityId,
    generation: value.generation,
    kind: value.kind,
    definitionId: value.definitionId,
    renderKey: value.renderKey,
    x: value.x,
    y: value.y,
    velocityX: value.velocityX,
    velocityY: value.velocityY,
    facing: value.facing,
    health: value.health,
    shield: value.shield,
    stamina: value.stamina,
    resource: value.resource,
    tags: decodeTags(value.tags),
    cooldowns,
    ...(value.targetActorId.length === 0 ? {} : { targetActorId: value.targetActorId }),
    ...(value.aiGoalId.length === 0 ? {} : { aiGoalId: value.aiGoalId }),
    ...(value.aiTaskPhase.length === 0 ? {} : { aiTaskPhase: value.aiTaskPhase }),
    ...(value.abilityExecutionId.length === 0
      ? {}
      : { abilityExecutionId: value.abilityExecutionId }),
    ...(value.abilityId.length === 0 ? {} : { abilityId: value.abilityId }),
    ...(value.abilityPhase.length === 0 ? {} : { abilityPhase: value.abilityPhase }),
    ...(value.abilityPhaseStartedAt < 0
      ? {}
      : { abilityPhaseStartedAt: value.abilityPhaseStartedAt }),
    ...(value.abilityPhaseEndsAt < 0 ? {} : { abilityPhaseEndsAt: value.abilityPhaseEndsAt }),
    ...(value.weaponId.length === 0
      ? {}
      : {
          weapon: {
            weaponId: value.weaponId,
            magazine: value.weaponMagazine,
            magazineSize: value.weaponMagazineSize,
            reserveAmmo: value.weaponReserveAmmo,
            phase: value.weaponPhase as "ready" | "reloading" | "empty",
            shotSequence: value.weaponShotSequence,
            ...(value.weaponLastShotCorrelationId.length === 0
              ? {}
              : { lastShotCorrelationId: value.weaponLastShotCorrelationId }),
            ...(value.weaponReloadStartedAt < 0
              ? {}
              : { reloadStartedAt: value.weaponReloadStartedAt }),
            ...(value.weaponReloadEndsAt < 0 ? {} : { reloadEndsAt: value.weaponReloadEndsAt }),
            ...(value.weaponReloadRequestId.length === 0
              ? {}
              : { reloadRequestId: value.weaponReloadRequestId }),
            ...(value.weaponReloadCorrelationId.length === 0
              ? {}
              : { reloadCorrelationId: value.weaponReloadCorrelationId }),
            ...(value.weaponFeedbackKind.length === 0
              ? {}
              : {
                  lastFeedback: {
                    sequence: value.weaponFeedbackSequence,
                    kind: value.weaponFeedbackKind as "rejected" | "cancelled",
                    action: value.weaponFeedbackAction as "rifle" | "reload",
                    reason: value.weaponFeedbackReason,
                    at: value.weaponFeedbackAt,
                    ...(value.weaponFeedbackCorrelationId.length === 0
                      ? {}
                      : { correlationId: value.weaponFeedbackCorrelationId })
                  }
                })
          }
        })
  };
}

function readProjectile(
  value: unknown
): OutpostClientAuthoritySnapshot["combat"]["projectiles"][number] | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.objectId) ||
    !nonEmptyString(value.networkEntityId) ||
    !nonNegativeInteger(value.generation) ||
    !nonEmptyString(value.renderKey) ||
    !finiteNumber(value.x) ||
    !finiteNumber(value.y) ||
    !finiteNumber(value.velocityX) ||
    !finiteNumber(value.velocityY) ||
    !finiteNumber(value.facing)
  ) {
    return undefined;
  }
  return {
    objectId: value.objectId,
    networkEntityId: value.networkEntityId,
    generation: value.generation,
    renderKey: value.renderKey,
    x: value.x,
    y: value.y,
    velocityX: value.velocityX,
    velocityY: value.velocityY,
    facing: value.facing
  };
}

function readCollection<T>(
  value: unknown,
  read: (entry: unknown) => T | undefined
): T[] | undefined {
  const entries = collectionEntries(value);
  if (entries === undefined) {
    return undefined;
  }
  const result: T[] = [];
  for (const [, entry] of entries) {
    const decoded = read(entry);
    if (decoded === undefined) {
      return undefined;
    }
    result.push(decoded);
  }
  return result;
}

function readNumberMap(value: unknown): Record<string, number> | undefined {
  const entries = collectionEntries(value);
  if (entries === undefined) {
    return undefined;
  }
  const result: Record<string, number> = {};
  for (const [key, entry] of entries) {
    if (!nonEmptyString(key) || !nonNegativeInteger(entry)) {
      return undefined;
    }
    result[key] = entry;
  }
  return result;
}

function collectionEntries(value: unknown): Array<[string, unknown]> | undefined {
  if (!isRecord(value) && !(value instanceof Map)) {
    return undefined;
  }
  const entries = (value as { entries?: unknown }).entries;
  if (typeof entries !== "function") {
    return undefined;
  }
  return Array.from(
    (entries as (this: unknown) => IterableIterator<[string, unknown]>).call(value)
  );
}

function removeMissingKeys<T>(collection: Map<string, T>, desired: ReadonlySet<string>): void {
  for (const key of collection.keys()) {
    if (!desired.has(key)) {
      collection.delete(key);
    }
  }
}

function syncNumberMap(collection: Map<string, number>, desired: Record<string, number>): void {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(desired)) {
    keys.add(key);
    collection.set(key, value);
  }
  removeMissingKeys(collection, keys);
}

const TAG_SEPARATOR = "\u001f";

function encodeTags(tags: readonly string[]): string {
  return tags.join(TAG_SEPARATOR);
}

function decodeTags(value: string): string[] {
  return value.length === 0 ? [] : value.split(TAG_SEPARATOR).filter(nonEmptyString);
}

function networkIdentityKey(entityId: string, generation: number): string {
  return `${entityId}:${generation}`;
}

function estimateSnapshotBytes(
  participants: OutpostClientAuthoritySnapshot["participants"],
  players: OutpostClientAuthoritySnapshot["players"],
  actors: OutpostClientAuthoritySnapshot["combat"]["actors"],
  projectiles: OutpostClientAuthoritySnapshot["combat"]["projectiles"],
  inputAcksByPeerId: OutpostClientAuthoritySnapshot["inputAcksByPeerId"]
): number {
  let bytes = 96;
  for (const participant of participants) {
    bytes +=
      40 +
      estimateStringBytes(participant.peerId) +
      estimateStringBytes(participant.playerId) +
      estimateStringBytes(participant.status) +
      estimateStringBytes(participant.displayName ?? "");
  }
  for (const player of players) {
    bytes +=
      96 +
      estimateStringBytes(player.networkEntityId) +
      estimateStringBytes(player.archetypeId) +
      estimateStringBytes(player.playerId);
  }
  for (const actor of actors) {
    bytes +=
      160 +
      estimateStringBytes(actor.objectId) +
      estimateStringBytes(actor.networkEntityId) +
      estimateStringBytes(actor.definitionId) +
      estimateStringBytes(actor.renderKey) +
      estimateStringBytes(actor.weapon?.lastShotCorrelationId ?? "") +
      estimateStringBytes(actor.weapon?.reloadRequestId ?? "") +
      estimateStringBytes(actor.weapon?.reloadCorrelationId ?? "") +
      estimateStringBytes(actor.weapon?.lastFeedback?.reason ?? "") +
      estimateStringBytes(actor.weapon?.lastFeedback?.correlationId ?? "") +
      actor.tags.reduce((total, tag) => total + estimateStringBytes(tag), 0) +
      Object.keys(actor.cooldowns).reduce(
        (total, abilityId) => total + 16 + estimateStringBytes(abilityId),
        0
      );
  }
  for (const projectile of projectiles) {
    bytes +=
      96 +
      estimateStringBytes(projectile.objectId) +
      estimateStringBytes(projectile.networkEntityId) +
      estimateStringBytes(projectile.renderKey);
  }
  for (const peerId of Object.keys(inputAcksByPeerId)) {
    bytes += 16 + estimateStringBytes(peerId);
  }
  return bytes;
}

function estimateStringBytes(value: string): number {
  return value.length * 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function positiveInteger(value: unknown): value is number {
  return nonNegativeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return finiteNumber(value) && value >= 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMatchPhase(value: unknown): value is OutpostClientAuthoritySnapshot["phase"] {
  return value === "lobby" || value === "countdown" || value === "running";
}

function isParticipantStatus(
  value: unknown
): value is OutpostClientAuthoritySnapshot["participants"][number]["status"] {
  return value === "active" || value === "next-round" || value === "spectator";
}

function isCombatActorKind(
  value: unknown
): value is OutpostClientAuthoritySnapshot["combat"]["actors"][number]["kind"] {
  return value === "player" || value === "enemy" || value === "buildable";
}

function isWeaponPhase(value: string): value is "ready" | "reloading" | "empty" {
  return value === "ready" || value === "reloading" || value === "empty";
}

function isWeaponFeedbackKind(value: string): value is "rejected" | "cancelled" {
  return value === "rejected" || value === "cancelled";
}

function isWeaponFeedbackAction(value: string): value is "rifle" | "reload" {
  return value === "rifle" || value === "reload";
}
