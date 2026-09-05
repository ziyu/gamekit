import { describe, expect, it } from "vitest";

import {
  arbitrateArenaItemClaims,
  commitArenaItemClaimBatch,
  selectArenaItemTarget
} from "../items/item-interaction";
import { createArenaItemAuthorityRuntime } from "../items/item-authority-runtime";
import { compileArenaStageItemManifest } from "../items/item-definition";
import { compileArenaContent, createArenaDataRegistry } from "../content/registry";

describe("Knockout Arena item interaction policies", () => {
  it("selects a visible world target with stable spatial tie-breaks", () => {
    const selected = selectArenaItemTarget([
      candidate("far", { distance: 3, viewAlignment: 0.95, priority: 1 }),
      candidate("near-low-alignment", { distance: 1, viewAlignment: 0.7, priority: 5 }),
      candidate("best-b", { distance: 2, viewAlignment: 0.95, priority: 2 }),
      candidate("best-a", { distance: 2, viewAlignment: 0.95, priority: 2 }),
      candidate("hidden", { distance: 0.2, viewAlignment: 1, priority: 10, visible: false })
    ]);
    expect(selected?.itemId).toBe("best-a");
    expect(() => selectArenaItemTarget([candidate("invalid", { distance: Number.NaN })])).toThrow(
      "Invalid Arena item target candidates"
    );
  });

  it("arbitrates same-tick claims by sequence, distance, participant, and generation", () => {
    const decisions = arbitrateArenaItemClaims({
      currentGenerationByItemId: { item: 2 },
      requests: [
        claim("late", "z", 2, 10, 4, 1),
        claim("far", "a", 2, 10, 3, 3),
        claim("winner", "b", 2, 10, 3, 1),
        claim("stale", "c", 1, 9, 1, 0)
      ]
    });
    expect(decisions.find((decision) => decision.requestId === "winner")).toMatchObject({
      status: "winner",
      code: "claim-won"
    });
    expect(decisions.find((decision) => decision.requestId === "stale")?.code).toBe(
      "stale-generation"
    );
    expect(decisions.filter((decision) => decision.status === "winner")).toHaveLength(1);
  });

  it("commits exactly one owner for a same-tick two-client claim batch", () => {
    const manifest = compileArenaStageItemManifest(
      compileArenaContent(createArenaDataRegistry()).stages[1]!
    );
    const runtime = createArenaItemAuthorityRuntime({ definitions: manifest.definitions });
    const item = runtime.installStage({
      stageInstanceId: "match.1:stage.scrap-yard:2",
      generation: { match: 1, stage: 2, membershipRevision: 4 },
      manifest,
      tick: 0
    })[0]!;
    const result = commitArenaItemClaimBatch({
      runtime,
      currentGenerationByItemId: { [item.id]: item.instanceGeneration },
      requests: [
        { ...claim("peer-a", "player.a", 1, 1, 4, 0.8), itemId: item.id },
        { ...claim("peer-b", "player.b", 1, 1, 3, 1.2), itemId: item.id }
      ]
    });

    expect(result.decisions.filter((decision) => decision.status === "winner")).toEqual([
      expect.objectContaining({ requestId: "peer-b", participantId: "player.b" })
    ]);
    expect(result.authorityResults).toHaveLength(2);
    expect(runtime.instance(item.id)).toMatchObject({
      state: "carried",
      ownerParticipantId: "player.b"
    });
    runtime.dispose();
  });
});

function candidate(
  itemId: string,
  overrides: Partial<Parameters<typeof selectArenaItemTarget>[0][number]> = {}
) {
  return {
    itemId,
    itemGeneration: 1,
    distance: 1,
    viewAlignment: 1,
    priority: 0,
    visible: true,
    inRange: true,
    state: "world" as const,
    ...overrides
  };
}

function claim(
  id: string,
  participantId: string,
  itemGeneration: number,
  tick: number,
  sequence: number,
  distance: number
) {
  return { id, itemId: "item", itemGeneration, participantId, tick, sequence, distance };
}
