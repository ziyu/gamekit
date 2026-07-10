import { describe, expect, it } from "vitest";
import {
  captureRealtimeArenaSnapshot,
  createRealtimeArenaState,
  type RealtimeArenaSnapshot
} from "./domain";
import { createRealtimeArenaPresentation } from "./presentation";

describe("realtime arena presentation", () => {
  it("smooths player movement between fixed-tick authoritative snapshots", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 0,
      adaptiveDelay: false,
      snapDistance: 1000
    });

    const start = presentation.present(captureRealtimeArenaSnapshot(state), 16);
    const startX = readPlayer(start).position.x;

    state.tick += 1;
    readStatePlayer(state).position = { x: startX + 48, y: readStatePlayer(state).position.y };

    const first = presentation.present(captureRealtimeArenaSnapshot(state), 16);
    const second = presentation.present(captureRealtimeArenaSnapshot(state), 16);

    expect(readPlayer(first).position.x).toBeGreaterThan(startX);
    expect(readPlayer(first).position.x).toBeLessThan(startX + 48);
    expect(readPlayer(second).position.x).toBeGreaterThan(readPlayer(first).position.x);
  });

  it("samples behind latest snapshots when interpolation delay is configured", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 100,
      adaptiveDelay: false,
      snapDistance: 1000
    });

    const start = presentation.present(captureRealtimeArenaSnapshot(state), 0);
    const startX = readPlayer(start).position.x;
    const y = readStatePlayer(state).position.y;

    state.tick += 1;
    readStatePlayer(state).position = { x: startX + 50, y };
    presentation.present(captureRealtimeArenaSnapshot(state), 50);

    state.tick += 1;
    readStatePlayer(state).position = { x: startX + 100, y };
    presentation.present(captureRealtimeArenaSnapshot(state), 50);

    state.tick += 1;
    readStatePlayer(state).position = { x: startX + 150, y };
    const delayed = presentation.present(captureRealtimeArenaSnapshot(state), 25);

    expect(presentation.diagnostics().lastSampleStatus).toBe("interpolated");
    expect(readPlayer(delayed).position.x).toBeGreaterThan(startX);
    expect(readPlayer(delayed).position.x).toBeLessThan(startX + 50);
  });

  it("caps render time when local frames outrun the snapshot stream", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 100,
      adaptiveDelay: false,
      snapDistance: 1000
    });

    const start = presentation.present(captureRealtimeArenaSnapshot(state), 0);
    const startX = readPlayer(start).position.x;
    const y = readStatePlayer(state).position.y;

    state.tick += 1;
    readStatePlayer(state).position = { x: startX + 50, y };
    const latest = captureRealtimeArenaSnapshot(state);
    let presented = presentation.present(latest, 50);
    for (let frame = 0; frame < 12; frame += 1) {
      presented = presentation.present(latest, 50);
    }

    expect(presentation.diagnostics().lastSampleStatus).toBe("exact");
    expect(presentation.diagnostics().clampedFrames).toBeGreaterThan(0);
    expect(readPlayer(presented).position.x).toBe(startX + 50);
  });

  it("reports presentation frame rate from presented frame deltas", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation();
    const snapshot = captureRealtimeArenaSnapshot(state);

    for (let frame = 0; frame < 10; frame += 1) {
      presentation.present(snapshot, 100);
    }

    expect(presentation.diagnostics().frameRate).toBe(10);
    expect(presentation.diagnostics().frameDeltaMs).toBe(100);
  });

  it("snaps large authoritative jumps instead of easing across teleports", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 0,
      adaptiveDelay: false,
      snapDistance: 32
    });

    presentation.present(captureRealtimeArenaSnapshot(state), 16);
    state.tick += 1;
    readStatePlayer(state).position = { x: 400, y: 200 };

    const presented = presentation.present(captureRealtimeArenaSnapshot(state), 16);

    expect(readPlayer(presented).position).toEqual({ x: 400, y: 200 });
  });

  it("keeps carried cores attached to the presented carrier position", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 0,
      adaptiveDelay: false,
      snapDistance: 1000
    });

    const player = readStatePlayer(state);
    const core = state.cores[0];
    if (!core) {
      throw new Error("Expected a default core");
    }

    player.carryingCoreId = core.id;
    core.carriedByPlayerId = player.id;
    core.position = { ...player.position };
    presentation.present(captureRealtimeArenaSnapshot(state), 16);

    state.tick += 1;
    player.position = { x: player.position.x + 48, y: player.position.y };
    core.position = { ...player.position };

    const presented = presentation.present(captureRealtimeArenaSnapshot(state), 16);
    const presentedPlayer = readPlayer(presented);
    const presentedCore = presented.cores[0];

    expect(presentedCore?.position).toEqual(presentedPlayer.position);
    expect(presentedCore?.position.x).toBeLessThan(player.position.x);
  });

  it("lets local prediction override only the predicted player render position", () => {
    const state = createRealtimeArenaState({
      players: [
        { id: "runner", teamId: "green" },
        { id: "remote", teamId: "orange" }
      ]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 0,
      adaptiveDelay: false,
      snapDistance: 1000
    });
    const snapshot = captureRealtimeArenaSnapshot(state);

    const presented = presentation.present(snapshot, 16, {
      predictedPlayer: {
        playerId: "runner",
        position: { x: 222, y: 111 },
        velocity: { x: 20, y: 0 }
      }
    });

    const runner = presented.players.find((player) => player.id === "runner");
    const remote = presented.players.find((player) => player.id === "remote");
    expect(runner?.position).toEqual({ x: 222, y: 111 });
    expect(runner?.velocity).toEqual({ x: 20, y: 0 });
    expect(remote?.position).toEqual(
      snapshot.players.find((player) => player.id === "remote")?.position
    );
  });

  it("writes presentation values into reusable render targets without cloning snapshots", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const presentation = createRealtimeArenaPresentation({
      interpolationDelayMs: 0,
      adaptiveDelay: false,
      snapDistance: 1000
    });
    const firstSnapshot = captureRealtimeArenaSnapshot(state);
    const firstFrame = presentation.sample(firstSnapshot, 0);

    state.tick += 1;
    readStatePlayer(state).position.x += 50;
    const nextSnapshot = captureRealtimeArenaSnapshot(state);
    const nextFrame = presentation.sample(nextSnapshot, 25);
    const target = { x: 0, y: 0 };
    const nextPlayer = nextFrame.players[0];
    if (!nextPlayer) {
      throw new Error("Expected a presented player");
    }

    nextFrame.writePlayerPosition(nextPlayer.id, target, nextPlayer.position);

    expect(nextFrame).toBe(firstFrame);
    expect(nextFrame.snapshot).toBe(firstSnapshot);
    expect(target.x).toBeGreaterThan(firstSnapshot.players[0]?.position.x ?? 0);
    expect(target.x).toBeLessThan(nextPlayer.position.x);
    expect(nextSnapshot.players[0]?.position.x).toBe(nextPlayer.position.x);
  });
});

function readPlayer(snapshot: RealtimeArenaSnapshot): RealtimeArenaSnapshot["players"][number] {
  const player = snapshot.players[0];
  if (!player) {
    throw new Error("Expected a player snapshot");
  }
  return player;
}

function readStatePlayer(
  state: ReturnType<typeof createRealtimeArenaState>
): ReturnType<typeof createRealtimeArenaState>["players"][number] {
  const player = state.players[0];
  if (!player) {
    throw new Error("Expected a realtime arena player");
  }
  return player;
}
