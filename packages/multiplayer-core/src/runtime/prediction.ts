import {
  createMultiplayerPredictionStatePresentation,
  type MultiplayerPredictionStatePresentationOptions
} from "./prediction-state";

export type MultiplayerPredictionFrame<TInput> = {
  sequence: number;
  input: TInput;
  tick?: number;
  timestamp?: number;
};

export type MultiplayerPredictionApplyContext<TInput> = {
  sequence: number;
  input: TInput;
  replay: boolean;
  stepMs: number;
  tick?: number;
  timestamp?: number;
};

export type MultiplayerPredictionApplyInput<TState, TInput> = (
  state: TState,
  input: TInput,
  context: MultiplayerPredictionApplyContext<TInput>
) => TState;

export type MultiplayerPredictionTransition<TState, TInput> = {
  apply: MultiplayerPredictionApplyInput<TState, TInput>;
  diagnostics?(): object;
  dispose?(): void;
};

export type MultiplayerPredictionTransitionFactory<TState, TInput> =
  () => MultiplayerPredictionTransition<TState, TInput>;

export type MultiplayerPredictionMeasureCorrection<TState> = (
  previousPredicted: TState,
  nextPredicted: TState
) => number;

export type MultiplayerPredictionPresentationContext<TInput> = {
  frameDeltaMs: number;
  elapsedMs: number;
  stepMs: number;
  alpha: number;
  timestamp?: number;
  lastPredictedFrame?: MultiplayerPredictionFrame<TInput>;
};

export type MultiplayerPredictionPresentState<TState, TInput> = (
  fromState: TState,
  toState: TState,
  context: MultiplayerPredictionPresentationContext<TInput>
) => TState;

export type MultiplayerPredictionCorrectionSmoothingContext<TState> = {
  alpha: number;
  remainingAlpha: number;
  elapsedMs: number;
  durationMs: number;
  correctionMagnitude: number;
  previousPresentedState: TState;
  initialTargetState: TState;
};

export type MultiplayerPredictionApplyCorrection<TState> = (
  targetState: TState,
  context: MultiplayerPredictionCorrectionSmoothingContext<TState>
) => TState;

export type MultiplayerPredictionCorrectionSmoothingOptions<TState> = {
  durationMs: number;
  maxMagnitude?: number;
  apply: MultiplayerPredictionApplyCorrection<TState>;
};

type MultiplayerPredictionBufferBaseOptions<TState, TInput> = {
  initialState: TState;
  cloneState(state: TState): TState;
  applyInput?: MultiplayerPredictionApplyInput<TState, TInput>;
  transition?: MultiplayerPredictionTransitionFactory<TState, TInput>;
  correctionEpsilon?: number;
  predictionStepMs?: number;
  maxInputs?: number;
};

export type MultiplayerPredictionBufferOptions<TState, TInput> =
  MultiplayerPredictionBufferBaseOptions<TState, TInput> & {
    presentation?: MultiplayerPredictionStatePresentationOptions<TState>;
    /** @deprecated Prefer declarative prediction state fields for standard game integration. */
    presentState?: MultiplayerPredictionPresentState<TState, TInput>;
    /** @deprecated Prefer a declarative prediction correction measure field. */
    measureCorrection?: MultiplayerPredictionMeasureCorrection<TState>;
    /** @deprecated Prefer declarative prediction correction smoothing fields. */
    correctionSmoothing?: MultiplayerPredictionCorrectionSmoothingOptions<TState>;
  };

export type MultiplayerPredictionResetOptions = {
  lastAcknowledgedSequence?: number;
};

export type MultiplayerPredictionPresentOptions = {
  deltaMs: number;
  timestamp?: number;
};

export type MultiplayerPredictionPredictResult<TState> = {
  accepted: boolean;
  state: TState;
  pendingInputs: number;
  reason?: "invalid-sequence" | "stale-sequence";
};

export type MultiplayerPredictionReconcileOptions<TState> = {
  authoritativeState: TState;
  acknowledgedSequence?: number;
  timestamp?: number;
};

export type MultiplayerPredictionReconcileResult<TState> = {
  state: TState;
  pendingInputs: number;
  acknowledgedInputs: number;
  replayedInputs: number;
  correctionMagnitude: number;
};

