import { describe, expect, it } from "vitest";
import { createRealtimePracticeArenaState } from "./config";
import { captureRealtimeArenaSnapshot, createRealtimeArenaState } from "./domain";
import { createRealtimeArenaPlayerPrediction } from "./prediction";
import type { RealtimeArenaSnapshotPayload } from "./protocol";

describe("realtime arena player prediction", () => {
  it("predicts local input and reconciles acknowledged authoritative snapshots", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    state.phase = "running";
    const prediction = createRealtimeArenaPlayerPrediction();
    const snapshot = captureRealtimeArenaSnapshot(state);
    const startX = snapshot.players[0]?.position.x ?? 0;

    const predicted = prediction.predict(snapshot, "runner", {
      sequence: 1,
      clientTime: 10,
      moveX: 1,
      moveY: 0,
      sprint: false
    });

    expect(predicted?.position.x).toBeGreaterThan(startX);

    const payload: RealtimeArenaSnapshotPayload = {
      snapshot,
      playersByPeerId: { peer: "runner" },
      inputAcksByPeerId: { peer: 1 },
      serverTime: 80
    };
    const reconciled = prediction.reconcile(payload, "peer", {
      frameTime: 120,
      wallTime: 130
    });

    expect(reconciled?.playerId).toBe("runner");
    expect(prediction.diagnostics()).toMatchObject({
      pendingInputs: 0,
      inputAckSequence: 1,
      roundTripTimeMs: 110,
      snapshotAgeMs: 50
    });
  });

  it("presents local prediction between fixed input ticks without resetting on reconcile", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    state.phase = "running";
    const prediction = createRealtimeArenaPlayerPrediction();
    const snapshot = captureRealtimeArenaSnapshot(state);
    const startX = snapshot.players[0]?.position.x ?? 0;
    const frame = {
      sequence: 1,
      clientTime: 50,
      moveX: 1 as const,
      moveY: 0 as const,
      sprint: false
    };

    const predicted = prediction.predict(snapshot, "runner", frame);
    const presentedAt50 = prediction.present(0, 50);
    const presentedAt60 = prediction.present(10, 60);
    const presentedAt70 = prediction.present(10, 70);

    expect(predicted).toBeDefined();
    expect(presentedAt50?.position.x).toBe(startX);
    expect(presentedAt60?.position.x).toBeGreaterThan(startX);
    expect(presentedAt60?.position.x).toBeLessThan(predicted?.position.x ?? 0);
    expect(presentedAt70?.position.x).toBeGreaterThan(presentedAt60?.position.x ?? 0);
    expect(prediction.state()?.position).toEqual(predicted?.position);

    const authoritativeSnapshot = captureRealtimeArenaSnapshot(state);
    const authoritativePlayer = authoritativeSnapshot.players[0];
    if (!authoritativePlayer || !predicted) {
      throw new Error("Expected predicted player state");
    }
    authoritativePlayer.position = { ...predicted.position };
    authoritativePlayer.velocity = { ...predicted.velocity };
    authoritativePlayer.lastInputSequence = 1;
    prediction.reconcile(
      {
        snapshot: authoritativeSnapshot,
        playersByPeerId: { peer: "runner" },
        inputAcksByPeerId: { peer: 1 },
        serverTime: 70
      },
      "peer",
      { frameTime: 70, wallTime: 70 }
    );

    const presentedAfterReconcile = prediction.present(10, 80);
    expect(presentedAfterReconcile?.position.x).toBeGreaterThan(presentedAt70?.position.x ?? 0);

    const clamped = prediction.present(120, 200);
    expect(clamped?.position.x).toBeCloseTo(predicted.position.x);
    expect(prediction.diagnostics()).toMatchObject({
      presentedFrames: 5,
      clampedPresentationFrames: 1,
      presentationElapsedMs: 50,
      presentationAlpha: 1
    });
  });

  it("keeps press, release, and reversal transitions continuous at prediction boundaries", () => {
    const movementPerRenderMs = 155 / 1000;

    expect(sampleTransition(0, 1)).toMatchObject({
      boundaryDelta: 0,
      nextFrameDelta: movementPerRenderMs
    });
    expect(sampleTransition(1, 1)).toMatchObject({
      boundaryDelta: movementPerRenderMs,
      nextFrameDelta: movementPerRenderMs
    });
    expect(sampleTransition(1, 0)).toMatchObject({
      boundaryDelta: movementPerRenderMs,
      nextFrameDelta: 0
    });
    expect(sampleTransition(1, -1)).toMatchObject({
      boundaryDelta: movementPerRenderMs,
      nextFrameDelta: -movementPerRenderMs
    });
  });

  it("keeps 120 Hz presentation bounded during ten simulated minutes of input changes", () => {
    const state = createRealtimePracticeArenaState([{ id: "runner", teamId: "green" }]);
    state.phase = "running";
    const snapshot = captureRealtimeArenaSnapshot(state);
    const prediction = createRealtimeArenaPlayerPrediction();
    const renderDeltaMs = 1000 / 120;
    const durationMs = 10 * 60 * 1000;
    let nextPredictionTime = 0;
    let sequence = 0;
    let previousX = snapshot.players[0]?.position.x ?? 0;
    let maxFrameDistance = 0;

    for (let now = renderDeltaMs; now <= durationMs; now += renderDeltaMs) {
      while (nextPredictionTime <= now) {
        sequence += 1;
        const phase = Math.floor(nextPredictionTime / 1000) % 3;
        prediction.predict(
          snapshot,
          "runner",
          inputFrame(sequence, nextPredictionTime, phase === 0 ? 1 : phase === 1 ? -1 : 0)
        );
        nextPredictionTime += 50;
      }
      const presented = prediction.present(renderDeltaMs, now);
      if (!presented) {
        throw new Error("Expected long-running prediction presentation");
      }
      maxFrameDistance = Math.max(maxFrameDistance, Math.abs(presented.position.x - previousX));
      previousX = presented.position.x;
    }

    expect(maxFrameDistance).toBeLessThanOrEqual((155 * renderDeltaMs) / 1000 + 0.000_001);
    expect(prediction.diagnostics()).toMatchObject({
      corrections: 0,
      pendingInputs: 240,
      lastPredictedSequence: sequence
    });
  });

  it("catches up multiple prediction ticks after a long render frame without overshooting", () => {
    const state = createRealtimePracticeArenaState([{ id: "runner", teamId: "green" }]);
    state.phase = "running";
    const snapshot = captureRealtimeArenaSnapshot(state);
    const prediction = createRealtimeArenaPlayerPrediction();

    prediction.predict(snapshot, "runner", inputFrame(1, 0, 1));
    const beforeStall = prediction.present(33, 33);
    prediction.predict(snapshot, "runner", inputFrame(2, 50, 1));
    prediction.predict(snapshot, "runner", inputFrame(3, 100, 1));
    prediction.predict(snapshot, "runner", inputFrame(4, 150, 1));
    const afterStall = prediction.present(120, 153);
    if (!beforeStall || !afterStall) {
      throw new Error("Expected prediction samples around render stall");
    }

    expect(afterStall.position.x - beforeStall.position.x).toBeCloseTo((155 * 120) / 1000);
    expect(prediction.diagnostics()).toMatchObject({
      clampedPresentationFrames: 0,
      presentationElapsedMs: 3,
      presentationAlpha: 0.06
    });
  });

  it("smooths a small authoritative correction without delaying simulation reconciliation", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    state.phase = "running";
    const prediction = createRealtimeArenaPlayerPrediction();
    const snapshot = captureRealtimeArenaSnapshot(state);

    prediction.predict(snapshot, "runner", {
      sequence: 1,
      clientTime: 50,
      moveX: 1,
      moveY: 0,
      sprint: false
    });
    const beforeCorrection = prediction.present(20, 70);
    prediction.reconcile(
      {
        snapshot,
        playersByPeerId: { peer: "runner" },
        inputAcksByPeerId: { peer: 1 },
        serverTime: 70
      },
      "peer",
      { frameTime: 70, wallTime: 70 }
    );

    const reconciledState = prediction.state();
    const firstCorrectedFrame = prediction.present(10, 80);

    expect(reconciledState?.position).toEqual(snapshot.players[0]?.position);
    expect(firstCorrectedFrame?.position.x).toBeLessThan(beforeCorrection?.position.x ?? 0);
    expect(firstCorrectedFrame?.position.x).toBeGreaterThan(
      (beforeCorrection?.position.x ?? 0) - 2
    );
  });

  it("does not present prediction outside the running phase", () => {
    const state = createRealtimeArenaState({
      players: [{ id: "runner", teamId: "green" }]
    });
    const prediction = createRealtimeArenaPlayerPrediction();

    prediction.reconcile(
      {
        snapshot: captureRealtimeArenaSnapshot(state),
        playersByPeerId: { peer: "runner" },
        inputAcksByPeerId: { peer: 0 },
        serverTime: 0
      },
      "peer",
      { frameTime: 0, wallTime: 0 }
    );

    expect(prediction.present(16, 16)).toBeUndefined();
  });
});

