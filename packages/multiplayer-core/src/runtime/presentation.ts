export type MultiplayerPresentationVector = {
  x: number;
  y: number;
};

export type MultiplayerPresentationSample<TKey extends string = string> = {
  key: TKey;
  target: MultiplayerPresentationVector;
  smoothingMs?: number;
  snapDistance?: number;
  snap?: boolean;
};

export type MultiplayerSnapshotPresentationApplyContext<TSnapshot, TKey extends string = string> = {
  snapshot: TSnapshot;
  presented: ReadonlyMap<TKey, MultiplayerPresentationVector>;
  deltaMs: number;
  reset: boolean;
};

export type MultiplayerSnapshotPresentationOptions<TSnapshot, TKey extends string = string> = {
  smoothingMs?: number;
  snapDistance?: number;
  selectSamples(snapshot: TSnapshot): Iterable<MultiplayerPresentationSample<TKey>>;
  applyPresentedSnapshot(
    context: MultiplayerSnapshotPresentationApplyContext<TSnapshot, TKey>
  ): TSnapshot;
  shouldReset?(previous: TSnapshot | undefined, next: TSnapshot): boolean;
};

export type MultiplayerSnapshotPresentationDiagnostics = {
  activeSamples: number;
  resets: number;
  lastDeltaMs: number;
};

export type MultiplayerSnapshotPresentation<TSnapshot> = {
  reset(): void;
  present(snapshot: TSnapshot, deltaMs: number): TSnapshot;
  diagnostics(): MultiplayerSnapshotPresentationDiagnostics;
};

type PresentedVector = {
  x: number;
  y: number;
};

const DEFAULT_PRESENTATION_SMOOTHING_MS = 72;
const DEFAULT_PRESENTATION_SNAP_DISTANCE = 96;

export function createMultiplayerSnapshotPresentation<TSnapshot, TKey extends string = string>(
  options: MultiplayerSnapshotPresentationOptions<TSnapshot, TKey>
): MultiplayerSnapshotPresentation<TSnapshot> {
  const defaultSmoothingMs = normalizePositiveDuration(
    options.smoothingMs,
    DEFAULT_PRESENTATION_SMOOTHING_MS
  );
  const defaultSnapDistance = normalizeNonNegativeDistance(
    options.snapDistance,
    DEFAULT_PRESENTATION_SNAP_DISTANCE
  );
  const positions = new Map<TKey, PresentedVector>();
  const diagnostics: MultiplayerSnapshotPresentationDiagnostics = {
    activeSamples: 0,
    resets: 0,
    lastDeltaMs: 0
  };
  let previousSnapshot: TSnapshot | undefined;

  function reset(): void {
    positions.clear();
    diagnostics.activeSamples = 0;
    diagnostics.resets += 1;
    previousSnapshot = undefined;
  }

  return {
    reset,
    present(snapshot, deltaMs) {
      const delta = Math.max(0, deltaMs);
      const shouldReset = options.shouldReset?.(previousSnapshot, snapshot) === true;
      if (shouldReset) {
        positions.clear();
        diagnostics.activeSamples = 0;
        diagnostics.resets += 1;
      }

      const activeKeys = new Set<TKey>();
      const presented = new Map<TKey, MultiplayerPresentationVector>();
      for (const sample of options.selectSamples(snapshot)) {
        activeKeys.add(sample.key);
        presented.set(
          sample.key,
          presentVector(positions, sample, delta, {
            smoothingMs: defaultSmoothingMs,
            snapDistance: defaultSnapDistance
          })
        );
      }

      removeInactivePositions(positions, activeKeys);
      diagnostics.activeSamples = activeKeys.size;
      diagnostics.lastDeltaMs = delta;
      previousSnapshot = snapshot;

      return options.applyPresentedSnapshot({
        snapshot,
        presented,
        deltaMs: delta,
        reset: shouldReset
      });
    },
    diagnostics() {
      return { ...diagnostics };
    }
  };
}

function presentVector<TKey extends string>(
  positions: Map<TKey, PresentedVector>,
  sample: MultiplayerPresentationSample<TKey>,
  deltaMs: number,
  defaults: { smoothingMs: number; snapDistance: number }
): MultiplayerPresentationVector {
  const current = positions.get(sample.key);
  const smoothingMs = normalizePositiveDuration(sample.smoothingMs, defaults.smoothingMs);
  const snapDistance = normalizeNonNegativeDistance(sample.snapDistance, defaults.snapDistance);
  if (
    current === undefined ||
    sample.snap === true ||
    distance(current, sample.target) >= snapDistance ||
    deltaMs <= 0
  ) {
    const snapped = { ...sample.target };
    positions.set(sample.key, snapped);
    return { ...snapped };
  }

  const amount = 1 - Math.exp(-deltaMs / smoothingMs);
  const next = {
    x: lerp(current.x, sample.target.x, amount),
    y: lerp(current.y, sample.target.y, amount)
  };
  positions.set(sample.key, next);
  return { ...next };
}

function removeInactivePositions<TKey extends string>(
  positions: Map<TKey, PresentedVector>,
  activeKeys: Set<TKey>
): void {
  for (const key of positions.keys()) {
    if (!activeKeys.has(key)) {
      positions.delete(key);
    }
  }
}

function normalizePositiveDuration(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Math.max(1, value);
}

function normalizeNonNegativeDistance(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Math.max(0, value);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, amount));
}

function distance(a: MultiplayerPresentationVector, b: MultiplayerPresentationVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
