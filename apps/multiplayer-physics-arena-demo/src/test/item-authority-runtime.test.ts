import { describe, expect, it } from "vitest";

import { compileArenaContent, createArenaDataRegistry } from "../content/registry";
import { createArenaItemAuthorityRuntime } from "../items/item-authority-runtime";
import { compileArenaStageItemManifest } from "../items/item-definition";

describe("Knockout Arena item authority runtime", () => {
  it("runs claim, carry, windup, active, spent, cooldown, and respawn deterministically", () => {
    const manifest = scrapManifest();
    const runtime = createArenaItemAuthorityRuntime({
      definitions: manifest.definitions,
      instanceCapacity: 16,
      commandCapacity: 16,
      traceCapacity: 32
    });
    const installed = runtime.installStage({
      stageInstanceId: "match.1:stage.scrap-yard:2",
      generation: { match: 1, stage: 2, membershipRevision: 4 },
      manifest,
      tick: 0
    });
    const item = installed.find((candidate) => candidate.definitionId === "item.foam-ball")!;

    const claim = {
      type: "claim" as const,
      id: "claim.player-a.item-0.1",
      itemId: item.id,
      itemGeneration: 1,
      participantId: "player-a",
      tick: 1
    };
    expect(runtime.dispatch(claim)).toMatchObject({
      status: "applied",
      code: "claim-pending",
      item: { state: "pickup-pending", ownerParticipantId: "player-a" }
    });
    expect(runtime.dispatch(claim)).toMatchObject({ status: "duplicate", code: "claim-pending" });
    expect(
      runtime.dispatch({
        type: "resolve-claim",
        id: "resolve.claim.player-a.item-0.1",
        claimId: claim.id,
        accepted: true,
        tick: 2
      })
    ).toMatchObject({ status: "applied", item: { state: "carried" } });
    expect(
      runtime.dispatch({
        type: "begin-action",
        id: "action.begin.1",
        itemId: item.id,
        itemGeneration: 1,
        participantId: "player-a",
        executionId: "execution.1",
        tick: 3
      })
    ).toMatchObject({
      status: "applied",
      item: { state: "windup", deadlineTick: 11 }
    });
    expect(
      runtime.dispatch({
        type: "commit-action",
        id: "action.commit.early",
        executionId: "execution.1",
        tick: 10
      })
    ).toMatchObject({ status: "rejected", code: "windup-incomplete" });
    expect(
      runtime.dispatch({
        type: "commit-action",
        id: "action.commit.1",
        executionId: "execution.1",
        tick: 11
      })
    ).toMatchObject({
      status: "applied",
      item: {
        state: "released",
        instanceGeneration: 2,
        sourceParticipantId: "player-a",
        ownerParticipantId: undefined
      }
    });
    expect(
      runtime.dispatch({
        type: "spend",
        id: "spend.stale",
        itemId: item.id,
        itemGeneration: 1,
        tick: 12
      })
    ).toMatchObject({ status: "rejected", code: "stale-generation" });
    expect(
      runtime.dispatch({
        type: "spend",
        id: "spend.1",
        itemId: item.id,
        itemGeneration: 2,
        tick: 12
      })
    ).toMatchObject({ status: "applied", item: { state: "spent" } });

    expect(runtime.advance(12).find((candidate) => candidate.id === item.id)).toMatchObject({
      state: "cooldown",
      deadlineTick: 36
    });
    expect(runtime.advance(36).find((candidate) => candidate.id === item.id)).toMatchObject({
      state: "respawning",
      deadlineTick: 276
    });
    expect(runtime.advance(275).find((candidate) => candidate.id === item.id)?.state).toBe(
      "respawning"
    );
    expect(runtime.advance(276).find((candidate) => candidate.id === item.id)).toMatchObject({
      state: "world",
      instanceGeneration: 3,
      ownerParticipantId: undefined,
      sourceParticipantId: undefined
    });
    expect(runtime.trace().map((entry) => entry.reason)).toEqual(
      expect.arrayContaining([
        "claim-started",
        "claim-accepted",
        "action-started",
        "action-committed",
        "item-spent",
        "cooldown-started",
        "respawn-started",
        "item-respawned"
      ])
    );
    expect(runtime.diagnostics()).toMatchObject({
      instances: 12,
      commands: 7,
      appliedCommands: 5,
      duplicateCommands: 1,
      rejectedCommands: 2,
      resets: 1,
      disposed: false
    });

    runtime.dispose();
    expect(runtime.diagnostics()).toMatchObject({
      instances: 0,
      commands: 0,
      traceEntries: 0,
      disposed: true
    });
  });

  it("rejects a claim after reservation and clears command state on stage generation reset", () => {
    const manifest = scrapManifest();
    const bounded = createArenaItemAuthorityRuntime({
      definitions: manifest.definitions,
      instanceCapacity: 2
    });
    expect(() =>
      bounded.installStage({
        stageInstanceId: "match.1:stage.scrap-yard:bounded",
        generation: { match: 1, stage: 2, membershipRevision: 3 },
        manifest,
        tick: 0
      })
    ).toThrow("Arena item instances exceed capacity");
    bounded.dispose();

    const runtime = createArenaItemAuthorityRuntime({
      definitions: manifest.definitions,
      commandCapacity: 2,
      traceCapacity: 4
    });
    const first = runtime.installStage({
      stageInstanceId: "match.1:stage.scrap-yard:2",
      generation: { match: 1, stage: 2, membershipRevision: 4 },
      manifest,
      tick: 0
    })[0]!;
    runtime.dispatch({
      type: "claim",
      id: "claim.a",
      itemId: first.id,
      itemGeneration: 1,
      participantId: "a",
      tick: 1
    });
    expect(
      runtime.dispatch({
        type: "claim",
        id: "claim.b",
        itemId: first.id,
        itemGeneration: 1,
        participantId: "b",
        tick: 1
      })
    ).toMatchObject({ status: "rejected", code: "item-not-world" });
    runtime.dispatch({
      type: "resolve-claim",
      id: "resolve.a",
      claimId: "claim.a",
      accepted: false,
      tick: 2
    });
    expect(runtime.diagnostics()).toMatchObject({ commands: 2, commandResultDrops: 1 });

    const second = runtime.installStage({
      stageInstanceId: "match.1:stage.scrap-yard:2:reset",
      generation: { match: 1, stage: 2, membershipRevision: 5 },
      manifest,
      tick: 3
    })[0]!;
    expect(second.id).not.toBe(first.id);
    expect(runtime.diagnostics()).toMatchObject({ commands: 0, resets: 2, instances: 12 });
    expect(runtime.trace()).toHaveLength(4);

    expect(() =>
      runtime.installStage({
        stageInstanceId: "match.1:stage.scrap-yard:invalid",
        generation: { match: 1, stage: 2, membershipRevision: 6 },
        manifest: {
          ...manifest,
          definitions: [{ ...manifest.definitions[0]!, mass: 999 }],
          spawns: [manifest.spawns[0]!]
        },
        tick: 4
      })
    ).toThrow("Arena item manifest is incompatible");
    runtime.dispose();
  });
});

function scrapManifest() {
  const content = compileArenaContent(createArenaDataRegistry());
  return compileArenaStageItemManifest(content.stages[1]!);
}