function sampleTransition(
  firstMoveX: -1 | 0 | 1,
  secondMoveX: -1 | 0 | 1
): { boundaryDelta: number; nextFrameDelta: number } {
  const state = createRealtimePracticeArenaState([{ id: "runner", teamId: "green" }]);
  state.phase = "running";
  const snapshot = captureRealtimeArenaSnapshot(state);
  const prediction = createRealtimeArenaPlayerPrediction();

  prediction.predict(snapshot, "runner", inputFrame(1, 0, firstMoveX));
  const beforeBoundary = prediction.present(49, 49);
  prediction.predict(snapshot, "runner", inputFrame(2, 50, secondMoveX));
  const atBoundary = prediction.present(1, 50);
  const nextFrame = prediction.present(1, 51);
  if (!beforeBoundary || !atBoundary || !nextFrame) {
    throw new Error("Expected prediction transition samples");
  }

  return {
    boundaryDelta: round(atBoundary.position.x - beforeBoundary.position.x),
    nextFrameDelta: round(nextFrame.position.x - atBoundary.position.x)
  };
}

function inputFrame(sequence: number, clientTime: number, moveX: -1 | 0 | 1) {
  return {
    sequence,
    clientTime,
    moveX,
    moveY: 0 as const,
    sprint: false
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
