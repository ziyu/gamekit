import { acceptsAuthorityMessage, cloneAuthorityBinding } from "./authority-binding";
import type {
  MultiplayerAuthorityBinding,
  MultiplayerAuthorityBindingStore
} from "./authority-types";
import {
  createMultiplayerPredictionBuffer,
  type MultiplayerPredictionBuffer,
  type MultiplayerPredictionBufferOptions,
  type MultiplayerPredictionDiagnostics,
  type MultiplayerPredictionFrame
} from "./prediction";
import {
  createSnapshotPlayback,
  createSnapshotPresentationProjector,
  type PresentedSnapshotTracks,
  type SnapshotBufferEntry,
  type SnapshotPlaybackDiagnostics,
  type SnapshotPlaybackOptions,
  type SnapshotPlaybackSample,
  type SnapshotPresentationTrack
} from "./presentation";
import type {
  MultiplayerMessageEnvelope,
  MultiplayerOutgoingMessage,
  MultiplayerRuntime
} from "./types";

export type MultiplayerClientReplicationSystemFrame = {
  delta?: number;
  elapsed?: number;
  tick?: number;
};

export type MultiplayerClientReplicationAuthorityOptions = {
  binding?: MultiplayerAuthorityBindingStore;
  resolveAuthorityPeerId?(runtime: MultiplayerRuntime): string | undefined;
};

export type MultiplayerClientReplicationSnapshotContext<TSnapshot, TInstallContext> = {
  installContext: TInstallContext;
  runtime: MultiplayerRuntime;
  binding: MultiplayerAuthorityBinding;
  message: MultiplayerMessageEnvelope;
  snapshot: TSnapshot;
};

export type MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext> = {
  installContext: TInstallContext;
  runtime: MultiplayerRuntime;
  binding: MultiplayerAuthorityBinding;
  snapshot: TSnapshot;
  frame: MultiplayerClientReplicationSystemFrame;
};

export type MultiplayerClientPredictionEncodeContext<TSnapshot, TInput, TInstallContext> =
  MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext> & {
    input: TInput;
    predictionFrame: MultiplayerPredictionFrame<TInput>;
  };

export type MultiplayerClientPredictionOptions<TSnapshot, TInput, TState, TInstallContext> = {
  buffer: Omit<MultiplayerPredictionBufferOptions<TState, TInput>, "initialState">;
  inputKind?: string;
  inputChannel?: string;
  inputRateHz?: number;
  maxCatchUpSteps?: number;
  maxInFlightSends?: number;
  readInput(
    ctx: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>
  ): TInput | undefined;
  encodeInput(
    ctx: MultiplayerClientPredictionEncodeContext<TSnapshot, TInput, TInstallContext>
  ): unknown;
  readAuthoritativeState(
    ctx: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>
  ): TState | undefined;
  readAcknowledgedSequence?(
    ctx: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>
  ): number | undefined;
  active?(ctx: MultiplayerClientPredictionReadContext<TSnapshot, TInstallContext>): boolean;
  onSendError?(error: unknown): void;
};

export type MultiplayerClientReplicationFrameContext<TSnapshot, TState, TInstallContext> = {
  installContext: TInstallContext;
  runtime: MultiplayerRuntime;
  binding: MultiplayerAuthorityBinding;
  frame: MultiplayerClientReplicationSystemFrame;
  snapshot: TSnapshot;
  sample: SnapshotPlaybackSample<TSnapshot>;
  presented: PresentedSnapshotTracks;
  predictedState?: TState;
};

export type MultiplayerClientReplicationOptions<
  TSnapshot,
  TInput = never,
  TState = never,
  TInstallContext = unknown
> = {
  id?: string;
  snapshotKind?: string;
  authority?: MultiplayerClientReplicationAuthorityOptions;
  playback?: SnapshotPlaybackOptions<TSnapshot>;
  tracks?: Iterable<SnapshotPresentationTrack<TSnapshot>>;
  readSnapshot(payload: unknown, message: MultiplayerMessageEnvelope): TSnapshot | undefined;
  toBufferEntry?(
    ctx: MultiplayerClientReplicationSnapshotContext<TSnapshot, TInstallContext>
  ): SnapshotBufferEntry<TSnapshot>;
  applyAuthoritative?(
    ctx: MultiplayerClientReplicationSnapshotContext<TSnapshot, TInstallContext>
  ): void;
  prediction?: MultiplayerClientPredictionOptions<TSnapshot, TInput, TState, TInstallContext>;
  applyFrame(
    ctx: MultiplayerClientReplicationFrameContext<TSnapshot, TState, TInstallContext>
  ): void;
  expose?(view: MultiplayerClientReplicationView<TSnapshot, TState> | undefined): void;
};

