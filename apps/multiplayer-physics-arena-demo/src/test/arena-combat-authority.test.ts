import { describe, expect, it } from "vitest";

import { compileArenaContent, createArenaDataRegistry } from "../content/registry";
import { compileArenaItemCatalog } from "../items/item-definition";
import { createArenaImpactLedger } from "../match/impact-ledger";
import { createArenaParticipantRegistry } from "../match/participant-registry";
import { createArenaCombatAuthorityCoordinator } from "../server/arena-combat-authority";
import { ARENA_FIXED_STEP_MS } from "../shared/config";

describe("Knockout Arena Combat/GAS authority bridge", () => {
  it("deduplicates hit tickets and carries instability, stagger, impulse, and KO attribution", () => {
    const participants = createArenaParticipantRegistry();
    participants.register({
      id: "player.0",
      kind: "human-slot",
      slot: 0,
      actorMemberId: "player.0",
      tick: 0
    });
    participants.register({
      id: "bot.0",
      kind: "bot",
      slot: 1,
      actorMemberId: "bot.0",
      tick: 0
    });
    const impacts = createArenaImpactLedger({ impulseThreshold: 1 });
    const catalog = compileArenaItemCatalog(compileArenaContent(createArenaDataRegistry()).stages);
    const combat = createArenaCombatAuthorityCoordinator({
      participants,
      impactLedger: impacts,
      definitions: catalog.definitions,
      fixedDeltaMs: ARENA_FIXED_STEP_MS
    });
    try {
      combat.advance(10);
      const delivery = {
        id: "execution.foam-ball:hit:bot.0",
        executionId: "execution.foam-ball",
        itemId: "item.0",
        itemGeneration: 2,
        definitionId: "item.foam-ball",
        sourceParticipantId: "player.0",
        targetParticipantId: "bot.0",
        tick: 10,
        charge: 1,
        direction: { x: 1, y: 0, z: 0 }
      } as const;

      combat.resolve(delivery);
      combat.resolve(delivery);

      expect(combat.publicHits()).toHaveLength(1);
      expect(combat.publicHits()[0]).toMatchObject({
        sourceParticipantId: "player.0",
        targetParticipantId: "bot.0",
        definitionId: "item.foam-ball",
        tick: 10
      });
      expect(combat.publicActors().find((actor) => actor.participantId === "bot.0")).toMatchObject({
        lastHitTick: 10
      });
      expect(
        combat.publicActors().find((actor) => actor.participantId === "bot.0")!.instability
      ).toBeGreaterThan(0);
      expect(combat.takeStaggerDurationMs("bot.0")).toBeGreaterThan(0);
      expect(combat.takeStaggerDurationMs("bot.0")).toBeUndefined();

      const commands: Parameters<typeof combat.queuePhysicsCommands>[0]["commands"] = [];
      let sequence = 0;
      combat.queuePhysicsCommands({ tick: 11, nextSequence: () => sequence++, commands });
      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({
        type: "body-command",
        memberId: "bot.0",
        command: { type: "linear-impulse" }
      });
      combat.queuePhysicsCommands({ tick: 11, nextSequence: () => sequence++, commands });
      expect(commands).toHaveLength(1);

      const attribution = impacts.attribute({
        eliminationId: "stage.1:elimination:bot.0",
        targetParticipantId: "bot.0",
        tick: 12
      });
      expect(attribution.attribution).toMatchObject({
        kind: "participant",
        knockoutParticipantId: "player.0",
        impactIds: [expect.stringContaining("actor:bot.0")]
      });
      expect(combat.diagnostics()).toMatchObject({
        hits: 1,
        pendingKnockbacks: 0,
        deliveries: 1,
        duplicates: 1,
        rejected: 0
      });
    } finally {
      combat.dispose();
      impacts.dispose();
      participants.dispose();
    }
  });
});