export type MultiplayerPredictionDiagnostics = {
  predictedInputs: number;
  rejectedInputs: number;
  acknowledgedInputs: number;
  replayedInputs: number;
  droppedInputs: number;
  corrections: number;
  resets: number;
  presentedFrames: number;
  clampedPresentationFrames: number;
  smoothedCorrections: number;
  correctionSmoothingActive: boolean;
  correctionSmoothingElapsedMs: number;
  pendingInputs: number;
  presentationElapsedMs: number;
  presentationAlpha: number;
  lastPredictedSequence?: number;
  lastAcknowledgedSequence?: number;
  lastRejectedReason?: "invalid-sequence" | "stale-sequence";
  lastCorrectionMagnitude?: number;
  maxCorrectionMagnitude: number;
  transition?: object;
};

export type MultiplayerPredictionBuffer<TState, TInput> = {
  state(): TState;
  present(options: MultiplayerPredictionPresentOptions): TState;
  predict(frame: MultiplayerPredictionFrame<TInput>): MultiplayerPredictionPredictResult<TState>;
  reconcile(
    options: MultiplayerPredictionReconcileOptions<TState>
  ): MultiplayerPredictionReconcileResult<TState>;
  reset(state: TState, options?: MultiplayerPredictionResetOptions): void;
  pendingInputCount(): number;
  pendingInputs(): Array<MultiplayerPredictionFrame<TInput>>;
  diagnostics(): MultiplayerPredictionDiagnostics;
  dispose(): void;
};

const DEFAULT_MAX_INPUTS = 240;
const DEFAULT_CORRECTION_EPSILON = 0.001;
const DEFAULT_PREDICTION_STEP_MS = 50;

