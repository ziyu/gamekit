import type { MultiplayerPhysicsArenaFrame } from "@gamekit/app-host";

import {
  ARENA_DEFINITION_VERSION,
  ARENA_SCHEMA_VERSION,
  type ArenaMatchPhase,
  type ArenaMoveInput
} from "./config";

export type ArenaAuthorityDiagnostics = {
  receivedInputBundles: number;
  acceptedInputs: number;
  rejectedInputs: number;
  queuedInputs: number;
  payloadBytes: number;
  activePeers: number;
};

export type ArenaSnapshot = {
  schemaVersion: typeof ARENA_SCHEMA_VERSION;
  phase: ArenaMatchPhase;
  round: number;
  countdownMs: number;
  roundTimeMs: number;
  winnerId?: string | undefined;
  frame: MultiplayerPhysicsArenaFrame;
  playerIdsByPeerId: Record<string, string>;
  inputAcksByPeerId: Record<string, number>;
  eliminatedMemberIds: string[];
  serverTime: number;
  authority: ArenaAuthorityDiagnostics;
};

export function readArenaMoveInput(value: unknown): ArenaMoveInput | undefined {
  if (
    !isRecord(value) ||
    !nonNegativeSafeInteger(value.sequence) ||
    !axis(value.moveX) ||
    !axis(value.moveZ) ||
    typeof value.jump !== "boolean"
  ) {
    return undefined;
  }
  return {
    sequence: value.sequence,
    moveX: value.moveX,
    moveZ: value.moveZ,
    jump: value.jump
  };
}

export function readArenaSnapshot(value: unknown): ArenaSnapshot | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== ARENA_SCHEMA_VERSION ||
    !isPhase(value.phase) ||
    !nonNegativeSafeInteger(value.round) ||
    !nonNegativeFinite(value.countdownMs) ||
    !nonNegativeFinite(value.roundTimeMs) ||
    (value.winnerId !== undefined && typeof value.winnerId !== "string") ||
    !isRecord(value.frame) ||
    value.frame.definitionVersion !== ARENA_DEFINITION_VERSION ||
    !isRecord(value.playerIdsByPeerId) ||
    !isRecord(value.inputAcksByPeerId) ||
    !Array.isArray(value.eliminatedMemberIds) ||
    !value.eliminatedMemberIds.every((id) => typeof id === "string") ||
    !nonNegativeFinite(value.serverTime) ||
    !isAuthorityDiagnostics(value.authority)
  ) {
    return undefined;
  }
  const playerIdsByPeerId = readStringMap(value.playerIdsByPeerId);
  const inputAcksByPeerId = readIntegerMap(value.inputAcksByPeerId);
  if (playerIdsByPeerId === undefined || inputAcksByPeerId === undefined) {
    return undefined;
  }
  return structuredClone(value) as ArenaSnapshot;
}

function readStringMap(value: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0 || typeof entry !== "string" || entry.length === 0) return undefined;
    result[key] = entry;
  }
  return result;
}

function readIntegerMap(value: Record<string, unknown>): Record<string, number> | undefined {
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0 || !nonNegativeSafeInteger(entry)) return undefined;
    result[key] = entry;
  }
  return result;
}

function isAuthorityDiagnostics(value: unknown): value is ArenaAuthorityDiagnostics {
  return (
    isRecord(value) &&
    nonNegativeSafeInteger(value.receivedInputBundles) &&
    nonNegativeSafeInteger(value.acceptedInputs) &&
    nonNegativeSafeInteger(value.rejectedInputs) &&
    nonNegativeSafeInteger(value.queuedInputs) &&
    nonNegativeSafeInteger(value.payloadBytes) &&
    nonNegativeSafeInteger(value.activePeers)
  );
}

function isPhase(value: unknown): value is ArenaMatchPhase {
  return value === "lobby" || value === "countdown" || value === "running" || value === "results";
}

function axis(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
