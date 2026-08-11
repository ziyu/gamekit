import { createMemoryMultiplayerBackend } from "@gamekit/multiplayer-memory";
import { createMultiplayerRuntime } from "@gamekit/multiplayer-core";
import { createMemoryPhysicsBackend } from "@gamekit/physics-core";
import { describe, expect, it } from "vitest";

import { createArenaAuthorityRuntime } from "../server/arena-authority";
import { arenaPlayerMemberId } from "../shared/config";

describe("Knockout Arena multi-stage authority", () => {
  it("keeps eliminated actors out of later generations and publishes all stage results", async () => {
    const fixture = await createAuthorityFixture("arena-stage-authority");
    try {
      advanceUntil(fixture.authority, (snapshot) => snapshot.phase === "running", 240);
      const qualifier = fixture.authority.latestSnapshot();
      expect(qualifier.match).toMatchObject({
        stageIndex: 0,
        stageCount: 3,
        stageKind: "qualifier"
      });

      advanceUntil(fixture.authority, (snapshot) => snapshot.stageResults.length === 1, 5_500);
      const qualifierResult = fixture.authority.latestSnapshot();
      expect(actorIds(qualifierResult)).toHaveLength(6);
      expect(qualifierResult.stageResults[0]).toMatchObject({
        stageKind: "qualifier",
        qualifiedParticipantIds: expect.arrayContaining([expect.any(String), expect.any(String)])
      });
      expect(qualifierResult.stageResults[0]?.qualifiedParticipantIds).toHaveLength(6);
      expect(qualifierResult.stageResults[0]?.eliminatedParticipantIds).toHaveLength(2);

      advanceUntil(
        fixture.authority,
        (snapshot) => snapshot.match.stageIndex === 1 && snapshot.phase === "countdown",
        360
      );
      const brawlBaseline = fixture.authority.latestSnapshot();
      expect(brawlBaseline.frame.generation).not.toBe(qualifier.frame.generation);
      expect(actorIds(brawlBaseline)).toHaveLength(6);
      expect(
        brawlBaseline.participants.filter((participant) => participant.status === "spectator")
      ).toHaveLength(2);

      advanceUntil(
        fixture.authority,
        (snapshot) => snapshot.match.stageIndex === 1 && snapshot.phase === "running",
        240
      );
      advanceUntil(fixture.authority, (snapshot) => snapshot.stageResults.length === 2, 5_500);
      expect(actorIds(fixture.authority.latestSnapshot())).toHaveLength(3);

      advanceUntil(
        fixture.authority,
        (snapshot) => snapshot.match.stageIndex === 2 && snapshot.phase === "running",
        600
      );
      advanceUntil(fixture.authority, (snapshot) => snapshot.stageResults.length === 3, 4_600);
      const finalResult = fixture.authority.latestSnapshot();
      expect(actorIds(finalResult)).toHaveLength(1);
      expect(finalResult.stageResults.map((result) => result.stageKind)).toEqual([
        "qualifier",
        "brawl",
        "final"
      ]);
      expect(finalResult.winnerId).toBe(finalResult.stageResults[2]?.winnerParticipantId);
      expect(
        finalResult.participants.filter((participant) => participant.status === "finished")
      ).toHaveLength(1);

      advanceUntil(
        fixture.authority,
        (snapshot) => snapshot.round === 2 && snapshot.phase === "countdown",
        360
      );
      const rematch = fixture.authority.latestSnapshot();
      expect(rematch).toMatchObject({
        round: 2,
        match: {
          matchId: "match.2",
          stageIndex: 0,
          stageKind: "qualifier",
          membershipRevision: rematch.frame.membershipRevision
        },
        stageResults: [],
        eliminatedMemberIds: []
      });
      expect(rematch.winnerId).toBeUndefined();
      expect(rematch.frame.generation).not.toBe(finalResult.frame.generation);
      expect(actorIds(rematch)).toHaveLength(8);
      expect(
        rematch.participants.filter(
          (participant) => participant.actorMemberId !== undefined && participant.status === "lobby"
        )
      ).toHaveLength(8);

      fixture.authority.dispose();
      expect(fixture.authority.retainedState()).toEqual({
        disposed: true,
        participants: 0,
        physicsMembers: 0,
        physicsHistoryEntries: 0,
        physicsCommands: 0,
        impactEntries: 0,
        impactAttributions: 0,
        inputs: 0,
        inputAcks: 0,
        actorControls: 0,
        authorityEffects: 0,
        rankingFacts: 0,
        stageEntrants: 0,
        stageResults: 0,
        latestSnapshots: 0,
        itemInstances: 0,
        itemCommands: 0,
        itemActions: 0,
        itemExecutions: 0,
        combatHits: 0,
        combatKnockbacks: 0
      });
      expect(() => fixture.authority.latestSnapshot()).toThrow(
        "Knockout arena authority is disposed"
      );
    } finally {
      await fixture.dispose();
    }
  }, 30_000);

  it("projects late join as next-match spectator and restores a disconnected active peer", async () => {
    const fixture = await createAuthorityFixture("arena-presence-authority");
    const late = createMultiplayerRuntime({
      id: "arena-presence-late",
      backend: fixture.multiplayer,
      connectContext: {
        localPeer: { id: "peer.late", displayName: "Late Bean", role: "client" }
      }
    });
    try {
      advanceUntil(fixture.authority, (snapshot) => snapshot.phase === "running", 240);
      const generation = fixture.authority.latestSnapshot().frame.generation;

      await late.joinSession({
        sessionId: fixture.sessionId,
        localPeer: { id: "peer.late", displayName: "Late Bean", role: "client" }
      });
      fixture.authority.tick();
      expect(
        fixture.authority
          .latestSnapshot()
          .participants.find((participant) => participant.peerId === "peer.late")
      ).toMatchObject({ kind: "spectator", status: "next-match", connected: true });
      expect(fixture.authority.latestSnapshot().playerIdsByPeerId["peer.late"]).toBeUndefined();

      await fixture.client.leaveSession("connection-test");
      fixture.authority.tick();
      expect(
        fixture.authority
          .latestSnapshot()
          .participants.find((participant) => participant.peerId === "peer.primary")
      ).toMatchObject({ status: "disconnected", resumeStatus: "active", connected: false });

      await fixture.client.joinSession({
        sessionId: fixture.sessionId,
        localPeer: { id: "peer.primary", displayName: "Primary Bean", role: "client" }
      });
      fixture.authority.tick();
      expect(
        fixture.authority
          .latestSnapshot()
          .participants.find((participant) => participant.peerId === "peer.primary")
      ).toMatchObject({ status: "active", connected: true });
      expect(fixture.authority.latestSnapshot()).toMatchObject({
        frame: { generation },
        playerIdsByPeerId: { "peer.primary": arenaPlayerMemberId(0) }
      });
    } finally {
      await late.dispose();
      await fixture.dispose();
    }
  });
});

