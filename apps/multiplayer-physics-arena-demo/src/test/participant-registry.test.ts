import { describe, expect, it } from "vitest";

import { createArenaParticipantRegistry } from "../match/participant-registry";

describe("Knockout Arena participant registry", () => {
  it("enforces unique bounded identities and legal traced status transitions", () => {
    const registry = createArenaParticipantRegistry({ capacity: 2, traceCapacity: 3 });
    expect(
      registry.register({
        id: "player.0",
        kind: "human-slot",
        slot: 0,
        actorMemberId: "player.0",
        tick: 0
      }).status
    ).toBe("applied");
    expect(
      registry.register({
        id: "bot.0",
        kind: "bot",
        slot: 1,
        actorMemberId: "bot.0",
        tick: 0
      }).status
    ).toBe("applied");
    expect(
      registry.register({ id: "bot.1", kind: "bot", slot: 2, actorMemberId: "bot.1", tick: 0 })
        .status
    ).toBe("capacity");
    expect(registry.bindPeer("player.0", "peer.0", 1).status).toBe("applied");
    expect(
      registry.transition("player.0", "qualified", {
        reason: "stage-qualified",
        tick: 2,
        stageInstanceId: "stage.1"
      }).status
    ).toBe("invalid-transition");
    expect(
      registry.transition("player.0", "active", {
        reason: "match-started",
        tick: 3,
        stageInstanceId: "stage.1"
      }).status
    ).toBe("applied");
    expect(registry.disconnectPeer("peer.0", 4).status).toBe("applied");
    expect(registry.activeActorMemberIds()).toEqual(["player.0"]);
    expect(registry.reconnectPeer("peer.0", 5).status).toBe("applied");
    expect(
      registry.transition("player.0", "eliminated", {
        reason: "stage-eliminated",
        tick: 6,
        stageInstanceId: "stage.1"
      }).status
    ).toBe("applied");

    expect(registry.eliminatedActorMemberIds()).toEqual(["player.0"]);
    expect(registry.trace().map((entry) => entry.reason)).toEqual([
      "peer-disconnected",
      "peer-reconnected",
      "stage-eliminated"
    ]);
    expect(registry.diagnostics()).toMatchObject({
      participants: 2,
      connectedPeers: 1,
      registered: 2,
      transitions: 4,
      invalidTransitions: 1,
      capacityRejections: 1,
      traceEntries: 3,
      traceDrops: 1
    });

    registry.dispose();
    expect(registry.diagnostics()).toMatchObject({
      participants: 0,
      traceEntries: 0,
      disposed: true
    });
  });

  it("resets online competitors to lobby while preserving disconnected resume state", () => {
    const registry = createArenaParticipantRegistry();
    registry.register({
      id: "player.0",
      kind: "human-slot",
      slot: 0,
      actorMemberId: "player.0",
      tick: 0
    });
    registry.bindPeer("player.0", "peer.0", 0);
    registry.transition("player.0", "active", {
      reason: "match-started",
      tick: 1,
      stageInstanceId: "stage.1"
    });
    registry.disconnectPeer("peer.0", 2);

    registry.resetForMatch(3);

    expect(registry.byPeerId("peer.0")).toMatchObject({
      status: "disconnected",
      resumeStatus: "lobby",
      connected: false
    });
    expect(registry.reconnectPeer("peer.0", 4).participant).toMatchObject({
      status: "lobby",
      connected: true
    });
    registry.dispose();
  });

  it("covers qualification, finish, spectator, next-match, and rematch transitions", () => {
    const registry = createArenaParticipantRegistry({ traceCapacity: 16 });
    registry.register({ id: "bot.0", kind: "bot", slot: 0, actorMemberId: "bot.0", tick: 0 });
    registry.transition("bot.0", "active", {
      reason: "match-started",
      tick: 1,
      stageInstanceId: "stage.1"
    });
    registry.transition("bot.0", "qualified", {
      reason: "stage-qualified",
      tick: 2,
      stageInstanceId: "stage.1"
    });
    registry.transition("bot.0", "active", {
      reason: "next-stage",
      tick: 3,
      stageInstanceId: "stage.2"
    });
    registry.transition("bot.0", "finished", {
      reason: "stage-finished",
      tick: 4,
      stageInstanceId: "stage.2"
    });
    registry.transition("bot.0", "spectator", {
      reason: "spectating",
      tick: 5,
      stageInstanceId: "stage.2"
    });
    registry.transition("bot.0", "next-match", { reason: "late-join", tick: 6 });
    registry.transition("bot.0", "lobby", { reason: "rematch-reset", tick: 7 });

    expect(registry.participant("bot.0")).toMatchObject({ status: "lobby", revision: 8 });
    expect(registry.trace().map((entry) => entry.to)).toEqual([
      "active",
      "qualified",
      "active",
      "finished",
      "spectator",
      "next-match",
      "lobby"
    ]);
    expect(registry.diagnostics()).toMatchObject({ transitions: 7, invalidTransitions: 0 });
    registry.dispose();
  });
});