export type MultiplayerClientReplicationDiagnostics = {
  binding?: MultiplayerAuthorityBinding;
  receivedSnapshots: number;
  appliedSnapshots: number;
  rejectedSnapshots: number;
  coalescedSnapshots: number;
  presentedFrames: number;
  bindingResets: number;
  sentInputs: number;
  failedInputs: number;
  coalescedInputs: number;
  inFlightInputs: number;
  lastAppliedTick?: number;
  lastRejectedCode?: string;
  playback: SnapshotPlaybackDiagnostics;
  prediction?: MultiplayerPredictionDiagnostics;
};

export type MultiplayerClientReplicationView<TSnapshot, TState> = {
  binding(): MultiplayerAuthorityBinding | undefined;
  authoritativeSnapshot(): TSnapshot | undefined;
  predictedState(): TState | undefined;
  diagnostics(): MultiplayerClientReplicationDiagnostics;
};

export type MultiplayerClientReplicationRuntime<TSnapshot, TState> =
  MultiplayerClientReplicationView<TSnapshot, TState> & {
    update(frame?: MultiplayerClientReplicationSystemFrame): void;
    dispose(): void;
  };

export type CreateMultiplayerClientReplicationOptions<TSnapshot, TInput, TState, TInstallContext> =
  {
    runtime: MultiplayerRuntime;
    installContext: TInstallContext;
    options: MultiplayerClientReplicationOptions<TSnapshot, TInput, TState, TInstallContext>;
  };

type PendingSnapshot<TSnapshot> = {
  bindingKey: string;
  binding: MultiplayerAuthorityBinding;
  message: MultiplayerMessageEnvelope;
  snapshot: TSnapshot;
  entry: SnapshotBufferEntry<TSnapshot>;
};

const DEFAULT_SNAPSHOT_KIND = "game.snapshot";
const DEFAULT_INPUT_KIND = "game.input";
const DEFAULT_INPUT_CHANNEL = "unreliable";
const DEFAULT_INPUT_RATE_HZ = 20;
const DEFAULT_MAX_CATCH_UP_STEPS = 2;
const DEFAULT_MAX_IN_FLIGHT_SENDS = 4;

export function createMultiplayerClientReplication<
  TSnapshot,
  TInput = never,
  TState = never,
  TInstallContext = unknown