async function createAuthorityFixture(id: string) {
  const multiplayer = createMemoryMultiplayerBackend({ id });
  const sessionId = `${id}.session`;
  const authorityPeerId = `${id}.server`;
  const host = createMultiplayerRuntime({
    id: `${id}.host`,
    backend: multiplayer,
    connectContext: {
      localPeer: { id: authorityPeerId, displayName: "Authority", role: "server" }
    }
  });
  const client = createMultiplayerRuntime({
    id: `${id}.client`,
    backend: multiplayer,
    connectContext: {
      localPeer: { id: "peer.primary", displayName: "Primary Bean", role: "client" }
    }
  });
  await host.createSession({
    id: sessionId,
    kind: "private",
    authority: "server-authoritative",
    localPeer: { id: authorityPeerId, displayName: "Authority", role: "server" }
  });
  await client.joinSession({
    sessionId,
    localPeer: { id: "peer.primary", displayName: "Primary Bean", role: "client" }
  });
  const authority = createArenaAuthorityRuntime({
    runtime: host,
    backend: createZeroGravityMemoryPhysicsBackend(id),
    sessionId,
    authorityPeerId,
    now: () => 1_000
  });
  return {
    multiplayer,
    sessionId,
    host,
    client,
    authority,
    async dispose() {
      authority.dispose();
      await client.dispose();
      await host.dispose();
    }
  };
}

function createZeroGravityMemoryPhysicsBackend(id: string) {
  const memory = createMemoryPhysicsBackend({ id: `${id}.physics`, dimension: "3d" });
  return {
    ...memory,
    createScene(config: Parameters<typeof memory.createScene>[0]) {
      return memory.createScene({ ...config, gravity: { x: 0, y: 0, z: 0 } });
    }
  };
}

function advanceUntil(
  authority: ReturnType<typeof createArenaAuthorityRuntime>,
  predicate: (snapshot: ReturnType<typeof authority.latestSnapshot>) => boolean,
  maxTicks: number
): void {
  for (let index = 0; index < maxTicks; index += 1) {
    authority.tick();
    if (predicate(authority.latestSnapshot())) return;
  }
  throw new Error(`Arena authority did not reach the expected state within ${maxTicks} ticks`);
}

function actorIds(
  snapshot: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["latestSnapshot"]>
) {
  return snapshot.frame.members
    .map((member) => member.id)
    .filter((id) => id.startsWith("player.") || id.startsWith("bot."));
}
