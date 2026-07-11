import { createEventBus } from "@gamekit/event-bus";
import { describe, expect, it } from "vitest";
import {
  createMultiplayerBridgeModule,
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityDiagnostics,
  createMultiplayerAuthorityHostLoop,
  createMultiplayerAuthorityReceiver,
  createMultiplayerLocalAuthorityLoop,
  createMultiplayerPeerPlayerBindingStore,
  createMultiplayerParticipantPolicy,
  createMultiplayerPredictionBuffer,
  createMultiplayerRuntime,
  createSnapshotBuffer,
  createSnapshotPresentationProjector,
  createSnapshotPlayback,
  createUniqueMultiplayerDisplayName,
  defineSnapshotVector2Track,
  interpolateAngleRadians,
  interpolateNumber,
  interpolateQuaternion,
  interpolateVector2,
  interpolateVector3,
  MULTIPLAYER_ACTION_KIND,
  MULTIPLAYER_INPUT_KIND,
  MULTIPLAYER_PATCH_KIND,
  MULTIPLAYER_RESULT_KIND,
  MULTIPLAYER_SNAPSHOT_KIND,
  multiplayerErrorCodes,
  normalizeMultiplayerDisplayName,
  presentSnapshotTracks,
  stepValue,
  type MultiplayerBackendAdapter,
  type MultiplayerBackendConnection,
  type MultiplayerBackendListener,
  type MultiplayerMessageEnvelope,
  type MultiplayerPeer,
  type MultiplayerSession,
  type NetworkAngleRadians,
  type NetworkScalar,
  type NetworkTransform2,
  type NetworkTransform3,
  type NetworkVector2
} from "../src";

