import { describe, expect, it } from "vitest";
import {
  formatRealtimeArenaDiagnostics,
  formatRealtimeArenaDiagnosticsTitle,
  resolveMultiplayerDemoJoinRole,
  resolveMultiplayerDemoRoomControls,
  resolveRealtimeArenaControlPermissions,
  type MultiplayerDemoRunMode
} from "./ui";

describe("multiplayer-demo UI state", () => {
  it.each([
    [
      "local-offline",
      { host: true, join: true, leave: false, resetRoom: false },
      { ready: true, startRound: true, interact: true, rematch: true, resetArena: true }
    ],
    [
      "host",
      { host: false, join: false, leave: true, resetRoom: true },
      { ready: true, startRound: true, interact: true, rematch: true, resetArena: true }
    ],
    [
      "client",
      { host: false, join: false, leave: true, resetRoom: false },
      { ready: true, startRound: false, interact: true, rematch: false, resetArena: false }
    ],
    [
      "host-not-joined",
      { host: false, join: true, leave: false, resetRoom: true },
      { ready: false, startRound: false, interact: false, rematch: false, resetArena: false }
    ],
    [
      "hosted-not-joined",
      { host: false, join: true, leave: false, resetRoom: false },
      { ready: false, startRound: false, interact: false, rematch: false, resetArena: false }
    ]
  ] satisfies Array<
    [
      MultiplayerDemoRunMode,
      ReturnType<typeof resolveMultiplayerDemoRoomControls>,
      ReturnType<typeof resolveRealtimeArenaControlPermissions>
    ]
  >)("resolves controls for %s mode", (mode, roomControls, arenaControls) => {
    expect(resolveMultiplayerDemoRoomControls(mode)).toEqual(roomControls);
    expect(resolveRealtimeArenaControlPermissions(mode)).toEqual(arenaControls);
  });

  it("disables every room control while an action is busy", () => {
    expect(resolveMultiplayerDemoRoomControls("host", true)).toEqual({
      host: false,
      join: false,
      leave: false,
      resetRoom: false
    });
  });

  it("formats realtime arena presentation diagnostics for the HUD", () => {
    const diagnostics = {
      inputSequence: 12,
      inputSendRate: 20,
      serverTickRate: 19,
      presentation: {
        bufferLength: 4,
        frameRate: 58,
        frameDeltaMs: 17,
        framesPresented: 120,
        clampedFrames: 2,
        adaptiveDelayEnabled: true,
        interpolationDelayMs: 72,
        targetDelayMs: 80,
        estimatedJitterMs: 15,
        acceptedSnapshots: 4,
        droppedSnapshots: 0,
        staleSnapshots: 0,
        duplicateSnapshots: 0,
        resets: 0,
        lastSampleStatus: "interpolated",
        lastSampleAgeMs: 96,
        lastSampleDelayMs: 100
      },
      authorityInput: {
        queuedInputs: 0,
        maxQueuedInputs: 2,
        coalescedInputs: 7
      },
      participant: {
        peerId: "client-late",
        status: "next-round",
        displayName: "Late Runner"
      },
      participantSummary: {
        active: 2,
        tracked: 3,
        round: 2,
        waiting: 1,
        disconnected: 0
      }
    } as const;

    expect(formatRealtimeArenaDiagnostics(diagnostics)).toBe(
      "12 / 20hz / 19tps / 58fps / d72 / j15 / q0 / p2/2 / c0"
    );
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain("interpolated");
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain("jitter 15ms");
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain("coalesced 7");
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain(
      "participants active 2; tracked 3; round 2; waiting 1; disconnected 0"
    );
  });

  it("formats realtime arena prediction diagnostics for the HUD title", () => {
    const diagnostics = {
      inputSequence: 14,
      inputSendRate: 20,
      serverTickRate: 20,
      presentation: {
        bufferLength: 2,
        frameRate: 60,
        frameDeltaMs: 16,
        framesPresented: 8,
        clampedFrames: 0,
        adaptiveDelayEnabled: true,
        interpolationDelayMs: 64,
        targetDelayMs: 70,
        estimatedJitterMs: 7,
        acceptedSnapshots: 2,
        droppedSnapshots: 0,
        staleSnapshots: 0,
        duplicateSnapshots: 0,
        resets: 0,
        lastSampleStatus: "exact",
        lastSampleAgeMs: 40,
        lastSampleDelayMs: 100
      },
      prediction: {
        predictedInputs: 14,
        rejectedInputs: 0,
        acknowledgedInputs: 10,
        replayedInputs: 4,
        droppedInputs: 0,
        corrections: 1,
        resets: 0,
        presentedFrames: 60,
        clampedPresentationFrames: 0,
        smoothedCorrections: 1,
        correctionSmoothingActive: true,
        correctionSmoothingElapsedMs: 24,
        pendingInputs: 4,
        presentationElapsedMs: 16,
        presentationAlpha: 0.32,
        maxCorrectionMagnitude: 2.5,
        inputAckSequence: 10,
        inputLead: 4,
        roundTripTimeMs: 84,
        snapshotAgeMs: 38,
        lastCorrectionMagnitude: 2.5
      }
    } as const;

    expect(formatRealtimeArenaDiagnostics(diagnostics)).toBe(
      "14->10 / 20hz / 20tps / 60fps / d64 / j7 / q0 / c3"
    );
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain("rtt 84ms");
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain("smoothing 24ms");
    expect(formatRealtimeArenaDiagnosticsTitle(diagnostics)).toContain(
      "prediction phase 32% (16ms)"
    );
  });

  it.each([
    ["local-offline", "client"],
    ["host", "client"],
    ["client", "client"],
    ["host-not-joined", "host"],
    ["hosted-not-joined", "client"]
  ] satisfies Array<[MultiplayerDemoRunMode, ReturnType<typeof resolveMultiplayerDemoJoinRole>]>)(
    "resolves join role for %s mode",
    (mode, role) => {
      expect(resolveMultiplayerDemoJoinRole(mode)).toBe(role);
    }
  );
});
