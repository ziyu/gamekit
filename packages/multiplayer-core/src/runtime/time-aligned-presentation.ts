import {
  createMultiplayerPredictionStatePresentation,
  type MultiplayerPredictionStatePresentationOptions
} from "./prediction-state";

export type MultiplayerPresentationTimelineAlignment =
  | {
      mode: "absolute";
      predictedOriginTime?: number | undefined;
      authorityOriginTime?: number | undefined;
    }
  | {
      mode: "relative-origin";
      predictedOriginTime: number;
      authorityOriginTime: number;
    };

export type MultiplayerTimeAlignedPresentationReconciliation<TResult> = {
  status: "confirmed" | "corrected";
  result: TResult;
  alignment?: MultiplayerPresentationTimelineAlignment | undefined;
  holdPrediction?: boolean | undefined;
};

export type MultiplayerTimeAlignedPresentationInput<TPredicted, TAuthority> = {
  predicted?: TPredicted | undefined;
  authoritative?: TAuthority | undefined;
  presentationTime: number;
  elapsedMs: number;
};

export type MultiplayerTimeAlignedPresentationCorrectionContext<
  TPredicted,
  TAuthority,
  TSample,
  TResult
> = {
  predicted: TPredicted;
  authoritative: TAuthority;
  predictedSample: TSample;
  authoritySample: TSample;
  reconciliation: TResult;
  correctionMagnitude: number;
};

export type MultiplayerTimeAlignedPresentationOptions<TPredicted, TAuthority, TSample, TResult> = {
  key(predicted: TPredicted, authoritative: TAuthority): string;
  version(predicted: TPredicted, authoritative: TAuthority): string;
  reconcile(
    predicted: TPredicted,
    authoritative: TAuthority
  ): MultiplayerTimeAlignedPresentationReconciliation<TResult>;
  samplePredicted(predicted: TPredicted, presentationTime: number): TSample;
  sampleAuthority(authoritative: TAuthority, presentationTime: number): TSample;
  cloneSample(sample: TSample): TSample;
  presentation: MultiplayerPredictionStatePresentationOptions<TSample>;
  correctionDurationMs?:
    | number
    | ((
        context: MultiplayerTimeAlignedPresentationCorrectionContext<
          TPredicted,
          TAuthority,
          TSample,
          TResult
        >
      ) => number)
    | undefined;
  isActive?(sample: TSample): boolean;
  maxEntries?: number | undefined;
  correctionEpsilon?: number | undefined;
};

export type MultiplayerTimeAlignedPresentationResult<TResult> = {
  status: "confirmed" | "corrected";
  result: TResult;
  alignment: MultiplayerPresentationTimelineAlignment;
  /** Difference between declared lifecycle origins, whether or not it is applied to sampling. */
  originTimeOffset: number;
  /** Offset actually applied to authority sampling; zero for absolute alignment. */
  authorityTimeOffset: number;
  correctionMagnitude: number;
  correctionDurationMs: number;
  holdsPrediction: boolean;
};

export type MultiplayerTimeAlignedPresentationDiagnostics = {
  reconciliations: number;
  confirmed: number;
  corrected: number;
  absoluteAlignments: number;
  relativeAlignments: number;
  heldPredictions: number;
  smoothedCorrections: number;
  completedCorrections: number;
  evictedEntries: number;
  resets: number;
  entries: number;
  activeCorrections: number;
  lastOriginTimeOffset?: number | undefined;
  lastAuthorityTimeOffset?: number | undefined;
};

export type MultiplayerTimeAlignedPresentationTransition<TPredicted, TAuthority, TSample, TResult> =
  {
    reconcile(
      input: MultiplayerTimeAlignedPresentationInput<TPredicted, TAuthority> & {
        predicted: TPredicted;
        authoritative: TAuthority;
      }
    ): MultiplayerTimeAlignedPresentationResult<TResult>;
    sample(
      input: MultiplayerTimeAlignedPresentationInput<TPredicted, TAuthority>
    ): TSample | undefined;
    remove(key: string): void;
    reset(): void;
    diagnostics(): MultiplayerTimeAlignedPresentationDiagnostics;
    dispose(): void;
  };

