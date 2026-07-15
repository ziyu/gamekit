import { describe, expect, it } from "vitest";

import type { OutpostMatchAuthoritySnapshot } from "../realtime";
import {
  createOutpostColyseusState,
  OUTPOST_COLYSEUS_SCHEMA_VERSION,
  projectOutpostMatchToColyseusState,
  readOutpostColyseusStateUpdate
} from "../realtime";

describe("Outpost app-owned Colyseus state", () => {
  it("projects stable entity generations and decodes same-tick provider revisions", () => {
    const state = createOutpostColyseusState("session-1", "session-1.server", 10);
    const snapshot = createMatchSnapshot();

    projectOutpostMatchToColyseusState(state, snapshot, 20);
    expect(state.stateVersion).toBe(2);
    expect(state.players.has("player.ranger-1:0")).toBe(true);

    snapshot.players[0]!.generation = 1;
    snapshot.players[0]!.x = 940;
    projectOutpostMatchToColyseusState(state, snapshot, 21);
    const update = readOutpostColyseusStateUpdate(state);

    expect(state.stateVersion).toBe(3);
    expect(state.players.has("player.ranger-1:0")).toBe(false);
    expect(state.players.has("player.ranger-1:1")).toBe(true);
    expect(update).toMatchObject({
      sessionId: "session-1",
      sourcePeerId: "session-1.server",
      stateVersion: 3,
      tick: 7,
      version: OUTPOST_COLYSEUS_SCHEMA_VERSION,
      state: {
        players: [
          {
            networkEntityId: "player.ranger-1",
            generation: 1,
            x: 940
          }
        ]
      }
    });
    expect(update?.stateBytes).toBeGreaterThan(0);

    snapshot.tick = 8;
    snapshot.participants = [];
    snapshot.players = [];
    snapshot.inputAcksByPeerId = {};
    projectOutpostMatchToColyseusState(state, snapshot, 22);
    expect(state.participants.size).toBe(0);
    expect(state.players.size).toBe(0);
    expect(state.inputAcksByPeerId.size).toBe(0);
  });

  it("rejects a provider state with the wrong app schema version", () => {
    const state = createOutpostColyseusState("session-1", "session-1.server");
    state.schemaVersion = "other.v1";
    expect(readOutpostColyseusStateUpdate(state)).toBeUndefined();
  });
});

function createMatchSnapshot(): OutpostMatchAuthoritySnapshot {
  return {
    phase: "running",
    tick: 7,
    countdownMsRemaining: 0,
    participants: [
      {
        peerId: "ranger-1",
        playerId: "player.ranger-1",
        displayName: "RANGER 1",
        status: "active",
        ready: true,
        slot: 0
      }
    ],
    players: [
      {
        entityId: "authority.player.ranger-1",
        networkEntityId: "player.ranger-1",
        generation: 0,
        archetypeId: "player.outpost.ranger",
        playerId: "player.ranger-1",
        slot: 0,
        x: 900,
        y: 500,
        velocityX: 2,
        velocityY: 0,
        facing: 0
      }
    ],
    inputAcksByPeerId: { "ranger-1": 7 },
    authorityInput: {
      acceptedActions: 1,
      rejectedActions: 0,
      acceptedInputs: 7,
      rejectedInputs: 0,
      coalescedInputs: 0,
      queuedInputs: 0
    }
  };
}