describe("createMultiplayerRuntime", () => {
  it("creates sessions and normalizes outgoing messages", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend,
      clock: () => 123,
      idGenerator: () => "message-1"
    });

    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host", role: "host" }
    });
    await runtime.send({
      channel: "reliable",
      kind: "game.command",
      payload: { action: "move" }
    });

    expect(fake.sent).toEqual([
      {
        id: "message-1",
        sessionId: "session-1",
        channel: "reliable",
        kind: "game.command",
        sourcePeerId: "host",
        sequence: 1,
        timestamp: 123,
        payload: { action: "move" }
      }
    ]);
    expect(runtime.snapshot()).toMatchObject({
      id: "runtime",
      backendId: "fake",
      phase: "in-session",
      sent: 1,
      received: 0,
      session: {
        id: "session-1"
      },
      localPeer: {
        id: "host"
      }
    });
  });

  it("cleans listeners on dispose and rejects later sends", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const received: MultiplayerMessageEnvelope[] = [];

    runtime.subscribe((message) => received.push(message));
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });
    await runtime.dispose();
    fake.emit({
      id: "ignored",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "remote",
      timestamp: 0,
      payload: {}
    });

    expect(received).toEqual([]);
    await expect(
      runtime.send({
        channel: "reliable",
        kind: "game.command",
        payload: {}
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [GameError: Multiplayer runtime has been disposed.]
    `);
  });

  it("refreshes phase from the backend connection snapshot", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });

    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });
    expect(runtime.phase()).toBe("in-session");

    fake.dropSession();

    expect(runtime.phase()).toBe("connected");
    expect(runtime.session()).toBeUndefined();
  });

  it("rejects reconnect with a stable unsupported capability error", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });

    await expect(runtime.reconnect?.()).rejects.toMatchObject({
      code: multiplayerErrorCodes.unsupportedCapability,
      details: {
        backendId: "fake",
        capability: "reconnect"
      }
    });
  });
});

describe("multiplayer authority helpers", () => {
  it("applies snapshots only from the bound authority source", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "client-runtime",
      backend: fake.backend,
      clock: () => 100
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "client", role: "client" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host",
      localPlayerId: "player-client"
    });
    let latestSnapshot: { x: number } | undefined;
    const receiver = createMultiplayerAuthorityReceiver<{ x: number }>({
      runtime,
      binding,
      clock: () => 150,
      readSnapshot(payload) {
        return isRecord(payload) && typeof payload.x === "number" ? { x: payload.x } : undefined;
      },
      applySnapshot(snapshot) {
        latestSnapshot = snapshot;
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_SNAPSHOT_KIND, { x: 99 }));
    fake.emit(messageFrom("host", MULTIPLAYER_SNAPSHOT_KIND, { x: 7 }, { tick: 3 }));

    expect(latestSnapshot).toEqual({ x: 7 });
    expect(receiver.diagnostics()).toMatchObject({
      receivedSnapshots: 2,
      appliedSnapshots: 1,
      rejectedMessages: 1,
      lastAppliedTick: 3,
      lastSnapshotAgeMs: 50,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client"
      }
    });
    expect(binding.current()).toMatchObject({ tick: 3 });
  });

  it("applies patches and results only from the bound authority source", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "client-runtime",
      backend: fake.backend,
      clock: () => 100
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "client", role: "client" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host",
      localPlayerId: "player-client"
    });
    let latestPatch: { dx: number } | undefined;
    let latestResult: { accepted: boolean } | undefined;
    const receiver = createMultiplayerAuthorityReceiver<
      { x: number },
      { dx: number },
      { accepted: boolean }
    >({
      runtime,
      binding,
      readSnapshot(payload) {
        return isRecord(payload) && typeof payload.x === "number" ? { x: payload.x } : undefined;
      },
      readPatch(payload) {
        return isRecord(payload) && typeof payload.dx === "number" ? { dx: payload.dx } : undefined;
      },
      readResult(payload) {
        return isRecord(payload) && typeof payload.accepted === "boolean"
          ? { accepted: payload.accepted }
          : undefined;
      },
      applySnapshot() {
        // This test focuses on patch/result source gates.
      },
      applyPatch(patch) {
        latestPatch = patch;
      },
      applyResult(result) {
        latestResult = result;
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_PATCH_KIND, { dx: 99 }));
    fake.emit(messageFrom("host", MULTIPLAYER_PATCH_KIND, { dx: 2 }, { tick: 5 }));
    fake.emit(messageFrom("client", MULTIPLAYER_RESULT_KIND, { accepted: false }));
    fake.emit(messageFrom("host", MULTIPLAYER_RESULT_KIND, { accepted: true }, { tick: 6 }));

    expect(latestPatch).toEqual({ dx: 2 });
    expect(latestResult).toEqual({ accepted: true });
    expect(receiver.diagnostics()).toMatchObject({
      receivedPatches: 2,
      appliedPatches: 1,
      receivedResults: 2,
      appliedResults: 1,
      rejectedMessages: 2,
      lastAppliedTick: 6,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client",
        kind: MULTIPLAYER_RESULT_KIND
      }
    });
    expect(binding.current()).toMatchObject({ tick: 6 });
  });

  it("runs host authority actions and inputs before broadcasting a snapshot", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "host-runtime",
      backend: fake.backend,
      clock: () => 200
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    const state = { started: false, x: 0 };
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    const loop = createMultiplayerAuthorityHostLoop<ActionPayload, InputPayload, SnapshotPayload>({
      runtime,
      binding,
      readAction: readAction,
      readInput: readInput,
      inputSequence: (input) => input.sequence,
      handleAction({ payload }) {
        if (payload.type === "start") {
          state.started = true;
        }
      },
      handleInput({ payload }) {
        if (!state.started) {
          return { allowed: false, code: "not-started", reason: "Game has not started." };
        }
        state.x += payload.dx;
      },
      captureSnapshot({ tick }) {
        return { ...state, tick };
      }
    });

    fake.emit(messageFrom("client", MULTIPLAYER_ACTION_KIND, { type: "start" }));
    fake.emit(messageFrom("client", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 2 }));
    loop.tick(16);
    await waitFor(() => fake.sent.some((message) => message.kind === MULTIPLAYER_SNAPSHOT_KIND));

    expect(state).toEqual({ started: true, x: 2 });
    expect(fake.sent).toEqual([
      expect.objectContaining({
        kind: MULTIPLAYER_SNAPSHOT_KIND,
        sourcePeerId: "host",
        tick: 1,
        payload: { started: true, x: 2, tick: 1 }
      })
    ]);
    expect(loop.diagnostics()).toMatchObject({
      tick: 1,
      receivedActions: 1,
      acceptedActions: 1,
      receivedInputs: 1,
      acceptedInputs: 1,
      sentSnapshots: 1
    });
  });

  it("bounds realtime input consumption per source at each authority tick", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "bounded-input-host",
      backend: fake.backend,
      clock: () => 200
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    const processed: string[] = [];
    const loop = createMultiplayerAuthorityHostLoop<never, InputPayload, { tick: number }>({
      runtime,
      binding,
      readInput,
      inputSequence: (input) => input.sequence,
      maxInputsPerSourcePerTick: 1,
      maxQueuedInputsPerSource: 2,
      handleInput({ message, payload }) {
        processed.push(`${message.sourcePeerId}:${payload.sequence}`);
      },
      captureSnapshot({ tick }) {
        return { tick };
      }
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 2, dx: 1 }));
    fake.emit(messageFrom("client-b", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));

    loop.tick(50);
    expect(processed).toEqual(["client-a:1", "client-b:1"]);
    expect(loop.diagnostics()).toMatchObject({ acceptedInputs: 2, tick: 1 });

    loop.tick(50);
    expect(processed).toEqual(["client-a:1", "client-b:1", "client-a:2"]);
    expect(loop.diagnostics()).toMatchObject({ acceptedInputs: 3, tick: 2 });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 4, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 3, dx: 1 }));
    loop.tick(50);
    loop.tick(50);

    expect(processed).toEqual(["client-a:1", "client-b:1", "client-a:2", "client-a:4"]);
    expect(loop.diagnostics()).toMatchObject({
      acceptedInputs: 4,
      rejectedInputs: 1,
      tick: 4,
      lastRejected: { code: "stale-input" }
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 5, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 6, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 7, dx: 1 }));
    loop.tick(50);
    loop.tick(50);

    expect(processed).toEqual([
      "client-a:1",
      "client-b:1",
      "client-a:2",
      "client-a:4",
      "client-a:5",
      "client-a:6"
    ]);
    expect(loop.diagnostics()).toMatchObject({
      acceptedInputs: 6,
      rejectedInputs: 2,
      tick: 6,
      lastRejected: { code: "input-queue-full" }
    });
  });

  it("coalesces queued input state to the latest sequence per source", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "latest-input-host",
      backend: fake.backend,
      clock: () => 200
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    const processed: string[] = [];
    const loop = createMultiplayerAuthorityHostLoop<never, InputPayload, { tick: number }>({
      runtime,
      binding,
      readInput,
      inputSequence: (input) => input.sequence,
      inputQueueMode: "latest",
      handleInput({ message, payload }) {
        processed.push(`${message.sourcePeerId}:${payload.sequence}`);
      },
      captureSnapshot({ tick }) {
        return { tick };
      }
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 2, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 3, dx: 1 }));
    fake.emit(messageFrom("client-b", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));

    expect(loop.diagnostics()).toMatchObject({
      receivedInputs: 4,
      acceptedInputs: 0,
      coalescedInputs: 2,
      queuedInputs: 2,
      maxQueuedInputs: 2
    });

    loop.tick(50);
    expect(processed).toEqual(["client-a:3", "client-b:1"]);
    expect(loop.diagnostics()).toMatchObject({
      acceptedInputs: 2,
      coalescedInputs: 2,
      queuedInputs: 0
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 5, dx: 1 }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 4, dx: 1 }));
    loop.tick(50);

    expect(processed).toEqual(["client-a:3", "client-b:1", "client-a:5"]);
    expect(loop.diagnostics()).toMatchObject({
      acceptedInputs: 3,
      rejectedInputs: 1,
      queuedInputs: 0,
      lastRejected: { code: "stale-input" }
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 6, dx: 1 }));
    expect(loop.diagnostics().queuedInputs).toBe(1);
    loop.dispose();
    expect(loop.diagnostics().queuedInputs).toBe(0);
  });

  it("releases queued work and input sequence state when a peer disconnects", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "peer-release-host",
      backend: fake.backend,
      clock: () => 200
    });
    await runtime.createSession({
      id: "session-1",
      authority: "host-authoritative",
      localPeer: { id: "host", role: "host" }
    });
    const binding = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      authorityPeerId: "host"
    });
    const processed: string[] = [];
    const loop = createMultiplayerAuthorityHostLoop<ActionPayload, InputPayload, { tick: number }>({
      runtime,
      binding,
      readAction,
      readInput,
      inputSequence: (input) => input.sequence,
      inputQueueMode: "latest",
      handleAction({ message }) {
        processed.push(`${message.sourcePeerId}:action`);
      },
      handleInput({ message, payload }) {
        processed.push(`${message.sourcePeerId}:input:${payload.sequence}`);
      },
      captureSnapshot({ tick }) {
        return { tick };
      }
    });

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 7, dx: 1 }));
    loop.tick(50);
    expect(processed).toEqual(["client-a:input:7"]);

    fake.emit(messageFrom("client-a", MULTIPLAYER_ACTION_KIND, { type: "start" }));
    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 8, dx: 1 }));
    fake.emit(messageFrom("client-b", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));
    expect(loop.diagnostics().queuedInputs).toBe(2);

    loop.releasePeer("client-a");
    expect(loop.diagnostics().queuedInputs).toBe(1);
    loop.tick(50);
    expect(processed).toEqual(["client-a:input:7", "client-b:input:1"]);

    fake.emit(messageFrom("client-a", MULTIPLAYER_INPUT_KIND, { sequence: 1, dx: 1 }));
    loop.tick(50);
    expect(processed).toEqual(["client-a:input:7", "client-b:input:1", "client-a:input:1"]);
  });

  it("uses the same action and input contract for local authority", () => {
    const state = { started: false, x: 0 };
    const loop = createMultiplayerLocalAuthorityLoop<ActionPayload, InputPayload, SnapshotPayload>({
      binding: {
        sessionId: "local-session",
        mode: "local",
        localPlayerId: "local-player"
      },
      inputSequence: (input) => input.sequence,
      handleAction({ payload }) {
        if (payload.type === "start") {
          state.started = true;
        }
      },
      handleInput({ payload }) {
        if (!state.started) {
          return { allowed: false, code: "not-started", reason: "Game has not started." };
        }
        state.x += payload.dx;
      },
      tick() {
        // Local authority still flows through the same tick boundary as remote authority.
      },
      captureSnapshot({ tick }) {
        return { ...state, tick };
      }
    });

    expect(loop.binding()).toMatchObject({
      mode: "local",
      status: "bound",
      authorityEndpoint: { kind: "local", id: "local" }
    });
    expect(loop.dispatchAction({ type: "start" })).toEqual({ allowed: true });
    expect(loop.dispatchInput({ sequence: 1, dx: 2 })).toEqual({ allowed: true });
    expect(loop.dispatchInput({ sequence: 1, dx: 2 })).toMatchObject({
      allowed: false,
      code: "duplicate-input"
    });
    loop.tick(16);

    expect(loop.snapshot()).toEqual({ started: true, x: 2, tick: 1 });
    expect(loop.diagnostics()).toMatchObject({
      receivedActions: 1,
      acceptedActions: 1,
      receivedInputs: 2,
      acceptedInputs: 1,
      rejectedInputs: 1,
      sentSnapshots: 1
    });
  });

  it("summarizes authority state without provider handles or payloads", () => {
    const bindingStore = createMultiplayerAuthorityBindingStore({
      sessionId: "session-1",
      mode: "host-authoritative",
      status: "resyncing",
      authorityPeerId: "host",
      authorityEndpoint: { kind: "peer", id: "host-endpoint", peerId: "host" },
      localPlayerId: "player-client",
      tick: 4,
      snapshotVersion: "state.v1"
    });

    const diagnostics = createMultiplayerAuthorityDiagnostics({
      binding: bindingStore.current(),
      loop: {
        tick: 5,
        receivedActions: 2,
        acceptedActions: 1,
        rejectedActions: 1,
        receivedInputs: 3,
        acceptedInputs: 2,
        rejectedInputs: 1,
        sentSnapshots: 4,
        rejectedMessages: 2,
        lastRejected: { code: "stale-input", reason: "Input was stale." },
        lastBroadcastError: "transport closed"
      },
      receiver: {
        receivedSnapshots: 3,
        appliedSnapshots: 2,
        receivedPatches: 1,
        appliedPatches: 1,
        receivedResults: 1,
        appliedResults: 1,
        rejectedMessages: 1,
        lastAppliedTick: 4,
        lastSnapshotAgeMs: 25,
        lastRejected: {
          code: "non-authority-source",
          reason: "Rejected non-authority source.",
          sourcePeerId: "client"
        }
      },
      connection: {
        status: "closed",
        reason: "host-left",
        reconnectSupported: false,
        reconnectReason: "unsupported"
      }
    });

    expect(diagnostics).toMatchObject({
      sessionId: "session-1",
      mode: "host-authoritative",
      status: "resyncing",
      authoritativePath: "gamekit-envelope",
      resyncing: true,
      authorityPeerId: "host",
      localPlayerId: "player-client",
      tick: 4,
      snapshotVersion: "state.v1",
      receivedActions: 2,
      acceptedInputs: 2,
      sentSnapshots: 4,
      receivedSnapshots: 3,
      appliedPatches: 1,
      rejectedMessages: 3,
      lastAppliedTick: 4,
      lastSnapshotAgeMs: 25,
      lastRejected: {
        code: "non-authority-source",
        sourcePeerId: "client"
      },
      lastBroadcastError: "transport closed",
      connection: {
        status: "closed",
        reconnectSupported: false
      }
    });

    diagnostics.binding.status = "closed";
    expect(bindingStore.current().status).toBe("resyncing");
  });
});

describe("multiplayer prediction helpers", () => {
  it("reconciles authoritative state and replays unacknowledged inputs", () => {
    const prediction = createMultiplayerPredictionBuffer<
      { x: number; y: number },
      { dx: number; dy: number }
    >({
      initialState: { x: 0, y: 0 },
      cloneState(state) {
        return { ...state };
      },
      applyInput(state, input) {
        return {
          x: state.x + input.dx,
          y: state.y + input.dy
        };
      },
      measureCorrection(previous, next) {
        return Math.hypot(previous.x - next.x, previous.y - next.y);
      }
    });

    prediction.predict({ sequence: 1, input: { dx: 1, dy: 0 }, timestamp: 10 });
    prediction.predict({ sequence: 2, input: { dx: 1, dy: 0 }, timestamp: 20 });

    const result = prediction.reconcile({
      authoritativeState: { x: 1.25, y: 0 },
      acknowledgedSequence: 1
    });

    expect(result).toMatchObject({
      state: { x: 2.25, y: 0 },
      pendingInputs: 1,
      acknowledgedInputs: 1,
      replayedInputs: 1,
      correctionMagnitude: 0.25
    });
    expect(prediction.pendingInputs().map((frame) => frame.sequence)).toEqual([2]);
    expect(prediction.diagnostics()).toMatchObject({
      predictedInputs: 2,
      acknowledgedInputs: 1,
      replayedInputs: 1,
      corrections: 1,
      pendingInputs: 1,
      lastAcknowledgedSequence: 1,
      lastPredictedSequence: 2,
      lastCorrectionMagnitude: 0.25
    });
  });

  it("presents fixed-tick prediction continuously without mutating or rewinding it", () => {
    const prediction = createMultiplayerPredictionBuffer<
      { x: number; velocity: number },
      { velocity: number }
    >({
      initialState: { x: 0, velocity: 0 },
      predictionStepMs: 50,
      cloneState(state) {
        return { ...state };
      },
      applyInput(state, input) {
        return {
          x: state.x + input.velocity * 0.05,
          velocity: input.velocity
        };
      },
      presentState(fromState, toState, context) {
        return {
          x: fromState.x + (toState.x - fromState.x) * context.alpha,
          velocity: toState.velocity
        };
      }
    });

    prediction.predict({ sequence: 1, input: { velocity: 100 }, timestamp: 50 });

    expect(prediction.state()).toEqual({ x: 5, velocity: 100 });
    expect(prediction.present({ deltaMs: 10, timestamp: 60 })).toEqual({
      x: 1,
      velocity: 100
    });
    expect(prediction.present({ deltaMs: 10, timestamp: 70 })).toEqual({
      x: 2,
      velocity: 100
    });
    expect(prediction.state()).toEqual({ x: 5, velocity: 100 });

    prediction.reconcile({
      authoritativeState: { x: 5, velocity: 100 },
      acknowledgedSequence: 1,
      timestamp: 70
    });

    expect(prediction.present({ deltaMs: 10, timestamp: 80 })).toEqual({
      x: 3,
      velocity: 100
    });
    expect(prediction.present({ deltaMs: 120, timestamp: 200 })).toEqual({
      x: 5,
      velocity: 100
    });
    expect(prediction.diagnostics()).toMatchObject({
      presentedFrames: 4,
      clampedPresentationFrames: 1,
      presentationElapsedMs: 50,
      presentationAlpha: 1
    });
  });

  it("smooths correction only in presentation while simulation reconciles immediately", () => {
    const prediction = createMultiplayerPredictionBuffer<
      { x: number; velocity: number },
      { velocity: number }
    >({
      initialState: { x: 0, velocity: 0 },
      predictionStepMs: 50,
      cloneState(state) {
        return { ...state };
      },
      applyInput(state, input) {
        return {
          x: state.x + input.velocity * 0.05,
          velocity: input.velocity
        };
      },
      presentState(fromState, toState, context) {
        return {
          x: fromState.x + (toState.x - fromState.x) * context.alpha,
          velocity: toState.velocity
        };
      },
      measureCorrection(previous, next) {
        return Math.abs(previous.x - next.x);
      },
      correctionSmoothing: {
        durationMs: 100,
        maxMagnitude: 10,
        apply(target, context) {
          target.x +=
            (context.previousPresentedState.x - context.initialTargetState.x) *
            context.remainingAlpha;
          return target;
        }
      }
    });

    prediction.predict({ sequence: 1, input: { velocity: 100 }, timestamp: 50 });
    expect(prediction.present({ deltaMs: 20, timestamp: 70 }).x).toBe(2);

    prediction.reconcile({
      authoritativeState: { x: 0, velocity: 100 },
      acknowledgedSequence: 1,
      timestamp: 70
    });

    expect(prediction.state()).toEqual({ x: 0, velocity: 100 });
    expect(prediction.present({ deltaMs: 10, timestamp: 80 }).x).toBeCloseTo(1.8);

    prediction.predict({ sequence: 2, input: { velocity: 100 }, timestamp: 100 });
    expect(prediction.present({ deltaMs: 30, timestamp: 110 }).x).toBeCloseTo(2.2);
    expect(prediction.present({ deltaMs: 60, timestamp: 170 }).x).toBeCloseTo(5);
    expect(prediction.state()).toEqual({ x: 5, velocity: 100 });
    expect(prediction.diagnostics()).toMatchObject({
      corrections: 1,
      smoothedCorrections: 1,
      correctionSmoothingActive: false,
      correctionSmoothingElapsedMs: 100
    });

    prediction.reconcile({
      authoritativeState: { x: -100, velocity: 100 },
      acknowledgedSequence: 2,
      timestamp: 170
    });

    expect(prediction.present({ deltaMs: 10, timestamp: 180 }).x).toBeCloseTo(-100);
    expect(prediction.diagnostics()).toMatchObject({
      corrections: 2,
      smoothedCorrections: 1,
      correctionSmoothingActive: false,
      correctionSmoothingElapsedMs: 0
    });
  });

  it("rejects stale input and bounds the pending input queue", () => {
    const prediction = createMultiplayerPredictionBuffer<number, number>({
      initialState: 0,
      maxInputs: 2,
      cloneState(state) {
        return state;
      },
      applyInput(state, input) {
        return state + input;
      }
    });

    expect(prediction.predict({ sequence: 1, input: 1 }).accepted).toBe(true);
    expect(prediction.predict({ sequence: 2, input: 1 }).accepted).toBe(true);
    expect(prediction.predict({ sequence: 2, input: 1 })).toMatchObject({
      accepted: false,
      reason: "stale-sequence"
    });
    expect(prediction.predict({ sequence: 3, input: 1 }).accepted).toBe(true);

    expect(prediction.pendingInputs().map((frame) => frame.sequence)).toEqual([2, 3]);
    expect(prediction.diagnostics()).toMatchObject({
      predictedInputs: 3,
      rejectedInputs: 1,
      droppedInputs: 1,
      pendingInputs: 2,
      lastRejectedReason: "stale-sequence"
    });
  });
});

describe("peer/player binding utility", () => {
  it("binds peers to unique player display names and cleans up leave state", () => {
    const store = createMultiplayerPeerPlayerBindingStore({
      displayNameFallback(_peer, index) {
        return `Player ${index}`;
      }
    });

    const alpha = store.bindPeer(peer("peer-a", { playerId: "player-a", displayName: " Scout " }));
    const bravo = store.bindPeer(peer("peer-b", { playerId: "player-b", displayName: "Scout" }));
    const charlie = store.bindPeer(peer("peer-c", { playerId: "player-c", displayName: "   " }));

    expect(alpha).toMatchObject({ playerId: "player-a", displayName: "Scout" });
    expect(bravo).toMatchObject({ playerId: "player-b", displayName: "Scout 2" });
    expect(charlie).toMatchObject({ playerId: "player-c", displayName: "Player 3" });
    expect(store.playerIdForPeer("peer-b")).toBe("player-b");
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual([
      "player-a",
      "player-b",
      "player-c"
    ]);

    const left = store.markPeerLeft("peer-b", {
      status: "disconnected",
      reason: "tab closed"
    });

    expect(left).toMatchObject({
      playerId: "player-b",
      status: "disconnected",
      reason: "tab closed"
    });
    expect(store.playerIdForPeer("peer-b")).toBeUndefined();
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual([
      "player-a",
      "player-c"
    ]);

    const restored = store.bindPeer(
      peer("peer-d", { playerId: "player-b", displayName: "Scout" }),
      { slot: "blue" }
    );
    expect(restored).toMatchObject({
      peerId: "peer-d",
      playerId: "player-b",
      displayName: "Scout 2",
      status: "active",
      slot: "blue"
    });

    const removed = store.markPeerLeft("peer-c", { remove: true });
    expect(removed).toMatchObject({ playerId: "player-c", status: "left" });
    expect(store.bindings().map((binding) => binding.playerId)).toEqual(["player-a", "player-b"]);
  });

  it("supports spectator bindings and closes a binding set", () => {
    const store = createMultiplayerPeerPlayerBindingStore();

    store.bindPeer(peer("peer-a", { playerId: "player-a", role: "host" }));
    store.bindPeer(peer("peer-s", { playerId: "spectator-a", role: "spectator" }));
    store.bindPeer(peer("peer-late", { playerId: "player-late" }), {
      status: "next-round"
    });

    expect(store.bindings()).toEqual([
      expect.objectContaining({ playerId: "player-a", status: "active" }),
      expect.objectContaining({ playerId: "spectator-a", status: "spectator" }),
      expect.objectContaining({ playerId: "player-late", status: "next-round" })
    ]);
    expect(store.activeBindings().map((binding) => binding.playerId)).toEqual(["player-a"]);

    const closed = store.close("room closed");
    expect(closed).toEqual([
      expect.objectContaining({ playerId: "player-a", status: "closed", reason: "room closed" }),
      expect.objectContaining({
        playerId: "spectator-a",
        status: "closed",
        reason: "room closed"
      }),
      expect.objectContaining({
        playerId: "player-late",
        status: "closed",
        reason: "room closed"
      })
    ]);
    expect(store.activeBindings()).toEqual([]);
    expect(() => store.bindPeer(peer("peer-b"))).toThrowErrorMatchingInlineSnapshot(
      `[GameError: Peer/player binding store is closed.]`
    );
  });

  it("normalizes and de-duplicates display names", () => {
    expect(normalizeMultiplayerDisplayName("  Alpha   Bravo  ", "Fallback")).toBe("Alpha Bravo");
    expect(normalizeMultiplayerDisplayName("   ", "Fallback")).toBe("Fallback");
    expect(createUniqueMultiplayerDisplayName("Scout", ["Scout", "Scout 2"])).toBe("Scout 3");
  });

  it("resolves configurable participant lifecycle policy with app-owned context", () => {
    const store = createMultiplayerPeerPlayerBindingStore();
    const activePeer = peer("peer-a", { playerId: "player-a" });
    const activeBinding = store.bindPeer(activePeer);
    const disconnectedBinding = store.markPeerLeft("peer-a", {
      status: "disconnected"
    });
    expect(disconnectedBinding).toBeDefined();

    const policy = createMultiplayerParticipantPolicy<{
      phase: "lobby" | "running";
      hasCapacity: boolean;
    }>({
      join: ({ context }) => (context.hasCapacity ? "active" : "reject"),
      lateJoin: "next-round",
      leave: "remove",
      disconnect: ({ context }) => (context.phase === "lobby" ? "remove" : "disconnected"),
      reconnect: "restore",
      boundary: ({ binding }) => (binding.status === "disconnected" ? "remove" : "retain")
    });
    const lobbyContext = { phase: "lobby" as const, hasCapacity: true };
    const runningContext = { phase: "running" as const, hasCapacity: true };

    expect(policy.join({ peer: activePeer, context: lobbyContext })).toBe("active");
    expect(
      policy.join({
        peer: activePeer,
        context: { phase: "lobby", hasCapacity: false }
      })
    ).toBe("reject");
    expect(policy.lateJoin({ peer: activePeer, context: runningContext })).toBe("next-round");
    expect(
      policy.leave({ peerId: activePeer.id, binding: activeBinding, context: runningContext })
    ).toBe("remove");
    expect(
      policy.disconnect({ peerId: activePeer.id, binding: activeBinding, context: lobbyContext })
    ).toBe("remove");
    expect(
      policy.disconnect({ peerId: activePeer.id, binding: activeBinding, context: runningContext })
    ).toBe("disconnected");
    expect(
      policy.reconnect({ peer: activePeer, binding: activeBinding, context: runningContext })
    ).toBe("restore");
    expect(
      policy.boundary({
        binding: disconnectedBinding as NonNullable<typeof disconnectedBinding>,
        context: lobbyContext
      })
    ).toBe("remove");
  });
});

describe("createSnapshotBuffer", () => {
  it("samples ordered authoritative snapshots with render delay diagnostics", () => {
    type Snapshot = {
      tick: number;
      position: { x: number; y: number };
    };
    const buffer = createSnapshotBuffer<Snapshot>({
      interpolationDelayMs: 100
    });

    expect(buffer.sample(1000)).toMatchObject({
      status: "empty",
      bufferLength: 0
    });

    buffer.push({
      snapshot: { tick: 3, position: { x: 100, y: 0 } },
      serverTime: 1100
    });
    buffer.push({
      snapshot: { tick: 1, position: { x: 0, y: 0 } },
      serverTime: 1000
    });
    buffer.push({
      snapshot: { tick: 2, position: { x: 50, y: 0 } },
      serverTime: 1050
    });

    const sample = buffer.sample(1125);

    expect(sample).toMatchObject({
      status: "interpolated",
      sampleTime: 1025,
      delayMs: 100,
      bufferLength: 3,
      snapshotAgeMs: 75
    });
    expect(sample.previous?.snapshot.tick).toBe(1);
    expect(sample.next?.snapshot.tick).toBe(2);
    expect(sample.alpha).toBeCloseTo(0.5);
    expect(buffer.diagnostics()).toMatchObject({
      bufferLength: 3,
      acceptedSnapshots: 3,
      lastSampleStatus: "interpolated",
      lastSampleAgeMs: 75
    });
  });

  it("tracks duplicate, stale, dropped and reset buffer diagnostics", () => {
    const buffer = createSnapshotBuffer<{ x: number }>({
      maxSnapshots: 2,
      maxAgeMs: 50
    });

    expect(buffer.push({ snapshot: { x: 1 }, time: 100 })).toEqual({
      accepted: true,
      time: 100
    });
    expect(buffer.push({ snapshot: { x: 2 }, time: 100 })).toEqual({
      accepted: true,
      reason: "duplicate",
      time: 100
    });
    buffer.push({ snapshot: { x: 3 }, time: 140 });
    buffer.push({ snapshot: { x: 4 }, time: 200 });
    expect(buffer.push({ snapshot: { x: 5 }, time: 100 })).toEqual({
      accepted: false,
      reason: "stale",
      time: 100
    });

    expect(buffer.frames().map((frame) => frame.time)).toEqual([200]);
    expect(buffer.diagnostics()).toMatchObject({
      acceptedSnapshots: 3,
      duplicateSnapshots: 1,
      droppedSnapshots: 2,
      staleSnapshots: 1,
      bufferLength: 1
    });

    buffer.reset();

    expect(buffer.frames()).toEqual([]);
    expect(buffer.diagnostics()).toMatchObject({
      bufferLength: 0,
      resets: 1
    });
  });

  it("falls back to stable buffer defaults for invalid numeric options", () => {
    const buffer = createSnapshotBuffer<{ x: number }>({
      interpolationDelayMs: Number.NaN,
      maxSnapshots: Number.NaN,
      maxAgeMs: Number.NaN
    });

    buffer.push({ snapshot: { x: 1 }, time: 0 });
    buffer.push({ snapshot: { x: 2 }, time: 10 });

    expect(buffer.frames().map((frame) => frame.time)).toEqual([0, 10]);
    expect(buffer.sample(110)).toMatchObject({
      delayMs: 100,
      sampleTime: 10,
      status: "exact"
    });
  });

  it("paces snapshot playback behind the latest authoritative timeline", () => {
    type Snapshot = {
      tick: number;
      x: number;
    };
    const playback = createSnapshotPlayback<Snapshot>({
      interpolationDelayMs: 100,
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });

    playback.present({ snapshot: { tick: 0, x: 0 } }, 0);
    playback.present({ snapshot: { tick: 1, x: 50 } }, 50);
    playback.present({ snapshot: { tick: 2, x: 100 } }, 50);
    const sample = playback.present({ snapshot: { tick: 3, x: 150 } }, 25);

    expect(sample.status).toBe("interpolated");
    expect(sample.previous?.snapshot.tick).toBe(0);
    expect(sample.next?.snapshot.tick).toBe(1);
    expect(sample.alpha).toBeCloseTo(0.5);
    expect(sample.clampedToLatest).toBe(false);
    expect(playback.diagnostics()).toMatchObject({
      bufferLength: 4,
      framesPresented: 4,
      frameDeltaMs: 25,
      lastSampleStatus: "interpolated"
    });
  });

  it("clamps snapshot playback when render frames outrun snapshot delivery", () => {
    const playback = createSnapshotPlayback<{ tick: number; x: number }>({
      interpolationDelayMs: 100,
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });
    const latest = { tick: 1, x: 50 };

    playback.present({ snapshot: { tick: 0, x: 0 } }, 0);
    let sample = playback.present({ snapshot: latest }, 50);
    for (let frame = 0; frame < 12; frame += 1) {
      sample = playback.advance(50);
    }

    expect(sample.status).toBe("exact");
    expect(sample.sampleTime).toBe(50);
    expect(sample.clampedToLatest).toBe(true);
    expect(playback.diagnostics()).toMatchObject({
      clampedFrames: expect.any(Number),
      renderTime: 150,
      latestSnapshotTime: 50,
      lastSampleStatus: "exact"
    });
    expect(playback.diagnostics().clampedFrames).toBeGreaterThan(0);
  });

  it("adapts interpolation delay to snapshot arrival jitter within bounds", () => {
    const playback = createSnapshotPlayback<{ tick: number }>({
      interpolationDelayMs: 50,
      adaptiveDelay: {
        minDelayMs: 50,
        maxDelayMs: 150,
        jitterMultiplier: 2,
        jitterSmoothing: 1,
        riseRate: 1,
        fallRate: 1
      },
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });

    playback.present({ snapshot: { tick: 0 } }, 0);
    playback.present({ snapshot: { tick: 1 } }, 50);
    expect(playback.diagnostics()).toMatchObject({
      adaptiveDelayEnabled: true,
      interpolationDelayMs: 50,
      targetDelayMs: 50,
      estimatedJitterMs: 0
    });

    playback.present({ snapshot: { tick: 1 } }, 50);
    playback.present({ snapshot: { tick: 2 } }, 100);
    expect(playback.diagnostics()).toMatchObject({
      interpolationDelayMs: 150,
      targetDelayMs: 150,
      estimatedJitterMs: 100
    });

    playback.present({ snapshot: { tick: 3 } }, 50);
    expect(playback.diagnostics()).toMatchObject({
      interpolationDelayMs: 50,
      targetDelayMs: 50,
      estimatedJitterMs: 0
    });
  });

  it("reports snapshot playback frame rate from presented deltas", () => {
    const playback = createSnapshotPlayback<{ tick: number }>({
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });

    for (let frame = 0; frame < 10; frame += 1) {
      playback.present({ snapshot: { tick: 0 } }, 100);
    }

    expect(playback.diagnostics()).toMatchObject({
      frameRate: 10,
      frameDeltaMs: 100,
      framesPresented: 10
    });
  });

  it("projects declared NetworkVector2 tracks into presented values", () => {
    type Snapshot = {
      tick: number;
      players: Array<{
        id: string;
        position: NetworkVector2;
      }>;
    };
    const playback = createSnapshotPlayback<Snapshot>({
      interpolationDelayMs: 0,
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });
    const tracks = [
      defineSnapshotVector2Track<Snapshot>({
        snapDistance: 1000,
        select(snapshot) {
          return snapshot.players.map((player) => ({
            key: `player:${player.id}:position`,
            value: player.position
          }));
        }
      })
    ];

    playback.present(
      {
        snapshot: {
          tick: 0,
          players: [{ id: "runner", position: { x: 0, y: 10 } }]
        }
      },
      0
    );
    const sample = playback.present(
      {
        snapshot: {
          tick: 1,
          players: [{ id: "runner", position: { x: 50, y: 30 } }]
        }
      },
      25
    );
    const presented = presentSnapshotTracks(sample, tracks);
    const position = presented.vector2("player:runner:position", { x: -1, y: -1 });

    expect(position).toEqual({ x: 25, y: 20 });
    position.x = 999;
    expect(presented.vector2("player:runner:position", { x: -1, y: -1 })).toEqual({
      x: 25,
      y: 20
    });
  });

  it("reuses projector state and writes presented vectors into caller targets", () => {
    type Snapshot = {
      tick: number;
      entities: Array<{
        id: number;
        position: NetworkVector2;
      }>;
    };
    const playback = createSnapshotPlayback<Snapshot>({
      interpolationDelayMs: 0,
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });
    let selectIntoCalls = 0;
    const projector = createSnapshotPresentationProjector<Snapshot>([
      defineSnapshotVector2Track<Snapshot>({
        selectInto(snapshot, writer) {
          selectIntoCalls += 1;
          for (const entity of snapshot.entities) {
            writer.add(entity.id, entity.position);
          }
        }
      })
    ]);

    playback.present(
      {
        snapshot: {
          tick: 0,
          entities: [{ id: 1, position: { x: 0, y: 0 } }]
        }
      },
      0
    );
    const firstSample = playback.present(
      {
        snapshot: {
          tick: 1,
          entities: [{ id: 1, position: { x: 10, y: 20 } }]
        }
      },
      25
    );
    const firstPresented = projector.present(firstSample);
    const storedValue = firstPresented.values.get(1);
    const target = { x: 0, y: 0 };

    expect(firstPresented.vector2Into(1, target, { x: -1, y: -1 })).toBe(target);
    expect(target).toEqual({ x: 5, y: 10 });
    expect(selectIntoCalls).toBe(2);

    const secondSample = playback.present(
      {
        snapshot: {
          tick: 2,
          entities: [{ id: 1, position: { x: 20, y: 40 } }]
        }
      },
      25
    );
    const secondPresented = projector.present(secondSample);

    expect(secondPresented).toBe(firstPresented);
    expect(secondPresented.values.get(1)).toBe(storedValue);
    expect(secondPresented.vector2(1, { x: -1, y: -1 })).toEqual({ x: 10, y: 20 });
  });

  it("snaps declared vector tracks beyond their snap distance", () => {
    type Snapshot = {
      tick: number;
      position: NetworkVector2;
    };
    const playback = createSnapshotPlayback<Snapshot>({
      interpolationDelayMs: 0,
      readTime(entry) {
        return entry.snapshot.tick * 50;
      }
    });
    const tracks = [
      defineSnapshotVector2Track<Snapshot>({
        snapDistance: 32,
        select(snapshot) {
          return [
            {
              key: "avatar:position",
              value: snapshot.position
            }
          ];
        }
      })
    ];

    playback.present({ snapshot: { tick: 0, position: { x: 0, y: 0 } } }, 0);
    const sample = playback.present({ snapshot: { tick: 1, position: { x: 400, y: 0 } } }, 25);

    expect(
      presentSnapshotTracks(sample, tracks).vector2("avatar:position", { x: -1, y: -1 })
    ).toEqual({ x: 400, y: 0 });
  });

  it("provides typed interpolation primitives without owning snapshot shape", () => {
    const scalar: NetworkScalar = interpolateNumber(10, 20, 0.25);
    expect(scalar).toBe(12.5);
    expect(interpolateVector2({ x: 0, y: 10 }, { x: 20, y: 30 }, 0.5)).toEqual({
      x: 10,
      y: 20
    });
    expect(interpolateVector3({ x: 0, y: 10, z: 20 }, { x: 30, y: 40, z: 50 }, 0.5)).toEqual({
      x: 15,
      y: 25,
      z: 35
    });
    const angle: NetworkAngleRadians = interpolateAngleRadians(0, Math.PI * 1.5, 0.5);
    expect(angle).toBeCloseTo(-Math.PI / 4);
    expect(stepValue("lobby", "running", 0.49, 0.5)).toBe("lobby");
    expect(stepValue("lobby", "running", 0.5, 0.5)).toBe("running");

    const halfTurn = interpolateQuaternion(
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 1, w: 0 },
      0.5
    );
    expect(halfTurn.z).toBeCloseTo(Math.SQRT1_2);
    expect(halfTurn.w).toBeCloseTo(Math.SQRT1_2);

    const transform2: NetworkTransform2 = {
      position: { x: 10, y: 20 },
      rotation: angle,
      scale: { x: 1, y: 1 }
    };
    const transform3: NetworkTransform3 = {
      position: { x: 15, y: 25, z: 35 },
      rotation: halfTurn,
      scale: { x: 1, y: 1, z: 1 }
    };
    expect(transform2.position).toEqual({ x: 10, y: 20 });
    expect(transform3.position).toEqual({ x: 15, y: 25, z: 35 });
  });
});

describe("createMultiplayerBridgeModule", () => {
  it("queues commands until the game system tick", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const eventBus = createEventBus({ clock: () => 10 });
    const systems: Array<{ id: string; update(): void }> = [];
    const handled: MultiplayerMessageEnvelope[] = [];
    const events: string[] = [];
    eventBus.onAny((event) => events.push(event.type));

    const module = createMultiplayerBridgeModule({
      runtime,
      handleCommand({ message }) {
        handled.push(message);
      }
    });

    module.install({
      eventBus,
      systems: {
        register(system) {
          systems.push(system);
        }
      }
    });
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });

    fake.emit({
      id: "command-1",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "client",
      timestamp: 0,
      payload: { action: "move" }
    });

    expect(handled).toEqual([]);
    systems[0]?.update();
    expect(handled.map((message) => message.id)).toEqual(["command-1"]);
    expect(events).toEqual(["multiplayer.command.accepted"]);
  });

  it("emits rejected command facts when authority denies a command", async () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const eventBus = createEventBus({ clock: () => 10 });
    const systems: Array<{ id: string; update(): void }> = [];
    const events: unknown[] = [];
    eventBus.on("multiplayer.command.rejected", (event) => events.push(event.payload));

    const module = createMultiplayerBridgeModule({
      runtime,
      authority() {
        return { allowed: false, code: "not_authorized", reason: "client cannot act" };
      },
      handleCommand() {
        throw new Error("should not run rejected command");
      }
    });

    module.install({
      eventBus,
      systems: {
        register(system) {
          systems.push(system);
        }
      }
    });
    await runtime.createSession({
      id: "session-1",
      localPeer: { id: "host" }
    });

    fake.emit({
      id: "command-1",
      sessionId: "session-1",
      channel: "reliable",
      kind: "game.command",
      sourcePeerId: "client",
      timestamp: 0,
      payload: { action: "move" }
    });
    systems[0]?.update();

    expect(events).toEqual([
      {
        messageId: "command-1",
        peerId: "client",
        code: "not_authorized",
        reason: "client cannot act"
      }
    ]);
  });

  it("runs snapshot presentation playback on the game system tick", () => {
    const fake = createFakeBackend();
    const runtime = createMultiplayerRuntime({
      id: "runtime",
      backend: fake.backend
    });
    const eventBus = createEventBus({ clock: () => 10 });
    const systems: Array<{
      id: string;
      update(ctx?: { delta?: number; elapsed?: number; tick?: number }): void;
    }> = [];
    let latestSnapshot: { tick: number; position: NetworkVector2 } | undefined = {
      tick: 0,
      position: { x: 0, y: 0 }
    };
    const applied: Array<{
      status: string;
      tick: number | undefined;
      position: NetworkVector2;
    }> = [];

    const module = createMultiplayerBridgeModule({
      runtime,
      presentation: {
        interpolationDelayMs: 50,
        readTime(entry) {
          return entry.snapshot.tick * 50;
        },
        tracks: [
          defineSnapshotVector2Track<{ tick: number; position: NetworkVector2 }>({
            selectInto(snapshot, writer) {
              writer.add("avatar:position", snapshot.position);
            }
          })
        ],
        readSnapshot() {
          return latestSnapshot === undefined
            ? undefined
            : {
                snapshot: latestSnapshot,
                tick: latestSnapshot.tick
              };
        },
        applySample({ sample, presented }) {
          applied.push({
            status: sample.status,
            tick: sample.next?.snapshot.tick,
            position: presented.vector2("avatar:position", { x: -1, y: -1 })
          });
        }
      }
    });

    module.install({
      eventBus,
      systems: {
        register(system) {
          systems.push(system);
        }
      }
    });

    expect(systems.map((system) => system.id)).toEqual(["gamekit.multiplayer.bridge.presentation"]);

    systems[0]?.update({ delta: 0, elapsed: 0, tick: 1 });
    latestSnapshot = { tick: 1, position: { x: 50, y: 0 } };
    systems[0]?.update({ delta: 50, elapsed: 50, tick: 2 });
    latestSnapshot = { tick: 2, position: { x: 100, y: 0 } };
    systems[0]?.update({ delta: 50, elapsed: 100, tick: 3 });
    latestSnapshot = undefined;
    systems[0]?.update({ delta: 50, elapsed: 150, tick: 4 });

    expect(applied).toEqual([
      { status: "before-first", tick: 0, position: { x: 0, y: 0 } },
      { status: "exact", tick: 0, position: { x: 0, y: 0 } },
      { status: "exact", tick: 1, position: { x: 50, y: 0 } },
      { status: "exact", tick: 2, position: { x: 100, y: 0 } }
    ]);
  });
});

type ActionPayload = {
  type: "start";
};

type InputPayload = {
  sequence: number;
  dx: number;
};

type SnapshotPayload = {
  started: boolean;
  x: number;
  tick: number;
};

type FakeBackendHarness = {
  backend: MultiplayerBackendAdapter;
  sent: MultiplayerMessageEnvelope[];
  dropSession(): void;
  emit(message: MultiplayerMessageEnvelope): void;
};

function createFakeBackend(): FakeBackendHarness {
  const listeners = new Set<MultiplayerBackendListener>();
  const sent: MultiplayerMessageEnvelope[] = [];
  let session: MultiplayerSession | undefined;
  const connection: MultiplayerBackendConnection = {
    async createSession(request = {}) {
      const localPeer = {
        id: request.localPeer?.id ?? "host",
        role: request.localPeer?.role ?? "host",
        status: "connected" as const
      };
      session = {
        id: request.id ?? "session",
        kind: request.kind ?? "local",
        authority: request.authority ?? "host-authoritative",
        status: "open",
        peers: [localPeer]
      };
      return session;
    },
    async joinSession() {
      throw new Error("not implemented by fake backend");
    },
    async leaveSession() {
      session = undefined;
    },
    async send(message) {
      sent.push(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    },
    snapshot() {
      return {
        phase: session ? ("in-session" as const) : ("connected" as const),
        ...(session ? { localPeer: session.peers[0], session } : {}),
        peers: session?.peers ?? [],
        sent: sent.length,
        received: 0
      };
    }
  };

  return {
    sent,
    backend: {
      id: "fake",
      kind: "fake",
      capabilities: {
        channels: [{ id: "reliable", reliability: "reliable", ordering: "ordered" }]
      },
      async connect() {
        return connection;
      },
      snapshot() {
        return {
          id: "fake",
          kind: "fake",
          capabilities: this.capabilities
        };
      }
    },
    dropSession() {
      session = undefined;
    },
    emit(message) {
      for (const listener of Array.from(listeners)) {
        listener(message);
      }
    }
  };
}

function readAction(payload: unknown): ActionPayload | undefined {
  return isRecord(payload) && payload.type === "start" ? { type: "start" } : undefined;
}

function readInput(payload: unknown): InputPayload | undefined {
  if (
    !isRecord(payload) ||
    typeof payload.sequence !== "number" ||
    typeof payload.dx !== "number"
  ) {
    return undefined;
  }

  return {
    sequence: payload.sequence,
    dx: payload.dx
  };
}

function messageFrom(
  sourcePeerId: string,
  kind: string,
  payload: unknown,
  options: { tick?: number } = {}
): MultiplayerMessageEnvelope {
  return {
    id: `${sourcePeerId}.${kind}.${Math.random()}`,
    sessionId: "session-1",
    channel: "reliable",
    kind,
    sourcePeerId,
    timestamp: 100,
    ...(options.tick === undefined ? {} : { tick: options.tick }),
    payload
  };
}

function peer(
  id: string,
  options: Partial<Omit<MultiplayerPeer, "id" | "status">> & {
    status?: MultiplayerPeer["status"];
  } = {}
): MultiplayerPeer {
  return {
    id,
    status: options.status ?? "connected",
    ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.playerId === undefined ? {} : { playerId: options.playerId }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 500) {
      throw new Error("Timed out waiting for multiplayer-core condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
