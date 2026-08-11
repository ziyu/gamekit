import { describe, expect, it } from "vitest";

import { ARENA_DEFINITION_VERSION, ARENA_ISLAND_ID, ARENA_SCHEMA_VERSION } from "../shared/config";
import { readArenaSnapshot } from "../shared/protocol";

describe("Knockout Arena protocol", () => {
  it("requires an explicit control sequence for deterministic remote motor replay", () => {
    const snapshot = {
      schemaVersion: ARENA_SCHEMA_VERSION,
      phase: "running",
      round: 1,
      countdownMs: 0,
      roundTimeMs: 100,
      match: {
        matchId: "match.1",
        phaseInstanceId: "match.1.phase.3",
        stageIndex: 0,
        stageCount: 3,
        stageId: "stage.circuit-forge",
        stageKind: "qualifier",
        stageInstanceId: "match.1:stage.circuit-forge:1",
        startedAtTick: 6,
        stageStartedAtTick: 6,
        membershipRevision: 1
      },
      participants: [
        {
          id: "player.0",
          kind: "human-slot",
          slot: 0,
          actorMemberId: "player.0",
          peerId: "peer",
          connected: true,
          status: "active",
          stageInstanceId: "match.1:stage.circuit-forge:1",
          revision: 3
        }
      ],
      stageResults: [],
      items: [],
      itemActions: [],
      combat: { actors: [], hits: [] },
      frame: {
        islandId: ARENA_ISLAND_ID,
        generation: "round.1",
        tick: 6,
        membershipRevision: 1,
        definitionVersion: ARENA_DEFINITION_VERSION,
        members: []
      },
      playerIdsByPeerId: { peer: "player.0" },
      inputAcksByPeerId: { peer: 9 },
      actorControlsByMemberId: {
        "player.0": { sequence: 9, moveX: 1, moveZ: 0, jump: false }
      },
      eliminatedMemberIds: [],
      effects: [],
      serverTime: 100,
      authority: {
        receivedInputBundles: 1,
        acceptedInputs: 1,
        rejectedInputs: 0,
        queuedInputs: 0,
        payloadBytes: 128,
        activePeers: 1
      }
    };

    expect(readArenaSnapshot(snapshot)?.actorControlsByMemberId["player.0"]?.sequence).toBe(9);
    const missingSequence = structuredClone(snapshot) as Record<string, unknown> & {
      actorControlsByMemberId: Record<string, Record<string, unknown>>;
    };
    delete missingSequence.actorControlsByMemberId["player.0"]?.sequence;
    expect(readArenaSnapshot(missingSequence)).toBeUndefined();

    const mismatchedRevision = structuredClone(snapshot);
    mismatchedRevision.match.membershipRevision = 2;
    expect(readArenaSnapshot(mismatchedRevision)).toBeUndefined();
  });
});
