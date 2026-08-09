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
    expect(state.combatActors.has("enemy.opening.1:0")).toBe(true);
    expect(state.projectiles.has("projectile.1:0")).toBe(true);
    expect(state.projectileRecords.has("projectile.1")).toBe(true);

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
        ],
        combat: {
          actors: [
            {
              objectId: "enemy.opening.1",
              health: 45,
              targetActorId: "player.ranger-1",
              aiGoalId: "ai.outpost.goal.assault",
              aiTaskPhase: "telegraph",
              abilityExecutionId: "enemy.opening.1:attack:1",
              abilityId: "ability.outpost.enemy_attack",
              abilityPhase: "preparing",
              abilityPhaseStartedAt: 300,
              abilityPhaseEndsAt: 700,
              weapon: {
                weaponId: "weapon.outpost.rifle",
                magazine: 17,
                magazineSize: 24,
                reserveAmmo: 120,
                phase: "reloading",
                shotSequence: 7,
                lastShotCorrelationId: "player.ranger-1.rifle.7",
                reloadStartedAt: 300,
                reloadEndsAt: 1650,
                reloadRequestId: "reload.request.7",
                reloadCorrelationId: "reload.correlation.7",
                lastFeedback: {
                  sequence: 3,
                  kind: "cancelled",
                  action: "reload",
                  reason: "interrupted-by-dash",
                  at: 320,
                  correlationId: "dash.correlation.3"
                }
              }
            }
          ],
          projectiles: [{ objectId: "projectile.1", velocityX: 760 }],
          projectileGeneration: "session-1",
          projectileRecords: [
            {
              projectileId: "projectile.1",
              correlationId: "player.ranger-1.rifle.7",
              generation: "session-1",
              definitionId: "combat.outpost.projectile.rifle",
              fireTick: 18
            }
          ],
          cueWatermark: 1,
          cues: [
            {
              sequence: 1,
              kind: "health-hit",
              sourceObjectId: "player.ranger-1",
              targetObjectId: "enemy.opening.1",
              ability: "rifle",
              amount: 12
            }
          ]
        }
      }
    });
    expect(update?.stateBytes).toBeGreaterThan(0);
    expect(JSON.stringify(update?.state)).not.toContain("blackboard");
    expect(JSON.stringify(update?.state)).not.toContain("utilityScore");
    expect(JSON.stringify(update?.state)).not.toContain("routePoints");

    snapshot.tick = 8;
    snapshot.participants = [];
    snapshot.players = [];
    snapshot.combat.actors = [];
    snapshot.combat.projectiles = [];
    snapshot.combat.projectileRecords = [];
    snapshot.combat.cues = [];
    snapshot.inputAcksByPeerId = {};
    projectOutpostMatchToColyseusState(state, snapshot, 22);
    expect(state.participants.size).toBe(0);
    expect(state.players.size).toBe(0);
    expect(state.combatActors.size).toBe(0);
    expect(state.projectiles.size).toBe(0);
    expect(state.projectileRecords.size).toBe(0);
    expect(state.combatCues.size).toBe(0);
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
    elapsedMs: 350,
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
        facing: 0,
        dashSequence: 0,
        dashRemainingMs: 0,
        dashDirectionX: 0,
        dashDirectionY: 0
      }
    ],
    combat: {
      actors: [
        {
          objectId: "enemy.opening.1",
          networkEntityId: "enemy.opening.1",
          generation: 0,
          kind: "enemy",
          definitionId: "enemy.outpost.raider",
          renderKey: "render.outpost.raider",
          x: 680,
          y: 500,
          velocityX: 105,
          velocityY: 0,
          facing: 0,
          health: 45,
          shield: 0,
          stamina: 0,
          resource: 0,
          tags: ["team.enemies"],
          cooldowns: { "ability.outpost.enemy_attack": 900 },
          targetActorId: "player.ranger-1",
          aiGoalId: "ai.outpost.goal.assault",
          aiTaskPhase: "telegraph",
          abilityExecutionId: "enemy.opening.1:attack:1",
          abilityId: "ability.outpost.enemy_attack",
          abilityPhase: "preparing",
          abilityPhaseStartedAt: 300,
          abilityPhaseEndsAt: 700,
          weapon: {
            weaponId: "weapon.outpost.rifle",
            magazine: 17,
            magazineSize: 24,
            reserveAmmo: 120,
            phase: "reloading",
            shotSequence: 7,
            lastShotCorrelationId: "player.ranger-1.rifle.7",
            reloadStartedAt: 300,
            reloadEndsAt: 1650,
            reloadRequestId: "reload.request.7",
            reloadCorrelationId: "reload.correlation.7",
            lastFeedback: {
              sequence: 3,
              kind: "cancelled",
              action: "reload",
              reason: "interrupted-by-dash",
              at: 320,
              correlationId: "dash.correlation.3"
            }
          }
        }
      ],
      projectiles: [
        {
          objectId: "projectile.1",
          networkEntityId: "projectile.1",
          generation: 0,
          renderKey: "render.outpost.projectile",
          x: 720,
          y: 500,
          velocityX: 760,
          velocityY: 0,
          facing: 0
        }
      ],
      projectileGeneration: "session-1",
      projectileRecords: [
        {
          projectileId: "projectile.1",
          correlationId: "player.ranger-1.rifle.7",
          generation: "session-1",
          definitionId: "combat.outpost.projectile.rifle",
          definitionVersion: "outpost.rifle-projectile.v1",
          fireTick: 18,
          fixedDeltaMs: 1000 / 60,
          firePosition: { x: 700, y: 500 },
          fireVelocity: { x: 760, y: 0 },
          expiresTick: 90
        }
      ],
      cueWatermark: 1,
      cues: [
        {
          sequence: 1,
          kind: "health-hit",
          at: 340,
          correlationId: "player.ranger-1.rifle.7",
          sourceObjectId: "player.ranger-1",
          targetObjectId: "enemy.opening.1",
          ability: "rifle",
          projectileId: "projectile.1",
          position: { x: 680, y: 500 },
          normal: { x: -1, y: 0 },
          direction: { x: 1, y: 0 },
          amount: 12
        }
      ],
      acceptedCommands: 1,
      rejectedCommands: 0,
      projectileHits: 0,
      enemyAttacks: 0,
      kills: 0,
      drops: 0,
      objectiveProgress: 0
    },
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
