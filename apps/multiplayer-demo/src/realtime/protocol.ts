import {
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_AUTHORITY_CHANNEL,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND
} from "@gamekit/multiplayer-core";
import type { RealtimeArenaSnapshot, RealtimeInputFrame } from "./domain";

export const REALTIME_ARENA_CHANNEL = MULTIPLAYER_AUTHORITY_CHANNEL;
export const REALTIME_ARENA_ACTION_KIND = MULTIPLAYER_ACTION_KIND;
export const REALTIME_ARENA_INPUT_KIND = MULTIPLAYER_INPUT_KIND;
export const REALTIME_ARENA_SNAPSHOT_KIND = MULTIPLAYER_SNAPSHOT_KIND;

export type RealtimeArenaNetworkAction =
  | { type: "set-name"; name: string }
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "interact" }
  | { type: "rematch" }
  | { type: "reset" };

export type RealtimeArenaInputPayload = {
  frame: RealtimeInputFrame;
};

export type RealtimeArenaAuthorityInputDiagnostics = {
  queuedInputs: number;
  maxQueuedInputs: number;
  coalescedInputs: number;
};

export type RealtimeArenaParticipantStatus = "active" | "spectator" | "next-round" | "disconnected";

export type RealtimeArenaParticipant = {
  peerId: string;
  status: RealtimeArenaParticipantStatus;
  displayName?: string;
  playerId?: string;
  slot?: number;
  reason?: string;
};

export type RealtimeArenaParticipantSummary = {
  active: number;
  tracked: number;
  round: number;
  waiting: number;
  disconnected: number;
};

export type RealtimeArenaSnapshotPayload = {
  snapshot: RealtimeArenaSnapshot;
  playersByPeerId: Record<string, string>;
  inputAcksByPeerId: Record<string, number>;
  serverTime: number;
  authorityInput?: RealtimeArenaAuthorityInputDiagnostics;
  participantsByPeerId?: Record<string, RealtimeArenaParticipant>;
  participantSummary?: RealtimeArenaParticipantSummary;
};

export function isRealtimeArenaNetworkAction(value: unknown): value is RealtimeArenaNetworkAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "set-name":
      return typeof value.name === "string";
    case "ready":
      return typeof value.ready === "boolean";
    case "start":
    case "interact":
    case "rematch":
    case "reset":
      return true;
    default:
      return false;
  }
}

export function readRealtimeArenaInputPayload(
  value: unknown
): RealtimeArenaInputPayload | undefined {
  if (!isRecord(value) || !isRealtimeInputFrame(value.frame)) {
    return undefined;
  }

  return {
    frame: {
      sequence: value.frame.sequence,
      clientTime: value.frame.clientTime,
      moveX: value.frame.moveX,
      moveY: value.frame.moveY,
      sprint: value.frame.sprint
    }
  };
}

export function readRealtimeArenaSnapshotPayload(
  value: unknown
): RealtimeArenaSnapshotPayload | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.snapshot) ||
    !isRecord(value.playersByPeerId) ||
    typeof value.serverTime !== "number"
  ) {
    return undefined;
  }

  const playersByPeerId: Record<string, string> = {};
  for (const [peerId, playerId] of Object.entries(value.playersByPeerId)) {
    if (typeof playerId !== "string") {
      return undefined;
    }
    playersByPeerId[peerId] = playerId;
  }
  const inputAcksByPeerId: Record<string, number> = {};
  if (value.inputAcksByPeerId !== undefined) {
    if (!isRecord(value.inputAcksByPeerId)) {
      return undefined;
    }
    for (const [peerId, sequence] of Object.entries(value.inputAcksByPeerId)) {
      if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 0) {
        return undefined;
      }
      inputAcksByPeerId[peerId] = sequence;
    }
  }
  const authorityInput = readAuthorityInputDiagnostics(value.authorityInput);
  if (value.authorityInput !== undefined && authorityInput === undefined) {
    return undefined;
  }
  const participantsByPeerId = readParticipantsByPeerId(value.participantsByPeerId);
  if (value.participantsByPeerId !== undefined && participantsByPeerId === undefined) {
    return undefined;
  }
  const participantSummary = readParticipantSummary(value.participantSummary);
  if (value.participantSummary !== undefined && participantSummary === undefined) {
    return undefined;
  }

  return {
    snapshot: value.snapshot as RealtimeArenaSnapshot,
    playersByPeerId,
    inputAcksByPeerId,
    serverTime: value.serverTime,
    ...(authorityInput === undefined ? {} : { authorityInput }),
    ...(participantsByPeerId === undefined ? {} : { participantsByPeerId }),
    ...(participantSummary === undefined ? {} : { participantSummary })
  };
}

function readParticipantsByPeerId(
  value: unknown
): Record<string, RealtimeArenaParticipant> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const participants: Record<string, RealtimeArenaParticipant> = {};
  for (const [peerId, candidate] of Object.entries(value)) {
    const participant = readParticipant(candidate);
    if (participant === undefined || participant.peerId !== peerId) {
      return undefined;
    }
    participants[peerId] = participant;
  }
  return participants;
}

function readParticipant(value: unknown): RealtimeArenaParticipant | undefined {
  if (
    !isRecord(value) ||
    typeof value.peerId !== "string" ||
    !isParticipantStatus(value.status) ||
    (value.displayName !== undefined && typeof value.displayName !== "string") ||
    (value.playerId !== undefined && typeof value.playerId !== "string") ||
    (value.slot !== undefined && !isNonNegativeInteger(value.slot)) ||
    (value.reason !== undefined && typeof value.reason !== "string")
  ) {
    return undefined;
  }

  return {
    peerId: value.peerId,
    status: value.status,
    ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
    ...(value.playerId === undefined ? {} : { playerId: value.playerId }),
    ...(value.slot === undefined ? {} : { slot: value.slot }),
    ...(value.reason === undefined ? {} : { reason: value.reason })
  };
}

function readParticipantSummary(value: unknown): RealtimeArenaParticipantSummary | undefined {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.active) ||
    !isNonNegativeInteger(value.tracked) ||
    !isNonNegativeInteger(value.round) ||
    !isNonNegativeInteger(value.waiting) ||
    !isNonNegativeInteger(value.disconnected)
  ) {
    return undefined;
  }
  return {
    active: value.active,
    tracked: value.tracked,
    round: value.round,
    waiting: value.waiting,
    disconnected: value.disconnected
  };
}

function isParticipantStatus(value: unknown): value is RealtimeArenaParticipantStatus {
  return (
    value === "active" ||
    value === "spectator" ||
    value === "next-round" ||
    value === "disconnected"
  );
}

function readAuthorityInputDiagnostics(
  value: unknown
): RealtimeArenaAuthorityInputDiagnostics | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.queuedInputs) ||
    !isNonNegativeInteger(value.maxQueuedInputs) ||
    !isNonNegativeInteger(value.coalescedInputs)
  ) {
    return undefined;
  }
  return {
    queuedInputs: value.queuedInputs,
    maxQueuedInputs: value.maxQueuedInputs,
    coalescedInputs: value.coalescedInputs
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRealtimeInputFrame(value: unknown): value is RealtimeInputFrame {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 0 &&
    typeof value.clientTime === "number" &&
    isAxis(value.moveX) &&
    isAxis(value.moveY) &&
    typeof value.sprint === "boolean"
  );
}

function isAxis(value: unknown): value is -1 | 0 | 1 {
  return value === -1 || value === 0 || value === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
