import { describe, expect, it } from "vitest";
import { createRealtimeLocalGame } from "./local-game";

describe("realtime local game", () => {
  it("feeds sampled input into the fixed tick simulation", () => {
    const game = createRealtimeLocalGame();
    const playerId = game.localPlayerId;

    expect(game.setReady(true).accepted).toBe(true);
    expect(game.startRound().accepted).toBe(true);
    for (let now = 0; now <= 2000; now += 50) {
      game.step(now);
    }
    expect(game.state.phase).toBe("running");

    const startX = game.state.players.find((player) => player.id === playerId)?.position.x;
    game.setInputKey("KeyD", true);
    game.step(2050);

    const endX = game.state.players.find((player) => player.id === playerId)?.position.x;
    expect(endX).toBeGreaterThan(startX ?? 0);
  });

  it("keeps the configured player name in local offline practice", () => {
    const game = createRealtimeLocalGame({ playerName: "Pilot" });

    expect(game.state.players[0]?.label).toBe("Pilot");
    expect(game.setPlayerName("Pilot Prime").accepted).toBe(true);
    expect(game.state.players[0]?.label).toBe("Pilot Prime");

    game.reset();

    expect(game.state.players[0]?.label).toBe("Pilot Prime");
  });
});