>(
  input: CreateMultiplayerClientReplicationOptions<TSnapshot, TInput, TState, TInstallContext>
): MultiplayerClientReplicationRuntime<TSnapshot, TState> {
  const { runtime, installContext, options } = input;
  const snapshotKind = options.snapshotKind ?? DEFAULT_SNAPSHOT_KIND;
  const playback = createSnapshotPlayback<TSnapshot>(options.playback);
  const projector = createSnapshotPresentationProjector<TSnapshot>(options.tracks ?? []);
  const predictionOptions = options.prediction;
  const inputRateHz = normalizePositiveNumber(
    predictionOptions?.inputRateHz,
    DEFAULT_INPUT_RATE_HZ
  );
  const inputIntervalMs = 1000 / inputRateHz;
  const maxCatchUpSteps = normalizePositiveInteger(
    predictionOptions?.maxCatchUpSteps,
    DEFAULT_MAX_CATCH_UP_STEPS
  );
  const maxInFlightSends = normalizePositiveInteger(
    predictionOptions?.maxInFlightSends,
    DEFAULT_MAX_IN_FLIGHT_SENDS
  );
  let activeBinding: MultiplayerAuthorityBinding | undefined;
  let activeBindingKey: string | undefined;
  let pendingSnapshot: PendingSnapshot<TSnapshot> | undefined;
  let authoritativeSnapshot: TSnapshot | undefined;
  let predictionBuffer: MultiplayerPredictionBuffer<TState, TInput> | undefined;
  let predictionActive = false;
  let latestPredictedState: TState | undefined;
  let nextInputSequence = 0;
  let inputAccumulatorMs = 0;
  let inputReady = true;
  let elapsedMs = 0;
  let failedPredictionSequence: number | undefined;
  let bindingGeneration = 0;
  let disposed = false;
  const diagnostics: Omit<
    MultiplayerClientReplicationDiagnostics,
    "binding" | "playback" | "prediction"
  > = {
    receivedSnapshots: 0,
    appliedSnapshots: 0,
    rejectedSnapshots: 0,
    coalescedSnapshots: 0,
    presentedFrames: 0,
    bindingResets: 0,
    sentInputs: 0,
    failedInputs: 0,
    coalescedInputs: 0,
    inFlightInputs: 0
  };

  const unsubscribe = runtime.subscribe((message) => {
    if (disposed || message.kind !== snapshotKind) {
      return;
    }
    diagnostics.receivedSnapshots += 1;
    const binding = resolveAuthorityBinding(runtime, options.authority);
    if (binding === undefined) {
      rejectSnapshot("authority-not-bound");
      return;
    }
    const decision = acceptsAuthorityMessage(binding, message);
    if (!decision.allowed) {
      rejectSnapshot(decision.code);
      return;
    }
    const snapshot = options.readSnapshot(message.payload, message);
    if (snapshot === undefined) {
      rejectSnapshot("invalid-snapshot");
      return;
    }
    const nextBindingKey = bindingIdentity(binding);
    syncBinding(binding, nextBindingKey);
    if (pendingSnapshot !== undefined) {
      diagnostics.coalescedSnapshots += 1;
    }
    const context = { installContext, runtime, binding, message, snapshot };
    pendingSnapshot = {
      bindingKey: nextBindingKey,
      binding,
      message,
      snapshot,
      entry: options.toBufferEntry?.(context) ?? defaultBufferEntry(snapshot, message)
    };
  });

  const view: MultiplayerClientReplicationRuntime<TSnapshot, TState> = {
    update(frame = {}) {
      if (disposed) {
        return;
      }
      const deltaMs = normalizeDelta(frame.delta);
      elapsedMs = frame.elapsed === undefined ? elapsedMs + deltaMs : frame.elapsed;
      const resolvedBinding = resolveAuthorityBinding(runtime, options.authority);
      if (resolvedBinding === undefined) {
        clearBinding();
        return;
      }
      syncBinding(resolvedBinding, bindingIdentity(resolvedBinding));

      const pending = pendingSnapshot;
      pendingSnapshot = undefined;
      const sample = pending ? playback.present(pending.entry, deltaMs) : playback.advance(deltaMs);
      if (pending && pending.bindingKey === activeBindingKey) {
        if (sample.pushResult.accepted && sample.pushResult.reason !== "duplicate") {
          const incomingTick = pending.message.tick ?? pending.entry.tick;
          if (
            incomingTick !== undefined &&
            diagnostics.lastAppliedTick !== undefined &&
            incomingTick <= diagnostics.lastAppliedTick
          ) {
            rejectSnapshot("stale-snapshot");
          } else {
            applySnapshot(pending, frame);
          }
        } else if (sample.pushResult.reason === "duplicate") {
          rejectSnapshot("duplicate-snapshot");
        } else if (!sample.pushResult.accepted) {
          rejectSnapshot(sample.pushResult.reason ?? "snapshot-rejected");
        }
      }
      const snapshot = authoritativeSnapshot ?? sample.next?.snapshot ?? sample.previous?.snapshot;
      if (snapshot === undefined || activeBinding === undefined) {
        return;
      }

      advancePrediction(snapshot, frame, deltaMs);
      const presented = projector.present(sample);
      diagnostics.presentedFrames += 1;
      options.applyFrame({
        installContext,
        runtime,
        binding: activeBinding,
        frame,
        snapshot,
        sample,
        presented,
        ...(latestPredictedState === undefined ? {} : { predictedState: latestPredictedState })
      });
    },
    binding() {
      return activeBinding === undefined ? undefined : cloneAuthorityBinding(activeBinding);
    },
    authoritativeSnapshot() {
      return authoritativeSnapshot;
    },
    predictedState() {
      return latestPredictedState;
    },
    diagnostics() {
      return {
        ...(activeBinding === undefined ? {} : { binding: cloneAuthorityBinding(activeBinding) }),
        ...diagnostics,
        playback: playback.diagnostics(),
        ...(predictionBuffer === undefined ? {} : { prediction: predictionBuffer.diagnostics() })
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      pendingSnapshot = undefined;
      authoritativeSnapshot = undefined;
      predictionBuffer = undefined;
      latestPredictedState = undefined;
      failedPredictionSequence = undefined;
      bindingGeneration += 1;
      playback.reset();
      projector.reset();
      options.expose?.(undefined);
    }
  };

  options.expose?.(view);
  return view;

  function applySnapshot(
    pending: PendingSnapshot<TSnapshot>,
    frame: MultiplayerClientReplicationSystemFrame
  ): void {
    authoritativeSnapshot = pending.snapshot;
    diagnostics.appliedSnapshots += 1;
    if (pending.message.tick !== undefined && activeBinding !== undefined) {
      activeBinding = { ...activeBinding, tick: pending.message.tick };
      diagnostics.lastAppliedTick = pending.message.tick;
    }
    options.applyAuthoritative?.({
      installContext,
      runtime,
      binding: pending.binding,
      message: pending.message,
      snapshot: pending.snapshot
    });
    reconcilePrediction(pending.snapshot, frame);
  }

  function reconcilePrediction(
    snapshot: TSnapshot,
    frame: MultiplayerClientReplicationSystemFrame
  ): void {
    if (predictionOptions === undefined || activeBinding === undefined) {
      return;
    }
    const context = {
      installContext,
      runtime,
      binding: activeBinding,
      snapshot,
      frame
    };
    const authoritativeState = predictionOptions.readAuthoritativeState(context);
    const acknowledgedSequence = predictionOptions.readAcknowledgedSequence?.(context);
    if (acknowledgedSequence !== undefined) {
      nextInputSequence = Math.max(nextInputSequence, acknowledgedSequence);
    }
    predictionActive =
      authoritativeState !== undefined && (predictionOptions.active?.(context) ?? true);
    if (authoritativeState === undefined) {
      predictionBuffer = undefined;
      latestPredictedState = undefined;
      failedPredictionSequence = undefined;
      return;
    }
    if (predictionBuffer === undefined) {
      predictionBuffer = createMultiplayerPredictionBuffer({
        ...predictionOptions.buffer,
        initialState: authoritativeState
      });
      latestPredictedState = authoritativeState;
      inputReady = true;
      inputAccumulatorMs = 0;
      failedPredictionSequence = undefined;
      return;
    }
    if (
      failedPredictionSequence !== undefined &&
      (acknowledgedSequence === undefined || acknowledgedSequence < failedPredictionSequence)
    ) {
      predictionBuffer.reset(
        authoritativeState,
        acknowledgedSequence === undefined
          ? undefined
          : { lastAcknowledgedSequence: acknowledgedSequence }
      );
      latestPredictedState = authoritativeState;
      failedPredictionSequence = undefined;
      return;
    }
    failedPredictionSequence = undefined;
    predictionBuffer.reconcile({
      authoritativeState,
      ...(acknowledgedSequence === undefined ? {} : { acknowledgedSequence }),
      timestamp: frame.elapsed ?? elapsedMs
    });
  }

  function advancePrediction(
    snapshot: TSnapshot,
    frame: MultiplayerClientReplicationSystemFrame,
    deltaMs: number
  ): void {
    if (
      predictionOptions === undefined ||
      predictionBuffer === undefined ||
      activeBinding === undefined ||
      !predictionActive
    ) {
      latestPredictedState = undefined;
      return;
    }
    inputAccumulatorMs += deltaMs;
    if (inputReady) {
      inputAccumulatorMs = Math.max(inputAccumulatorMs, inputIntervalMs);
      inputReady = false;
    }
    let steps = 0;
    while (inputAccumulatorMs >= inputIntervalMs && steps < maxCatchUpSteps) {
      inputAccumulatorMs -= inputIntervalMs;
      steps += 1;
      const context = {
        installContext,
        runtime,
        binding: activeBinding,
        snapshot,
        frame
      };
      const sampledInput = predictionOptions.readInput(context);
      if (sampledInput === undefined) {
        continue;
      }
      if (diagnostics.inFlightInputs >= maxInFlightSends) {
        diagnostics.coalescedInputs += 1;
        continue;
      }
      const predictionFrame: MultiplayerPredictionFrame<TInput> = {
        sequence: ++nextInputSequence,
        input: sampledInput,
        ...(frame.tick === undefined ? {} : { tick: frame.tick }),
        timestamp: frame.elapsed ?? elapsedMs
      };
      predictionBuffer.predict(predictionFrame);
      sendInput(
        predictionOptions.encodeInput({
          ...context,
          input: sampledInput,
          predictionFrame
        }),
        predictionFrame
      );
    }
    if (steps >= maxCatchUpSteps) {
      inputAccumulatorMs = Math.min(inputAccumulatorMs, inputIntervalMs * maxCatchUpSteps);
    }
    latestPredictedState = predictionBuffer.present({
      deltaMs,
      timestamp: frame.elapsed ?? elapsedMs
    });
  }

  function sendInput(payload: unknown, frame: MultiplayerPredictionFrame<TInput>): void {
    if (predictionOptions === undefined || activeBinding?.authorityPeerId === undefined) {
      return;
    }
    diagnostics.inFlightInputs += 1;
    const sendBindingGeneration = bindingGeneration;
    const outgoing: MultiplayerOutgoingMessage = {
      channel: predictionOptions.inputChannel ?? DEFAULT_INPUT_CHANNEL,
      kind: predictionOptions.inputKind ?? DEFAULT_INPUT_KIND,
      targetPeerIds: [activeBinding.authorityPeerId],
      sequence: frame.sequence,
      payload
    };
    void runtime
      .send(outgoing)
      .then(
        () => {
          diagnostics.sentInputs += 1;
        },
        (error) => {
          diagnostics.failedInputs += 1;
          if (!disposed && bindingGeneration === sendBindingGeneration) {
            failedPredictionSequence =
              failedPredictionSequence === undefined
                ? frame.sequence
                : Math.min(failedPredictionSequence, frame.sequence);
          }
          predictionOptions.onSendError?.(error);
        }
      )
      .finally(() => {
        diagnostics.inFlightInputs = Math.max(0, diagnostics.inFlightInputs - 1);
      });
  }

  function syncBinding(binding: MultiplayerAuthorityBinding, key: string): void {
    if (key === activeBindingKey) {
      activeBinding = binding;
      return;
    }
    if (activeBindingKey !== undefined) {
      diagnostics.bindingResets += 1;
    }
    activeBinding = binding;
    activeBindingKey = key;
    bindingGeneration += 1;
    pendingSnapshot = undefined;
    authoritativeSnapshot = undefined;
    predictionBuffer = undefined;
    predictionActive = false;
    latestPredictedState = undefined;
    failedPredictionSequence = undefined;
    nextInputSequence = 0;
    inputAccumulatorMs = 0;
    inputReady = true;
    playback.reset();
    projector.reset();
  }

  function clearBinding(): void {
    if (activeBindingKey === undefined) {
      return;
    }
    diagnostics.bindingResets += 1;
    activeBinding = undefined;
    activeBindingKey = undefined;
    bindingGeneration += 1;
    pendingSnapshot = undefined;
    authoritativeSnapshot = undefined;
    predictionBuffer = undefined;
    predictionActive = false;
    latestPredictedState = undefined;
    failedPredictionSequence = undefined;
    playback.reset();
    projector.reset();
  }

  function rejectSnapshot(code: string): void {
    diagnostics.rejectedSnapshots += 1;
    diagnostics.lastRejectedCode = code;
  }
}

function resolveAuthorityBinding(
  runtime: MultiplayerRuntime,
  options: MultiplayerClientReplicationAuthorityOptions | undefined
): MultiplayerAuthorityBinding | undefined {
  if (options?.binding !== undefined) {
    return options.binding.current();
  }
  const session = runtime.session();
  if (session === undefined) {
    return undefined;
  }
  const localPeer = runtime.localPeer();
  const authorityPeerId =
    options?.resolveAuthorityPeerId?.(runtime) ??
    resolveDefaultAuthorityPeerId(runtime, session.authority);
  if (authorityPeerId === undefined) {
    return undefined;
  }
  return {
    sessionId: session.id,
    mode: session.authority,
    status: "bound",
    authorityPeerId,
    authorityEndpoint: {
      kind:
        session.authority === "local"
          ? "local"
          : session.authority === "server-authoritative"
            ? "server"
            : "peer",
      id: authorityPeerId,
      peerId: authorityPeerId
    },
    ...(localPeer?.playerId === undefined ? {} : { localPlayerId: localPeer.playerId })
  };
}

function resolveDefaultAuthorityPeerId(
  runtime: MultiplayerRuntime,
  mode: MultiplayerAuthorityBinding["mode"]
): string | undefined {
  const peers = runtime.peers();
  if (mode === "local") {
    return runtime.localPeer()?.id;
  }
  if (mode === "server-authoritative" || mode === "spectator") {
    return peers.find((peer) => peer.role === "server")?.id;
  }
  if (mode === "host-authoritative") {
    return peers.find((peer) => peer.role === "host")?.id;
  }
  return undefined;
}

function defaultBufferEntry<TSnapshot>(
  snapshot: TSnapshot,
  message: MultiplayerMessageEnvelope
): SnapshotBufferEntry<TSnapshot> {
  return {
    snapshot,
    ...(message.tick === undefined ? {} : { tick: message.tick }),
    ...(message.schemaVersion === undefined ? {} : { version: message.schemaVersion }),
    receivedAt: message.timestamp
  };
}

function bindingIdentity(binding: MultiplayerAuthorityBinding): string {
  return [
    binding.sessionId,
    binding.mode,
    binding.status,
    binding.authorityPeerId ?? "",
    binding.localPlayerId ?? "",
    binding.snapshotVersion ?? ""
  ].join("|");
}

function normalizeDelta(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, value);
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : value;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(normalizePositiveNumber(value, fallback)));
}