type PresentationEntry<TSample, TResult> = {
  version: string;
  result: MultiplayerTimeAlignedPresentationResult<TResult>;
  correction?:
    | {
        startedAt: number;
        durationMs: number;
        previousPresented: TSample;
        initialTarget: TSample;
      }
    | undefined;
};

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_CORRECTION_EPSILON = 0.000_001;

/**
 * Owns the provider-neutral handoff from an anticipated lifecycle to its authority lifecycle.
 * Domains supply identity, deterministic sampling, reconciliation facts, and presentation fields;
 * Core owns time alignment, bounded entry state, correction smoothing, and diagnostics.
 */
export function createMultiplayerTimeAlignedPresentationTransition<
  TPredicted,
  TAuthority,
  TSample,
  TResult
>(
  options: MultiplayerTimeAlignedPresentationOptions<TPredicted, TAuthority, TSample, TResult>
): MultiplayerTimeAlignedPresentationTransition<TPredicted, TAuthority, TSample, TResult> {
  const maxEntries = normalizePositiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const correctionEpsilon = normalizeNonNegativeNumber(
    options.correctionEpsilon,
    DEFAULT_CORRECTION_EPSILON
  );
  const presentation = createMultiplayerPredictionStatePresentation(options.presentation);
  const entries = new Map<string, PresentationEntry<TSample, TResult>>();
  let disposed = false;
  const diagnostics: Omit<
    MultiplayerTimeAlignedPresentationDiagnostics,
    "entries" | "activeCorrections"
  > = {
    reconciliations: 0,
    confirmed: 0,
    corrected: 0,
    absoluteAlignments: 0,
    relativeAlignments: 0,
    heldPredictions: 0,
    smoothedCorrections: 0,
    completedCorrections: 0,
    evictedEntries: 0,
    resets: 0
  };

  return {
    reconcile(input) {
      assertActive();
      validateInput(input);
      return ensureEntry(input).result;
    },
    sample(input) {
      assertActive();
      validateInput(input);
      const { predicted, authoritative } = input;
      if (predicted === undefined && authoritative === undefined) {
        return undefined;
      }
      if (predicted === undefined) {
        return options.sampleAuthority(authoritative!, input.presentationTime);
      }
      if (authoritative === undefined) {
        return options.samplePredicted(predicted, input.presentationTime);
      }

      const entry = ensureEntry({
        predicted,
        authoritative,
        presentationTime: input.presentationTime,
        elapsedMs: input.elapsedMs
      });
      if (entry.result.holdsPrediction) {
        return options.samplePredicted(predicted, input.presentationTime);
      }

      const authoritySample = options.sampleAuthority(
        authoritative,
        input.presentationTime + entry.result.authorityTimeOffset
      );
      const correction = entry.correction;
      if ((options.isActive?.(authoritySample) ?? true) === false || correction === undefined) {
        return authoritySample;
      }
      const progress = clamp01((input.elapsedMs - correction.startedAt) / correction.durationMs);
      if (progress >= 1) {
        entry.correction = undefined;
        diagnostics.completedCorrections += 1;
        return authoritySample;
      }
      return presentation.applyCorrection(
        options.cloneSample(authoritySample),
        correction.previousPresented,
        correction.initialTarget,
        1 - progress
      );
    },
    remove(key) {
      assertActive();
      entries.delete(key);
    },
    reset() {
      assertActive();
      entries.clear();
      diagnostics.resets += 1;
    },
    diagnostics() {
      assertActive();
      return {
        ...diagnostics,
        entries: entries.size,
        activeCorrections: [...entries.values()].filter((entry) => entry.correction !== undefined)
          .length
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      entries.clear();
    }
  };

  function ensureEntry(input: {
    predicted: TPredicted;
    authoritative: TAuthority;
    presentationTime: number;
    elapsedMs: number;
  }): PresentationEntry<TSample, TResult> {
    const key = options.key(input.predicted, input.authoritative);
    const version = options.version(input.predicted, input.authoritative);
    const existing = entries.get(key);
    if (existing?.version === version) {
      return existing;
    }

    const reconciliation = options.reconcile(input.predicted, input.authoritative);
    const alignment = reconciliation.alignment ?? { mode: "absolute" };
    const originTimeOffset = resolveOriginTimeOffset(alignment);
    const authorityTimeOffset = alignment.mode === "relative-origin" ? originTimeOffset : 0;
    const predictedSample = options.samplePredicted(input.predicted, input.presentationTime);
    const authoritySample = options.sampleAuthority(
      input.authoritative,
      input.presentationTime + authorityTimeOffset
    );
    const correctionMagnitude = normalizeNonNegativeNumber(
      presentation.measureCorrection(predictedSample, authoritySample),
      0
    );
    const holdsPrediction = reconciliation.holdPrediction === true;
    const correctionDurationMs = resolveCorrectionDuration({
      predicted: input.predicted,
      authoritative: input.authoritative,
      predictedSample,
      authoritySample,
      reconciliation: reconciliation.result,
      correctionMagnitude
    });
    const canSmooth =
      correctionMagnitude > correctionEpsilon &&
      !holdsPrediction &&
      correctionDurationMs > 0 &&
      correctionMagnitude <= (presentation.correction?.maxMagnitude ?? Number.POSITIVE_INFINITY) &&
      (options.isActive?.(authoritySample) ?? true);
    const result: MultiplayerTimeAlignedPresentationResult<TResult> = {
      status: reconciliation.status,
      result: reconciliation.result,
      alignment,
      originTimeOffset,
      authorityTimeOffset,
      correctionMagnitude,
      correctionDurationMs: canSmooth ? correctionDurationMs : 0,
      holdsPrediction
    };
    const entry: PresentationEntry<TSample, TResult> = {
      version,
      result,
      ...(canSmooth
        ? {
            correction: {
              startedAt: input.elapsedMs,
              durationMs: correctionDurationMs,
              previousPresented: options.cloneSample(predictedSample),
              initialTarget: options.cloneSample(authoritySample)
            }
          }
        : {})
    };
    entries.delete(key);
    entries.set(key, entry);
    trimEntries();
    diagnostics.reconciliations += 1;
    diagnostics.lastOriginTimeOffset = originTimeOffset;
    diagnostics.lastAuthorityTimeOffset = authorityTimeOffset;
    diagnostics[reconciliation.status] += 1;
    if (alignment.mode === "relative-origin") {
      diagnostics.relativeAlignments += 1;
    } else {
      diagnostics.absoluteAlignments += 1;
    }
    if (holdsPrediction) {
      diagnostics.heldPredictions += 1;
    }
    if (canSmooth) {
      diagnostics.smoothedCorrections += 1;
    }
    return entry;
  }

  function resolveCorrectionDuration(
    context: MultiplayerTimeAlignedPresentationCorrectionContext<
      TPredicted,
      TAuthority,
      TSample,
      TResult
    >
  ): number {
    const configured = options.correctionDurationMs;
    if (typeof configured === "function") {
      return normalizeNonNegativeNumber(configured(context), 0);
    }
    return normalizeNonNegativeNumber(configured, presentation.correction?.durationMs ?? 0);
  }

  function trimEntries(): void {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest === undefined) {
        return;
      }
      entries.delete(oldest);
      diagnostics.evictedEntries += 1;
    }
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Multiplayer time-aligned presentation transition has been disposed.");
    }
  }
}

function resolveOriginTimeOffset(alignment: MultiplayerPresentationTimelineAlignment): number {
  if (alignment.predictedOriginTime === undefined || alignment.authorityOriginTime === undefined) {
    return 0;
  }
  validateTime(alignment.predictedOriginTime, "predicted origin");
  validateTime(alignment.authorityOriginTime, "authority origin");
  return alignment.authorityOriginTime - alignment.predictedOriginTime;
}

function validateInput<TPredicted, TAuthority>(
  input: MultiplayerTimeAlignedPresentationInput<TPredicted, TAuthority>
): void {
  validateTime(input.presentationTime, "presentation");
  validateTime(input.elapsedMs, "elapsed");
}

function validateTime(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Multiplayer ${label} time must be non-negative and finite.`);
  }
}

function normalizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
