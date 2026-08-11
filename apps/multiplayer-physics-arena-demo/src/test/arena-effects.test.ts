import type { PhysicsPredictionIslandContact } from "@gamekit/physics-core";
import { describe, expect, it } from "vitest";

import { createArenaClientEffectController } from "../client/arena-effects";
import { ARENA_DEFINITION_VERSION, ARENA_ISLAND_ID, ARENA_SCHEMA_VERSION } from "../shared/config";
import type { ArenaAuthorityEffectCue, ArenaSnapshot } from "../shared/protocol";

describe("Knockout Arena speculative effects", () => {
  it("deduplicates replayed jump and contact anticipation before authority confirmation", () => {
    const presented: string[] = [];
    const effects = createArenaClientEffectController(1, (event) => {
      presented.push(`${event.kind}:${event.phase}`);
    });
    effects.anticipateJump({ memberId: "player.0", inputSequence: 7, predictionTick: 10 });
    effects.anticipateJump({ memberId: "player.0", inputSequence: 7, predictionTick: 10 });
    const contact = localContact(20);
    effects.anticipateContacts([contact, contact], "player.0");

    effects.reconcile(
      snapshot(24, 1, 7, [
        {
          id: "authority.contact.20",
          kind: "contact",
          contactKind: "contact",
          tick: 22,
          colliderA: "player.0.collider",
          colliderB: "prop.cube.0.collider"
        }
      ]),
      "peer.0"
    );

    expect(effects.diagnostics()).toMatchObject({
      presentation: { anticipated: 2, confirmed: 2, cancelled: 0 },
      journal: { duplicates: 2, pending: 0, confirmed: 2 }
    });
    expect(presented).toEqual([
      "jump:anticipate",
      "contact:anticipate",
      "jump:confirm",
      "contact:confirm"
    ]);
    effects.dispose();
  });

  it("cancels unresolved anticipation on generation reset and expiry", () => {
    const effects = createArenaClientEffectController();
    effects.anticipateContacts([localContact(10)], "player.0");
    effects.reconcile(snapshot(20, 2, 0, []), "peer.0");
    effects.anticipateContacts([localContact(21)], "player.0");
    effects.reconcile(snapshot(70, 2, 0, []), "peer.0");

    expect(effects.diagnostics()).toMatchObject({
      presentation: { cancelled: 2 },
      journal: {
        generation: "m2.s1.r2",
        resets: 1,
        expired: 1,
        pending: 0
      }
    });
    effects.dispose();
  });
});

function localContact(tick: number): PhysicsPredictionIslandContact {
  return {
    phase: "enter",
    kind: "contact",
    colliderA: "player.0.collider",
    colliderB: "prop.cube.0.collider",
    bodyA: "player.0",
    bodyB: "prop.cube.0",
    sensor: false,
    tick
  };
}

function snapshot(
  tick: number,
  round: number,
  acknowledgedSequence: number,
  effects: ArenaAuthorityEffectCue[]
): ArenaSnapshot {
  return {
    schemaVersion: ARENA_SCHEMA_VERSION,
    phase: "running",
    round,
    countdownMs: 0,
    roundTimeMs: tick * (1000 / 60),
    match: {
      matchId: `match.${round}`,
      phaseInstanceId: `match.${round}.phase.3`,
      stageIndex: 0,
      stageCount: 3,
      stageId: "stage.circuit-forge",
      stageKind: "qualifier",
      stageInstanceId: `match.${round}:stage.circuit-forge:1`,
      startedAtTick: tick,
      stageStartedAtTick: tick,
      membershipRevision: round
    },
    participants: [
      {
        id: "player.0",
        kind: "human-slot",
        slot: 0,
        actorMemberId: "player.0",
        peerId: "peer.0",
        connected: true,
        status: "active",
        stageInstanceId: `match.${round}:stage.circuit-forge:1`,
        revision: round
      }
    ],
    stageResults: [],
    frame: {
      islandId: ARENA_ISLAND_ID,
      generation: `m${round}.s1.r${round}`,
      tick,
      membershipRevision: round,
      definitionVersion: ARENA_DEFINITION_VERSION,
      members: []
    },
    playerIdsByPeerId: { "peer.0": "player.0" },
    inputAcksByPeerId: { "peer.0": acknowledgedSequence },
    actorControlsByMemberId: {
      "player.0": { sequence: tick, moveX: 0, moveZ: 0, jump: false }
    },
    eliminatedMemberIds: [],
    effects,
    serverTime: tick * (1000 / 60),
    authority: {
      receivedInputBundles: 0,
      acceptedInputs: 0,
      rejectedInputs: 0,
      queuedInputs: 0,
      payloadBytes: 0,
      activePeers: 1
    }
  };
}