export function createMultiplayerPredictionBuffer<TState, TInput>(
  options: MultiplayerPredictionBufferOptions<TState, TInput>
): MultiplayerPredictionBuffer<TState, TInput> {
  if ((options.applyInput === undefined) === (options.transition === undefined)) {
    throw new Error("Prediction requires exactly one applyInput callback or transition.");
  }
  if (
    options.presentation !== undefined &&
    (options.presentState !== undefined ||
      options.measureCorrection !== undefined ||
      options.correctionSmoothing !== undefined)
  ) {
    throw new Error(
      "Declarative prediction presentation cannot be combined with custom presentation callbacks."
    );
  }
  const transition = options.transition?.();
  const statePresentation =
    options.presentation === undefined
      ? undefined
      : createMultiplayerPredictionStatePresentation(options.presentation);
  const applyInput = transition?.apply ?? options.applyInput!;
  const correctionSmoothing =
    statePresentation?.correction === undefined
      ? options.correctionSmoothing
      : {
          durationMs: statePresentation.correction.durationMs,
          ...(statePresentation.correction.maxMagnitude === undefined
            ? {}
            : { maxMagnitude: statePresentation.correction.maxMagnitude })
        };
  const maxInputs = Math.max(1, Math.floor(options.maxInputs ?? DEFAULT_MAX_INPUTS));
  const correctionEpsilon = normalizeNonNegativeNumber(
    options.correctionEpsilon,
    DEFAULT_CORRECTION_EPSILON
  );
  const predictionStepMs = normalizePositiveNumber(
    options.predictionStepMs,
    DEFAULT_PREDICTION_STEP_MS
  );
  const correctionSmoothingDurationMs = normalizeNonNegativeNumber(
    correctionSmoothing?.durationMs,
    0
  );
  const correctionSmoothingMaxMagnitude = normalizeNonNegativeNumber(
    correctionSmoothing?.maxMagnitude,
    Number.POSITIVE_INFINITY
  );
  const pending: Array<MultiplayerPredictionFrame<TInput>> = [];
  const diagnostics: MultiplayerPredictionDiagnostics = {
    predictedInputs: 0,
    rejectedInputs: 0,
    acknowledgedInputs: 0,
    replayedInputs: 0,
    droppedInputs: 0,
    corrections: 0,
    resets: 0,
    presentedFrames: 0,
    clampedPresentationFrames: 0,
    smoothedCorrections: 0,
    correctionSmoothingActive: false,
    correctionSmoothingElapsedMs: 0,
    pendingInputs: 0,
    presentationElapsedMs: 0,
    presentationAlpha: 0,
    maxCorrectionMagnitude: 0
  };
  let currentState = options.cloneState(options.initialState);
  let presentationFromState = options.cloneState(options.initialState);
  let pendingStart = 0;
  let lastPredictedSequence: number | undefined;
  let lastAcknowledgedSequence: number | undefined;
  let lastPredictedFrame: MultiplayerPredictionFrame<TInput> | undefined;
  let presentationElapsedMs = 0;
  let hasPresentedFrame = false;
  let correctionSmoothingPreviousPresented: TState | undefined;
  let correctionSmoothingInitialTarget: TState | undefined;
  let correctionSmoothingElapsedMs = 0;
  let correctionSmoothingMagnitude = 0;

  function pendingCount(): number {
    return pending.length - pendingStart;
  }

  function refreshPendingDiagnostics(): void {
    diagnostics.pendingInputs = pendingCount();
  }

  function compactPending(): void {
    if (pendingStart > 64 && pendingStart * 2 > pending.length) {
      pending.splice(0, pendingStart);
      pendingStart = 0;
    }
  }

  function reject(
    reason: NonNullable<MultiplayerPredictionPredictResult<TState>["reason"]>
  ): MultiplayerPredictionPredictResult<TState> {
    diagnostics.rejectedInputs += 1;
    diagnostics.lastRejectedReason = reason;
    refreshPendingDiagnostics();
    return {
      accepted: false,
      reason,
      state: currentState,
      pendingInputs: pendingCount()
    };
  }

  function applyFrame(
    state: TState,
    frame: MultiplayerPredictionFrame<TInput>,
    replay: boolean
  ): TState {
    return applyInput(state, frame.input, {
      sequence: frame.sequence,
      input: frame.input,
      replay,
      stepMs: predictionStepMs,
      ...(frame.tick === undefined ? {} : { tick: frame.tick }),
      ...(frame.timestamp === undefined ? {} : { timestamp: frame.timestamp })
    });
  }

  function measureCorrection(previousPredicted: TState, nextPredicted: TState): number {
    const measured =
      statePresentation?.measureCorrection(previousPredicted, nextPredicted) ??
      options.measureCorrection?.(previousPredicted, nextPredicted) ??
      0;
    return Number.isFinite(measured) ? Math.max(0, measured) : 0;
  }

  function recordCorrection(magnitude: number): void {
    diagnostics.lastCorrectionMagnitude = magnitude;
    diagnostics.maxCorrectionMagnitude = Math.max(diagnostics.maxCorrectionMagnitude, magnitude);
    if (magnitude > correctionEpsilon) {
      diagnostics.corrections += 1;
    }
  }

  function clearCorrectionSmoothing(resetElapsed: boolean): void {
    correctionSmoothingPreviousPresented = undefined;
    correctionSmoothingInitialTarget = undefined;
    correctionSmoothingMagnitude = 0;
    diagnostics.correctionSmoothingActive = false;
    if (resetElapsed) {
      correctionSmoothingElapsedMs = 0;
      diagnostics.correctionSmoothingElapsedMs = 0;
    }
  }

  function beginCorrectionSmoothing(
    magnitude: number,
    previousPresentedState: TState,
    initialTargetState: TState
  ): void {
    if (magnitude <= correctionEpsilon) {
      return;
    }
    if (
      correctionSmoothing === undefined ||
      correctionSmoothingDurationMs <= 0 ||
      magnitude > correctionSmoothingMaxMagnitude ||
      !hasPresentedFrame
    ) {
      clearCorrectionSmoothing(true);
      return;
    }

    correctionSmoothingPreviousPresented = options.cloneState(previousPresentedState);
    correctionSmoothingInitialTarget = options.cloneState(initialTargetState);
    correctionSmoothingElapsedMs = 0;
    correctionSmoothingMagnitude = magnitude;
    diagnostics.smoothedCorrections += 1;
    diagnostics.correctionSmoothingActive = true;
    diagnostics.correctionSmoothingElapsedMs = 0;
  }

  function projectPresentedState(frameDeltaMs: number, timestamp: number | undefined): TState {
    const alpha = Math.min(1, presentationElapsedMs / predictionStepMs);
    if (statePresentation !== undefined) {
      const fromState = options.cloneState(presentationFromState);
      const targetState = options.cloneState(currentState);
      return statePresentation.present(fromState, targetState, targetState, alpha);
    }
    if (options.presentState === undefined) {
      return options.cloneState(currentState);
    }

    return options.presentState(
      options.cloneState(presentationFromState),
      options.cloneState(currentState),
      {
        frameDeltaMs,
        elapsedMs: presentationElapsedMs,
        stepMs: predictionStepMs,
        alpha,
        ...(timestamp === undefined ? {} : { timestamp }),
        ...(lastPredictedFrame === undefined ? {} : { lastPredictedFrame })
      }
    );
  }

  function smoothPresentedState(
    target: TState,
    frameDeltaMs: number,
    advanceElapsed = true
  ): TState {
    const smoothing = correctionSmoothing;
    if (
      smoothing === undefined ||
      correctionSmoothingPreviousPresented === undefined ||
      correctionSmoothingInitialTarget === undefined
    ) {
      return target;
    }

    if (advanceElapsed) {
      correctionSmoothingElapsedMs = Math.min(
        correctionSmoothingDurationMs,
        correctionSmoothingElapsedMs + frameDeltaMs
      );
    }
    const alpha =
      correctionSmoothingDurationMs <= 0
        ? 1
        : correctionSmoothingElapsedMs / correctionSmoothingDurationMs;
    diagnostics.correctionSmoothingElapsedMs = correctionSmoothingElapsedMs;
    const correctionContext = {
      alpha,
      remainingAlpha: 1 - alpha,
      elapsedMs: correctionSmoothingElapsedMs,
      durationMs: correctionSmoothingDurationMs,
      correctionMagnitude: correctionSmoothingMagnitude,
      previousPresentedState: options.cloneState(correctionSmoothingPreviousPresented),
      initialTargetState: options.cloneState(correctionSmoothingInitialTarget)
    };
    const presented =
      statePresentation === undefined
        ? options.correctionSmoothing!.apply(options.cloneState(target), correctionContext)
        : statePresentation.applyCorrection(
            options.cloneState(target),
            correctionContext.previousPresentedState,
            correctionContext.initialTargetState,
            correctionContext.remainingAlpha
          );
    if (advanceElapsed && alpha >= 1) {
      clearCorrectionSmoothing(false);
    }
    return presented;
  }

  function updatePresentationClock(
    frameDeltaMs: number,
    timestamp: number | undefined,
    recordClamp: boolean
  ): void {
    const predictedTimestamp = normalizeTimestamp(lastPredictedFrame?.timestamp);
    const nextElapsedMs =
      timestamp === undefined || predictedTimestamp === undefined
        ? presentationElapsedMs + frameDeltaMs
        : Math.max(0, timestamp - predictedTimestamp);
    if (recordClamp && nextElapsedMs > predictionStepMs) {
      diagnostics.clampedPresentationFrames += 1;
    }
    presentationElapsedMs = Math.min(predictionStepMs, nextElapsedMs);
    diagnostics.presentationElapsedMs = presentationElapsedMs;
    diagnostics.presentationAlpha = Math.min(1, presentationElapsedMs / predictionStepMs);
  }

  function acknowledgeThrough(sequence: number | undefined): number {
    if (sequence === undefined) {
      return 0;
    }

    let acknowledged = 0;
    while (pendingStart < pending.length) {
      const frame = pending[pendingStart];
      if (!frame || frame.sequence > sequence) {
        break;
      }
      pendingStart += 1;
      acknowledged += 1;
    }
    if (lastAcknowledgedSequence === undefined || sequence > lastAcknowledgedSequence) {
      lastAcknowledgedSequence = sequence;
      diagnostics.lastAcknowledgedSequence = sequence;
    }
    diagnostics.acknowledgedInputs += acknowledged;
    compactPending();
    return acknowledged;
  }

  return {
    state() {
      return currentState;
    },
    present(presentOptions) {
      const frameDeltaMs = normalizeFrameDeltaMs(presentOptions.deltaMs);
      const timestamp = normalizeTimestamp(presentOptions.timestamp);
      updatePresentationClock(frameDeltaMs, timestamp, true);
      diagnostics.presentedFrames += 1;

      const target = projectPresentedState(frameDeltaMs, timestamp);
      const presented = smoothPresentedState(target, frameDeltaMs);
      hasPresentedFrame = true;
      return presented;
    },
    predict(frame) {
      if (!Number.isFinite(frame.sequence) || !Number.isInteger(frame.sequence)) {
        return reject("invalid-sequence");
      }
      if (
        (lastAcknowledgedSequence !== undefined && frame.sequence <= lastAcknowledgedSequence) ||
        (lastPredictedSequence !== undefined && frame.sequence <= lastPredictedSequence)
      ) {
        return reject("stale-sequence");
      }

      pending.push(frame);
      presentationFromState = options.cloneState(currentState);
      lastPredictedFrame = frame;
      presentationElapsedMs = 0;
      diagnostics.presentationElapsedMs = 0;
      diagnostics.presentationAlpha = 0;
      lastPredictedSequence = frame.sequence;
      diagnostics.lastPredictedSequence = frame.sequence;
      diagnostics.predictedInputs += 1;
      currentState = applyFrame(currentState, frame, false);

      while (pendingCount() > maxInputs) {
        pendingStart += 1;
        diagnostics.droppedInputs += 1;
      }
      compactPending();
      refreshPendingDiagnostics();

      return {
        accepted: true,
        state: currentState,
        pendingInputs: pendingCount()
      };
    },
    reconcile(reconcileOptions) {
      const timestamp = normalizeTimestamp(reconcileOptions.timestamp);
      updatePresentationClock(0, timestamp, false);
      const previousPredicted = currentState;
      const previousPresentationFromState = presentationFromState;
      const previousPresentationTarget = smoothPresentedState(
        projectPresentedState(0, timestamp),
        0,
        false
      );
      const acknowledgedInputs = acknowledgeThrough(reconcileOptions.acknowledgedSequence);
      let nextPredicted = options.cloneState(reconcileOptions.authoritativeState);
      let nextPresentationFrom = options.cloneState(nextPredicted);
      let replayedInputs = 0;

      for (let index = pendingStart; index < pending.length; index += 1) {
        const frame = pending[index];
        if (!frame) {
          continue;
        }
        nextPresentationFrom = options.cloneState(nextPredicted);
        nextPredicted = applyFrame(nextPredicted, frame, true);
        replayedInputs += 1;
      }

      const correctionMagnitude = measureCorrection(previousPredicted, nextPredicted);
      recordCorrection(correctionMagnitude);
      currentState = nextPredicted;
      presentationFromState =
        correctionMagnitude <= correctionEpsilon
          ? previousPresentationFromState
          : replayedInputs > 0
            ? nextPresentationFrom
            : options.cloneState(nextPredicted);
      const correctedPresentationTarget = projectPresentedState(0, timestamp);
      beginCorrectionSmoothing(
        correctionMagnitude,
        previousPresentationTarget,
        correctedPresentationTarget
      );
      diagnostics.replayedInputs += replayedInputs;
      refreshPendingDiagnostics();

      return {
        state: currentState,
        pendingInputs: pendingCount(),
        acknowledgedInputs,
        replayedInputs,
        correctionMagnitude
      };
    },
    reset(state, resetOptions = {}) {
      pending.length = 0;
      pendingStart = 0;
      currentState = options.cloneState(state);
      presentationFromState = options.cloneState(state);
      lastPredictedFrame = undefined;
      presentationElapsedMs = 0;
      hasPresentedFrame = false;
      clearCorrectionSmoothing(true);
      lastAcknowledgedSequence = resetOptions.lastAcknowledgedSequence;
      lastPredictedSequence = resetOptions.lastAcknowledgedSequence;
      diagnostics.resets += 1;
      diagnostics.pendingInputs = 0;
      diagnostics.presentationElapsedMs = 0;
      diagnostics.presentationAlpha = 0;
      if (resetOptions.lastAcknowledgedSequence === undefined) {
        delete diagnostics.lastAcknowledgedSequence;
        delete diagnostics.lastPredictedSequence;
      } else {
        diagnostics.lastAcknowledgedSequence = resetOptions.lastAcknowledgedSequence;
        diagnostics.lastPredictedSequence = resetOptions.lastAcknowledgedSequence;
      }
    },
    pendingInputs() {
      return pending.slice(pendingStart);
    },
    pendingInputCount() {
      return pendingCount();
    },
    diagnostics() {
      refreshPendingDiagnostics();
      const transitionDiagnostics = transition?.diagnostics?.();
      return {
        ...diagnostics,
        ...(transitionDiagnostics === undefined ? {} : { transition: transitionDiagnostics })
      };
    },
    dispose() {
      transition?.dispose?.();
    }
  };
}

function normalizeFrameDeltaMs(deltaMs: number): number {
  return Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
}

function normalizeTimestamp(timestamp: number | undefined): number | undefined {
  return timestamp !== undefined && Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
