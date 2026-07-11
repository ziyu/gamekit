import { describe, expect, it } from "vitest";
import { captureRealtimeArenaSnapshot, createRealtimeArenaState } from "./domain";
import {
  readRealtimeArenaInputPayload,
  readRealtimeArenaSnapshotPayload,
  type RealtimeArenaSnapshotPayload
} from "./protocol";

describe("realtime arena protocol", () => {
  it("decodes a complete authoritative snapshot payload", () => {
    const payload = createSnapshotPayload();

    expect(readRealtimeArenaSnapshotPayload(payload)).toEqual(payload);
  });

  it("rejects malformed nested authoritative snapshot state", () => {
    const invalidPhase = createSnapshotPayload();
    (invalidPhase.snapshot as { phase: string }).phase = "paused";

    const invalidPosition = createSnapshotPayload();
    invalidPosition.snapshot.players[0]!.position.x = Number.POSITIVE_INFINITY;

    const invalidEvent = createSnapshotPayload();
    invalidEvent.snapshot.events.push({
      id: 1,
      tick: 0,
      type: "round.started",
      label: "started"
    });
    (invalidEvent.snapshot.events[0] as { type: string }).type = "authority.injected";

    expect(readRealtimeArenaSnapshotPayload(invalidPhase)).toBeUndefined();
    expect(readRealtimeArenaSnapshotPayload(invalidPosition)).toBeUndefined();
    expect(readRealtimeArenaSnapshotPayload(invalidEvent)).toBeUndefined();
  });

  it("rejects non-finite clocks, invalid input axes and unsafe sequences", () => {
    const payload = createSnapshotPayload();
    payload.serverTime = Number.NaN;

    expect(readRealtimeArenaSnapshotPayload(payload)).toBeUndefined();
    expect(
      readRealtimeArenaInputPayload({
        frame: {
          sequence: 1,
          clientTime: Number.POSITIVE_INFINITY,
          moveX: 0,
          moveY: 0,
          sprint: false
        }
      })
    ).toBeUndefined();
    expect(
      readRealtimeArenaInputPayload({
        frame: {
          sequence: Number.MAX_SAFE_INTEGER + 1,
          clientTime: 1,
          moveX: 2,
          moveY: 0,
          sprint: false
        }
      })
    ).toBeUndefined();
  });

  it("rejects malformed participant diagnostics", () => {
    const payload = createSnapshotPayload();
    payload.participantsByPeerId = {
      runner: {
        peerId: "different-peer",
        status: "active"
      }
    };

    expect(readRealtimeArenaSnapshotPayload(payload)).toBeUndefined();
  });
});

function createSnapshotPayload(): RealtimeArenaSnapshotPayload {
  const snapshot = captureRealtimeArenaSnapshot(
    createRealtimeArenaState({ players: [{ id: "runner", teamId: "green" }] })
  );
  return {
    snapshot,
    playersByPeerId: { runner: "runner" },
    inputAcksByPeerId: { runner: 0 },
    serverTime: 100,
    authorityInput: {
      queuedInputs: 0,
      maxQueuedInputs: 1,
      coalescedInputs: 0
    },
    participantsByPeerId: {
      runner: {
        peerId: "runner",
        playerId: "runner",
        displayName: "Runner",
        slot: 0,
        status: "active"
      }
    },
    participantSummary: {
      active: 1,
      tracked: 1,
      round: 1,
      waiting: 0,
      disconnected: 0
    }
  };
}
