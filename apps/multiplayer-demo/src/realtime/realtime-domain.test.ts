import { describe, expect, it } from "vitest";
import {
  applyRealtimeInputFrame,
  createRealtimeArenaState,
  rematchRealtimeArena,
  removeRealtimeArenaPlayer,
  setRealtimeArenaPlayerReady,
  startRealtimeArenaCountdown,
  tickRealtimeArena,
  type RealtimeArenaActionResult,
  type RealtimeArenaLayoutInput,
  type RealtimeArenaPlayer,
  type RealtimeArenaState,
  type RealtimeInputFrame
} from "./domain";

describe("realtime arena domain", () => {
  it("runs a complete round from lobby to results and back to lobby", () => {
    const state = createRealtimeArenaState({
      rules: {
        countdownMs: 16,
        roundDurationMs: 32,
        endingDurationMs: 16
      },
      players: [
        { id: "player-green", teamId: "green" },
        { id: "player-orange", teamId: "orange" }
      ]
    });

    expectRejected(startRealtimeArenaCountdown(state), "players-not-ready");
    expectAccepted(setRealtimeArenaPlayerReady(state, "player-green", true));
    expectAccepted(setRealtimeArenaPlayerReady(state, "player-orange", true));
    expectAccepted(startRealtimeArenaCountdown(state));
    expect(state.phase).toBe("countdown");

    tickRealtimeArena(state, 15);
    expect(state.phase).toBe("countdown");

    tickRealtimeArena(state, 1);
    expect(state.phase).toBe("running");

    tickRealtimeArena(state, 32);
    expect(state.phase).toBe("ending");
    expect(state.result).toMatchObject({
      reason: "draw",
      score: {
        green: 0,
        orange: 0
      }
    });

    tickRealtimeArena(state, 16);
    expect(state.phase).toBe("results");

    expectAccepted(rematchRealtimeArena(state));
    expect(state.phase).toBe("lobby");
    expect(state.result).toBeUndefined();
    expect(getPlayer(state, "player-green").ready).toBe(false);
    expect(state.score).toEqual({
      green: 0,
      orange: 0
    });
  });

  it("ends immediately when a player delivers the score-limit core", () => {
    const state = createRealtimeArenaState({
      layout: deliveryLayout,
      rules: {
        countdownMs: 0,
        endingDurationMs: 0,
        roundDurationMs: 1000,
        scoreLimit: 1
      },
      players: [{ id: "runner", teamId: "green" }]
    });

    readyAndStart(state, ["runner"]);
    expect(state.phase).toBe("running");

    expectAccepted(applyRealtimeInputFrame(state, "runner", inputFrame(1, { interact: true })));
    tickRealtimeArena(state, 16);
    expect(getPlayer(state, "runner").carryingCoreId).toBe("core-alpha");

    expectAccepted(applyRealtimeInputFrame(state, "runner", inputFrame(2, { interact: true })));
    tickRealtimeArena(state, 16);

    expect(state.phase).toBe("results");
    expect(state.result).toMatchObject({
      reason: "score-limit",
      winnerTeamId: "green",
      score: {
        green: 1,
        orange: 0
      }
    });
    expect(getPlayer(state, "runner").deliveredCores).toBe(1);
    expect(state.cores[0]?.carriedByPlayerId).toBeUndefined();
  });

  it("rejects input outside the running phase and rejects duplicate or stale frames", () => {
    const state = createRealtimeArenaState({
      rules: {
        countdownMs: 0
      },
      players: [{ id: "player-green", teamId: "green" }]
    });

    expectRejected(
      applyRealtimeInputFrame(state, "player-green", inputFrame(1)),
      "round-not-running"
    );

    readyAndStart(state, ["player-green"]);
    expectAccepted(applyRealtimeInputFrame(state, "player-green", inputFrame(1)));
    expectRejected(
      applyRealtimeInputFrame(state, "player-green", inputFrame(1)),
      "duplicate-input"
    );
    expectAccepted(applyRealtimeInputFrame(state, "player-green", inputFrame(2)));
    expectRejected(applyRealtimeInputFrame(state, "player-green", inputFrame(1)), "stale-input");

    const player = getPlayer(state, "player-green");
    expect(player.lastInputSequence).toBe(2);
    expect(player.rejectedInputs).toBe(3);
    expect(state.events.filter((event) => event.type === "input.rejected")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "round-not-running" }),
        expect.objectContaining({ code: "duplicate-input" }),
        expect.objectContaining({ code: "stale-input" })
      ])
    );
  });

  it("blocks movement through walls while clamping players inside arena bounds", () => {
    const state = createRealtimeArenaState({
      layout: collisionLayout,
      rules: {
        countdownMs: 0,
        playerRadius: 10,
        playerSpeedPerSecond: 100
      },
      players: [{ id: "runner", teamId: "green" }]
    });

    readyAndStart(state, ["runner"]);

    expectAccepted(applyRealtimeInputFrame(state, "runner", inputFrame(1, { moveX: 1 })));
    tickRealtimeArena(state, 250);
    expect(getPlayer(state, "runner").position).toEqual({ x: 40, y: 50 });

    expectAccepted(applyRealtimeInputFrame(state, "runner", inputFrame(2, { moveY: -1 })));
    tickRealtimeArena(state, 1000);
    expect(getPlayer(state, "runner").position).toEqual({ x: 40, y: 10 });
  });

  it("lets only one competing player carry the same core on a shared tick", () => {
    const state = createRealtimeArenaState({
      layout: contestedPickupLayout,
      rules: {
        countdownMs: 0
      },
      players: [
        { id: "player-green", teamId: "green" },
        { id: "player-orange", teamId: "orange" }
      ]
    });

    readyAndStart(state, ["player-green", "player-orange"]);
    expectAccepted(
      applyRealtimeInputFrame(state, "player-green", inputFrame(1, { interact: true }))
    );
    expectAccepted(
      applyRealtimeInputFrame(state, "player-orange", inputFrame(1, { interact: true }))
    );

    tickRealtimeArena(state, 16);

    expect(state.cores[0]?.carriedByPlayerId).toBe("player-green");
    expect(getPlayer(state, "player-green").carryingCoreId).toBe("core-alpha");
    expect(getPlayer(state, "player-orange").carryingCoreId).toBeUndefined();
    expect(state.events.filter((event) => event.type === "core.picked")).toHaveLength(1);
  });

  it("removes a player and releases carried cores when the player leaves", () => {
    const state = createRealtimeArenaState({
      layout: deliveryLayout,
      rules: {
        countdownMs: 0
      },
      players: [
        { id: "runner", teamId: "green" },
        { id: "defender", teamId: "orange" }
      ]
    });

    readyAndStart(state, ["runner", "defender"]);
    expectAccepted(applyRealtimeInputFrame(state, "runner", inputFrame(1, { interact: true })));
    tickRealtimeArena(state, 16);
    expect(getPlayer(state, "runner").carryingCoreId).toBe("core-alpha");
    expect(state.cores[0]?.carriedByPlayerId).toBe("runner");

    expectAccepted(removeRealtimeArenaPlayer(state, "runner"));

    expect(state.players.map((player) => player.id)).toEqual(["defender"]);
    expect(state.cores[0]?.carriedByPlayerId).toBeUndefined();
    expect(state.cores[0]?.position).toEqual(state.cores[0]?.spawn);
    expect(state.events.at(-1)).toMatchObject({
      type: "player.left",
      playerId: "runner"
    });
  });
});

