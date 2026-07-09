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
