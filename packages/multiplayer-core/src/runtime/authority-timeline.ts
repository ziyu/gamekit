export type MultiplayerAuthorityTimelineOptions = {
  stepMs?: number | undefined;
};

export type MultiplayerAuthorityTimelineSyncResult = {
  authorityTime: number;
  authorityTick: number;
  preventedRewind: boolean;
  advanced: boolean;
};

export type MultiplayerAuthorityTimelineDiagnostics = {
  anchored: boolean;
  preventedRewinds: number;
  forwardCorrections: number;
  duplicateAnchors: number;
  resets: number;
  authorityTime: number;
  authorityTick: number;
};

export type MultiplayerAuthorityTimeline = {
  sync(authorityTime: number, localTime: number): MultiplayerAuthorityTimelineSyncResult;
  time(localTime: number): number;
  sampleTick(localTime: number): number;
  tick(localTime: number): number;
  reset(): void;
  diagnostics(): MultiplayerAuthorityTimelineDiagnostics;
};

const DEFAULT_STEP_MS = 1;

/**
 * Maintains a provider-neutral estimate of authority time. Delayed snapshots can confirm the
 * current estimate, but they cannot move a client presentation timeline backwards.
 */
export function createMultiplayerAuthorityTimeline(
  options: MultiplayerAuthorityTimelineOptions = {}
): MultiplayerAuthorityTimeline {
  const stepMs = normalizePositiveNumber(options.stepMs, DEFAULT_STEP_MS);
  let authorityAnchorTime = 0;
  let localAnchorTime = 0;
  let anchored = false;
  let preventedRewinds = 0;
  let forwardCorrections = 0;
  let duplicateAnchors = 0;
  let resets = 0;
  let lastReceivedAuthorityTime: number | undefined;

  return {
    sync(authorityTime, localTime) {
      validateTime(authorityTime, "authority");
      validateTime(localTime, "local");
      if (anchored && authorityTime === lastReceivedAuthorityTime) {
        duplicateAnchors += 1;
        const currentAuthorityTime = resolveTime(localTime);
        return {
          authorityTime: currentAuthorityTime,
          authorityTick: resolveTick(currentAuthorityTime),
          preventedRewind: false,
          advanced: false
        };
      }
      const extrapolated = anchored ? resolveTime(localTime) : authorityTime;
      const preventedRewind = anchored && authorityTime < extrapolated;
      const nextAuthorityTime = Math.max(authorityTime, extrapolated);
      const advanced = anchored && authorityTime > extrapolated;
      if (preventedRewind) {
        preventedRewinds += 1;
      }
      if (advanced) {
        forwardCorrections += 1;
      }
      authorityAnchorTime = nextAuthorityTime;
      localAnchorTime = localTime;
      lastReceivedAuthorityTime = authorityTime;
      anchored = true;
      return {
        authorityTime: nextAuthorityTime,
        authorityTick: resolveTick(nextAuthorityTime),
        preventedRewind,
        advanced
      };
    },
    time(localTime) {
      validateTime(localTime, "local");
      return resolveTime(localTime);
    },
    sampleTick(localTime) {
      validateTime(localTime, "local");
      return resolveTime(localTime) / stepMs;
    },
    tick(localTime) {
      validateTime(localTime, "local");
      return resolveTick(resolveTime(localTime));
    },
    reset() {
      authorityAnchorTime = 0;
      localAnchorTime = 0;
      anchored = false;
      lastReceivedAuthorityTime = undefined;
      resets += 1;
    },
    diagnostics() {
      return {
        anchored,
        preventedRewinds,
        forwardCorrections,
        duplicateAnchors,
        resets,
        authorityTime: authorityAnchorTime,
        authorityTick: resolveTick(authorityAnchorTime)
      };
    }
  };

  function resolveTime(localTime: number): number {
    if (!anchored) {
      return 0;
    }
    return authorityAnchorTime + Math.max(0, localTime - localAnchorTime);
  }

  function resolveTick(authorityTime: number): number {
    return Math.max(0, Math.floor(authorityTime / stepMs));
  }
}

function validateTime(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Multiplayer authority ${label} time must be non-negative and finite.`);
  }
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}
