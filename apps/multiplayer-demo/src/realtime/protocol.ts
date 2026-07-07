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
  | { type: "rematch" }
  | { type: "reset" };

export type RealtimeArenaInputPayload = {
  frame: RealtimeInputFrame;
};

export type RealtimeArenaSnapshotPayload = {
  snapshot: RealtimeArenaSnapshot;
  playersByPeerId: Record<string, string>;
  serverTime: number;
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
      sprint: value.frame.sprint,
      interact: value.frame.interact
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

  return {
    snapshot: value.snapshot as RealtimeArenaSnapshot,
    playersByPeerId,
    serverTime: value.serverTime
  };
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
    typeof value.sprint === "boolean" &&
    typeof value.interact === "boolean"
  );
}

function isAxis(value: unknown): value is -1 | 0 | 1 {
  return value === -1 || value === 0 || value === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
