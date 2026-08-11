import {
  createMemoryPhysicsBackend,
  createPhysicsPredictionIsland,
  type PhysicsPredictionIslandMemberDefinition
} from "../src";
import { describe, expect, it } from "vitest";

const TARGET_MEMBER: PhysicsPredictionIslandMemberDefinition = {
  id: "target",
  body: {
    id: "target.body",
    kind: "dynamic",
    position: { x: 10, y: 0 },
    gravityScale: 0
  },
  colliders: [
    {
      id: "target.collider",
      shape: { type: "circle", radius: 1 }
    }
  ]
};

const PROJECTILE_MEMBER: PhysicsPredictionIslandMemberDefinition = {
  id: "projectile",
  body: {
    id: "projectile.body",
    kind: "dynamic",
    position: { x: 0, y: 0 },
    linearVelocity: { x: 12, y: -4 },
    continuousCollisionDetection: true
  },
  colliders: [
    {
      id: "projectile.collider",
      shape: { type: "circle", radius: 0.3 }
    }
  ]
};

describe("Physics prediction island", () => {
  it("replays a late predicted spawn from one full-scene checkpoint", () => {
    const island = createPhysicsPredictionIsland({
      backend: createMemoryPhysicsBackend(),
      generation: 1,
      scene: { gravity: { x: 0, y: 10 } },
      initialMembers: [TARGET_MEMBER],
      maxHistoryTicks: 32
    });
    island.advanceTo(10);

    const queued = island.queue({
      type: "spawn",
      tick: 4,
      sequence: 1,
      member: PROJECTILE_MEMBER
    });

    expect(queued).toMatchObject({ status: "replayed", replayedTicks: 7 });
    expect(island.state()).toMatchObject({
      tick: 10,
      members: [{ id: "projectile" }, { id: "target" }]
    });
    expect(island.body("projectile")?.position.x).toBeGreaterThan(1);
    expect(island.diagnostics()).toMatchObject({
      members: 2,
      resimulations: 1,
      resimulatedTicks: 7
    });
    island.dispose();
    expect(island.diagnostics()).toMatchObject({ disposed: true, historyEntries: 0 });
  });

  it("restores an authority tick and replays the whole interacting member set", () => {
    const backend = createMemoryPhysicsBackend();
    const owner = createPhysicsPredictionIsland({
      backend,
      generation: "match-1",
      scene: { gravity: { x: 0, y: 8 } },
      initialMembers: [TARGET_MEMBER],
      maxHistoryTicks: 32
    });
    owner.queue({ type: "spawn", tick: 1, sequence: 1, member: PROJECTILE_MEMBER });
    owner.advanceTo(12);

    const authority = createPhysicsPredictionIsland({
      backend,
      generation: "match-1",
      scene: { gravity: { x: 0, y: 8 } },
      initialMembers: [TARGET_MEMBER],
      maxHistoryTicks: 32
    });
    authority.queue({ type: "spawn", tick: 1, sequence: 1, member: PROJECTILE_MEMBER });
    authority.advanceTo(6);
    const authoritative = authority.state();
    const target = authoritative.members.find((member) => member.id === "target");
    if (target === undefined) {
      throw new Error("Expected authority target member");
    }
    target.body.position.x += 3;

    const reconciled = owner.reconcile(authoritative);

    expect(reconciled).toMatchObject({
      status: "corrected",
      correctionMagnitude: 3,
      replayedTicks: 6
    });
    expect(owner.tick()).toBe(12);
    expect(owner.body("target")?.position.x).toBeCloseTo(13, 6);
    expect(owner.diagnostics()).toMatchObject({
      reconciliations: 1,
      corrections: 1,
      resimulations: 1,
      resimulatedTicks: 6,
      maxCorrectionMagnitude: 3
    });
    owner.dispose();
    authority.dispose();
  });

  it("rejects membership mismatches, old history, duplicate commands, and conflicts explicitly", () => {
    const island = createPhysicsPredictionIsland({
      backend: createMemoryPhysicsBackend(),
      generation: 2,
      initialMembers: [TARGET_MEMBER],
      maxHistoryTicks: 3
    });
    const command = { type: "spawn", tick: 1, sequence: 1, member: PROJECTILE_MEMBER } as const;
    expect(island.queue(command).status).toBe("queued");
    expect(island.queue(command).status).toBe("duplicate");
    expect(
      island.queue({ ...command, member: { ...PROJECTILE_MEMBER, id: "other-projectile" } }).status
    ).toBe("conflict");
    island.advanceTo(8);
    expect(
      island.queue({
        type: "patch",
        tick: 2,
        sequence: 2,
        memberId: "target",
        patch: { position: { x: 20, y: 0 } }
      }).status
    ).toBe("history-overflow");
    expect(island.reconcile({ generation: 2, tick: 8, members: [] }).status).toBe(
      "membership-mismatch"
    );
    expect(island.diagnostics()).toMatchObject({
      duplicateCommands: 1,
      conflictingCommands: 1,
      historyOverflows: 1,
      membershipMismatches: 1
    });
    island.dispose();
  });

  it("installs an authority snapshot as a new bounded baseline after rollback recovery fails", () => {
    const authorityOnlyMember: PhysicsPredictionIslandMemberDefinition = {
      id: "authority-only",
      body: {
        id: "authority-only.body",
        kind: "dynamic",
        position: { x: 30, y: 4 },
        gravityScale: 0
      }
    };
    const island = createPhysicsPredictionIsland({
      backend: createMemoryPhysicsBackend(),
      generation: 1,
      initialMembers: [TARGET_MEMBER],
      maxHistoryTicks: 2,
      maxMembers: 4
    });
    island.advanceTo(8);
    const authoritySnapshot = {
      generation: 2,
      tick: 12,
      members: [
        {
          id: "target",
          body: { ...island.body("target")!, position: { x: 15, y: 2 } }
        },
        {
          id: "authority-only",
          body: {
            id: "authority-only.body",
            kind: "dynamic" as const,
            position: { x: 30, y: 4 },
            rotation: 0,
            linearVelocity: { x: 1, y: 0 },
            angularVelocity: 0,
            sleeping: false
          }
        }
      ]
    };

    expect(island.reconcile(authoritySnapshot).status).toBe("stale-generation");
    expect(island.hardCorrect(authoritySnapshot)).toEqual({
      status: "member-definition-missing",
      correctedMembers: 0,
      missingMemberIds: ["authority-only"]
    });
    expect(island.hardCorrect(authoritySnapshot, [authorityOnlyMember])).toEqual({
      status: "corrected",
      correctedMembers: 2,
      missingMemberIds: []
    });
    expect(island.state()).toMatchObject({
      generation: 2,
      tick: 12,
      members: [
        { id: "authority-only", body: { position: { x: 30, y: 4 } } },
        { id: "target", body: { position: { x: 15, y: 2 } } }
      ]
    });
    expect(island.diagnostics()).toMatchObject({
      generation: 2,
      tick: 12,
      members: 2,
      commands: 0,
      historyEntries: 1,
      hardCorrections: 1,
      hardCorrectionFailures: 1
    });
    island.dispose();
  });
});