const deliveryLayout: RealtimeArenaLayoutInput = {
  bounds: { width: 160, height: 120 },
  spawnPoints: {
    green: { x: 40, y: 60 },
    orange: { x: 120, y: 60 }
  },
  relayNodes: [
    {
      id: "relay-green",
      teamId: "green",
      position: { x: 40, y: 60 },
      radius: 20
    },
    {
      id: "relay-orange",
      teamId: "orange",
      position: { x: 120, y: 60 },
      radius: 20
    }
  ],
  cores: [
    {
      id: "core-alpha",
      position: { x: 42, y: 60 },
      radius: 8
    }
  ],
  walls: []
};

const collisionLayout: RealtimeArenaLayoutInput = {
  bounds: { width: 120, height: 100 },
  spawnPoints: {
    green: { x: 40, y: 50 }
  },
  relayNodes: [],
  cores: [],
  walls: [
    {
      id: "wall-center",
      x: 55,
      y: 35,
      width: 20,
      height: 30
    }
  ]
};

const contestedPickupLayout: RealtimeArenaLayoutInput = {
  bounds: { width: 160, height: 120 },
  spawnPoints: {
    green: { x: 80, y: 60 },
    orange: { x: 80, y: 60 }
  },
  relayNodes: [
    {
      id: "relay-green",
      teamId: "green",
      position: { x: 40, y: 60 },
      radius: 20
    },
    {
      id: "relay-orange",
      teamId: "orange",
      position: { x: 120, y: 60 },
      radius: 20
    }
  ],
  cores: [
    {
      id: "core-alpha",
      position: { x: 80, y: 60 },
      radius: 8
    }
  ],
  walls: []
};

function readyAndStart(state: RealtimeArenaState, playerIds: string[]): void {
  for (const playerId of playerIds) {
    expectAccepted(setRealtimeArenaPlayerReady(state, playerId, true));
  }
  expectAccepted(startRealtimeArenaCountdown(state));
}

function inputFrame(
  sequence: number,
  overrides: Partial<RealtimeInputFrame> = {}
): RealtimeInputFrame {
  return {
    sequence,
    clientTime: sequence * 16,
    moveX: 0,
    moveY: 0,
    sprint: false,
    interact: false,
    ...overrides
  };
}

function getPlayer(state: RealtimeArenaState, playerId: string): RealtimeArenaPlayer {
  const player = state.players.find((candidate) => candidate.id === playerId);
  expect(player).toBeDefined();
  return player as RealtimeArenaPlayer;
}

function expectAccepted(result: RealtimeArenaActionResult): void {
  expect(result).toEqual({ accepted: true });
}

function expectRejected(result: RealtimeArenaActionResult, code: string): void {
  expect(result).toEqual(expect.objectContaining({ accepted: false, code }));
}
