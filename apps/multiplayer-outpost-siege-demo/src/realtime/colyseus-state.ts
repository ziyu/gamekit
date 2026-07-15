import { schema, type SchemaType } from "@colyseus/schema";
import type { ColyseusNativeStateUpdate } from "@gamekit/multiplayer-colyseus";

import type { OutpostClientAuthoritySnapshot } from "../gameplay/client-shadow-runtime";
import type { OutpostMatchAuthoritySnapshot } from "./match-authority";

export const OUTPOST_COLYSEUS_SCHEMA_VERSION = "outpost.field-state.v1";
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

export const OutpostColyseusState = schema(
  {
    sessionId: "string",
    sourcePeerId: "string",
    schemaVersion: "string",
    stateVersion: "uint32",
    tick: "uint32",
    timestamp: "float64",
    phase: "string",
    countdownMsRemaining: "float64",
    participants: { map: OutpostColyseusParticipantState },
    players: { map: OutpostColyseusPlayerState },
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
  state.timestamp = timestamp;
  state.phase = snapshot.phase;
  state.countdownMsRemaining = snapshot.countdownMsRemaining;

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
  const inputAcksByPeerId = readNumberMap(value.inputAcksByPeerId);
  if (
    !nonEmptyString(value.sessionId) ||
    !nonEmptyString(value.sourcePeerId) ||
    value.schemaVersion !== OUTPOST_COLYSEUS_SCHEMA_VERSION ||
    !positiveInteger(value.stateVersion) ||
    !nonNegativeInteger(value.tick) ||
    !nonNegativeFinite(value.timestamp) ||
    !isMatchPhase(value.phase) ||
    !nonNegativeFinite(value.countdownMsRemaining) ||
    participants === undefined ||
    players === undefined ||
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
    stateBytes: estimateSnapshotBytes(participants, players, inputAcksByPeerId),
    state: {
      phase: value.phase,
      tick: value.tick,
      countdownMsRemaining: value.countdownMsRemaining,
      participants,
      players,
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

function networkIdentityKey(entityId: string, generation: number): string {
  return `${entityId}:${generation}`;
}

function estimateSnapshotBytes(
  participants: OutpostClientAuthoritySnapshot["participants"],
  players: OutpostClientAuthoritySnapshot["players"],
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
