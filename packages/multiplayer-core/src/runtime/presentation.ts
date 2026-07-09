export type SnapshotSampleStatus =
  | "empty"
  | "before-first"
  | "exact"
  | "interpolated"
  | "after-latest";

export type SnapshotTimeSource = "time" | "serverTime" | "tick" | "receivedAt" | "version";

export type SnapshotBufferEntry<TSnapshot> = {
  snapshot: TSnapshot;
  time?: number;
  serverTime?: number;
  tick?: number;
  version?: string | number;
  receivedAt?: number;
};

export type SnapshotBufferFrame<TSnapshot> = {
  snapshot: TSnapshot;
  time: number;
  serverTime?: number;
  tick?: number;
  version?: string | number;
  receivedAt?: number;
};

export type SnapshotBufferOptions<TSnapshot> = {
  interpolationDelayMs?: number;
  maxSnapshots?: number;
  maxAgeMs?: number;
  timeSource?: SnapshotTimeSource;
  readTime?(entry: SnapshotBufferEntry<TSnapshot>): number | undefined;
};

export type SnapshotBufferPushResult = {
  accepted: boolean;
  reason?: "invalid-time" | "stale" | "duplicate";
  time?: number;
};

export type SnapshotBufferSample<TSnapshot> = {
  status: SnapshotSampleStatus;
  renderTime: number;
  sampleTime: number;
  delayMs: number;
  alpha: number;
  previous?: SnapshotBufferFrame<TSnapshot>;
  next?: SnapshotBufferFrame<TSnapshot>;
  snapshotAgeMs?: number;
  bufferLength: number;
};

export type SnapshotBufferDiagnostics = {
  bufferLength: number;
  acceptedSnapshots: number;
  droppedSnapshots: number;
  staleSnapshots: number;
  duplicateSnapshots: number;
  resets: number;
  lastPushedTime?: number;
  lastSampleStatus?: SnapshotSampleStatus;
  lastSampleAgeMs?: number;
  lastSampleDelayMs?: number;
};

export type SnapshotBuffer<TSnapshot> = {
  push(entry: SnapshotBufferEntry<TSnapshot>): SnapshotBufferPushResult;
  sample(renderTime: number, delayMs?: number): SnapshotBufferSample<TSnapshot>;
  reset(): void;
  frames(): Array<SnapshotBufferFrame<TSnapshot>>;
  diagnostics(): SnapshotBufferDiagnostics;
};

export type SnapshotPlaybackOptions<TSnapshot> = SnapshotBufferOptions<TSnapshot> & {
  clampToLatest?: boolean;
  maxFrameDeltaMs?: number;
  shouldReset?(previous: TSnapshot | undefined, next: TSnapshot): boolean;
};

export type SnapshotPlaybackSample<TSnapshot> = SnapshotBufferSample<TSnapshot> & {
  pushResult: SnapshotBufferPushResult;
  clampedToLatest: boolean;
};

export type SnapshotPlaybackDiagnostics = SnapshotBufferDiagnostics & {
  frameRate: number;
  framesPresented: number;
  clampedFrames: number;
  frameDeltaMs?: number;
  renderTime?: number;
  latestSnapshotTime?: number;
};

export type SnapshotPlayback<TSnapshot> = {
  present(
    entry: SnapshotBufferEntry<TSnapshot>,
    deltaMs: number
  ): SnapshotPlaybackSample<TSnapshot>;
  advance(deltaMs: number): SnapshotPlaybackSample<TSnapshot>;
  reset(): void;
  frames(): Array<SnapshotBufferFrame<TSnapshot>>;
  diagnostics(): SnapshotPlaybackDiagnostics;
};

export type NetworkScalar = number;

export type NetworkAngleRadians = number;

export type NetworkVector2 = {
  x: number;
  y: number;
};

export type NetworkVector3 = {
  x: number;
  y: number;
  z: number;
};

export type NetworkQuaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type NetworkTransform2 = {
  position: NetworkVector2;
  rotation?: NetworkAngleRadians;
  scale?: NetworkVector2;
};

export type NetworkTransform3 = {
  position: NetworkVector3;
  rotation?: NetworkQuaternion;
  scale?: NetworkVector3;
};

export type SnapshotPresentationValue =
  | NetworkScalar
  | NetworkVector2
  | NetworkVector3
  | NetworkQuaternion;

export type SnapshotPresentationKey = string | number;

export type SnapshotPresentationSampleOptions = {
  snap?: boolean;
  snapDistance?: number;
};

export type SnapshotPresentationSample<TValue> = SnapshotPresentationSampleOptions & {
  key: SnapshotPresentationKey;
  value: TValue;
};

export type SnapshotPresentationTrackWriter<TValue> = {
  add(
    key: SnapshotPresentationKey,
    value: TValue,
    options?: SnapshotPresentationSampleOptions
  ): void;
};

export type SnapshotPresentationTrackContext<TSnapshot, TValue> = {
  key: SnapshotPresentationKey;
  previous?: TValue;
  next: TValue;
  alpha: number;
  previousSnapshot?: TSnapshot;
  nextSnapshot: TSnapshot;
  sample: SnapshotBufferSample<TSnapshot>;
};

export type SnapshotPresentationTrackBase<TSnapshot, TValue> = {
  select?(snapshot: TSnapshot): Iterable<SnapshotPresentationSample<TValue>>;
  selectInto?(snapshot: TSnapshot, writer: SnapshotPresentationTrackWriter<TValue>): void;
  snap?(ctx: SnapshotPresentationTrackContext<TSnapshot, TValue>): boolean;
};

export type SnapshotPresentationScalarTrack<TSnapshot> = SnapshotPresentationTrackBase<
  TSnapshot,
  NetworkScalar
> & {
  kind: "scalar";
};

export type SnapshotPresentationAngleTrack<TSnapshot> = SnapshotPresentationTrackBase<
  TSnapshot,
  NetworkAngleRadians
> & {
  kind: "angle-radians";
};

export type SnapshotPresentationVector2Track<TSnapshot> = SnapshotPresentationTrackBase<
  TSnapshot,
  NetworkVector2
> & {
  kind: "vector2";
  snapDistance?: number;
};

export type SnapshotPresentationVector3Track<TSnapshot> = SnapshotPresentationTrackBase<
  TSnapshot,
  NetworkVector3
> & {
  kind: "vector3";
  snapDistance?: number;
};

export type SnapshotPresentationQuaternionTrack<TSnapshot> = SnapshotPresentationTrackBase<
  TSnapshot,
  NetworkQuaternion
> & {
  kind: "quaternion";
};

export type SnapshotPresentationStepTrack<
  TSnapshot,
  TValue = unknown
> = SnapshotPresentationTrackBase<TSnapshot, TValue> & {
  kind: "step";
  threshold?: number;
};

export type SnapshotPresentationTrack<TSnapshot> =
  | SnapshotPresentationScalarTrack<TSnapshot>
  | SnapshotPresentationAngleTrack<TSnapshot>
  | SnapshotPresentationVector2Track<TSnapshot>
  | SnapshotPresentationVector3Track<TSnapshot>
  | SnapshotPresentationQuaternionTrack<TSnapshot>
  | SnapshotPresentationStepTrack<TSnapshot>;

export type PresentedSnapshotTracks = {
  values: ReadonlyMap<SnapshotPresentationKey, unknown>;
  value<TValue>(key: SnapshotPresentationKey, fallback: TValue): TValue;
  scalar(key: SnapshotPresentationKey, fallback: NetworkScalar): NetworkScalar;
  angleRadians(key: SnapshotPresentationKey, fallback: NetworkAngleRadians): NetworkAngleRadians;
  vector2(key: SnapshotPresentationKey, fallback: NetworkVector2): NetworkVector2;
  vector2Into(
    key: SnapshotPresentationKey,
    target: NetworkVector2,
    fallback: NetworkVector2
  ): NetworkVector2;
  vector3(key: SnapshotPresentationKey, fallback: NetworkVector3): NetworkVector3;
  vector3Into(
    key: SnapshotPresentationKey,
    target: NetworkVector3,
    fallback: NetworkVector3
  ): NetworkVector3;
  quaternion(key: SnapshotPresentationKey, fallback: NetworkQuaternion): NetworkQuaternion;
  quaternionInto(
    key: SnapshotPresentationKey,
    target: NetworkQuaternion,
    fallback: NetworkQuaternion
  ): NetworkQuaternion;
};

export type SnapshotPresentationProjector<TSnapshot> = {
  present(sample: SnapshotBufferSample<TSnapshot>): PresentedSnapshotTracks;
  reset(): void;
};

const DEFAULT_INTERPOLATION_DELAY_MS = 100;
const DEFAULT_MAX_SNAPSHOTS = 32;
const DEFAULT_MAX_FRAME_DELTA_MS = 250;

export function createSnapshotBuffer<TSnapshot>(
  options: SnapshotBufferOptions<TSnapshot> = {}
): SnapshotBuffer<TSnapshot> {
  const interpolationDelayMs = normalizeNonNegativeNumber(
    options.interpolationDelayMs,
    DEFAULT_INTERPOLATION_DELAY_MS
  );
  const maxSnapshots = normalizePositiveInteger(options.maxSnapshots, DEFAULT_MAX_SNAPSHOTS);
  const maxAgeMs = normalizeMaxAgeMs(options.maxAgeMs);
  const frames: Array<SnapshotBufferFrame<TSnapshot>> = [];
  const diagnostics: SnapshotBufferDiagnostics = {
    bufferLength: 0,
    acceptedSnapshots: 0,
    droppedSnapshots: 0,
    staleSnapshots: 0,
    duplicateSnapshots: 0,
    resets: 0
  };

  function push(entry: SnapshotBufferEntry<TSnapshot>): SnapshotBufferPushResult {
    const time = resolveSnapshotTime(entry, options);
    if (time === undefined || !Number.isFinite(time)) {
      diagnostics.droppedSnapshots += 1;
      updateBufferLength();
      return { accepted: false, reason: "invalid-time" };
    }

    const newestTime = frames.at(-1)?.time;
    if (newestTime !== undefined && time < newestTime - maxAgeMs) {
      diagnostics.staleSnapshots += 1;
      updateBufferLength();
      return {
        accepted: false,
        reason: "stale",
        time
      };
    }

    const frame = normalizeFrame(entry, time);
    const duplicateIndex = frames.findIndex((candidate) => candidate.time === time);
    if (duplicateIndex >= 0) {
      frames[duplicateIndex] = frame;
      diagnostics.duplicateSnapshots += 1;
      diagnostics.lastPushedTime = time;
      updateBufferLength();
      return {
        accepted: true,
        reason: "duplicate",
        time
      };
    }

    insertFrame(frames, frame);
    diagnostics.acceptedSnapshots += 1;
    diagnostics.lastPushedTime = time;
    trimFrames(frames, {
      maxSnapshots,
      maxAgeMs,
      diagnostics
    });
    updateBufferLength();
    return {
      accepted: true,
      time
    };
  }

  function sample(
    renderTime: number,
    delayMs = interpolationDelayMs
  ): SnapshotBufferSample<TSnapshot> {
    const normalizedDelay = normalizeNonNegativeNumber(delayMs, interpolationDelayMs);
    const sampleTime = renderTime - normalizedDelay;
    const result = sampleFrames(frames, {
      renderTime,
      sampleTime,
      delayMs: normalizedDelay
    });
    diagnostics.lastSampleStatus = result.status;
    diagnostics.lastSampleDelayMs = normalizedDelay;
    if (result.snapshotAgeMs === undefined) {
      delete diagnostics.lastSampleAgeMs;
    } else {
      diagnostics.lastSampleAgeMs = result.snapshotAgeMs;
    }
    return result;
  }

  function reset(): void {
    frames.length = 0;
    diagnostics.resets += 1;
    delete diagnostics.lastPushedTime;
    delete diagnostics.lastSampleStatus;
    delete diagnostics.lastSampleAgeMs;
    delete diagnostics.lastSampleDelayMs;
    updateBufferLength();
  }

  function updateBufferLength(): void {
    diagnostics.bufferLength = frames.length;
  }

  return {
    push,
    sample,
    reset,
    frames() {
      return frames.map(cloneFrame);
    },
    diagnostics() {
      return { ...diagnostics };
    }
  };
}

export function createSnapshotPlayback<TSnapshot>(
  options: SnapshotPlaybackOptions<TSnapshot> = {}
): SnapshotPlayback<TSnapshot> {
  const interpolationDelayMs = normalizeNonNegativeNumber(
    options.interpolationDelayMs,
    DEFAULT_INTERPOLATION_DELAY_MS
  );
  const maxFrameDeltaMs = normalizeNonNegativeNumber(
    options.maxFrameDeltaMs,
    DEFAULT_MAX_FRAME_DELTA_MS
  );
  const clampToLatest = options.clampToLatest ?? true;
  const buffer = createSnapshotBuffer<TSnapshot>(options);
  let previousSnapshot: TSnapshot | undefined;
  let renderTime: number | undefined;
  let latestSnapshotTime: number | undefined;
  let lastSample: SnapshotPlaybackSample<TSnapshot> | undefined;
  let frameRate = 0;
  let frameWindowMs = 0;
  let framesPresentedInWindow = 0;
  let framesPresented = 0;
  let clampedFrames = 0;
  let frameDeltaMs: number | undefined;

  function reset(): void {
    buffer.reset();
    previousSnapshot = undefined;
    renderTime = undefined;
    latestSnapshotTime = undefined;
    lastSample = undefined;
    frameRate = 0;
    frameWindowMs = 0;
    framesPresentedInWindow = 0;
    framesPresented = 0;
    clampedFrames = 0;
    frameDeltaMs = undefined;
  }

  function present(
    entry: SnapshotBufferEntry<TSnapshot>,
    deltaMs: number
  ): SnapshotPlaybackSample<TSnapshot> {
    if (options.shouldReset?.(previousSnapshot, entry.snapshot) === true) {
      buffer.reset();
      renderTime = undefined;
      latestSnapshotTime = undefined;
    }

    const pushResult = buffer.push(entry);
    if (pushResult.accepted && pushResult.time !== undefined) {
      latestSnapshotTime =
        latestSnapshotTime === undefined
          ? pushResult.time
          : Math.max(latestSnapshotTime, pushResult.time);
      if (renderTime === undefined) {
        renderTime = pushResult.time;
      }
      previousSnapshot = entry.snapshot;
    }

    return samplePlayback(deltaMs, pushResult.time, pushResult);
  }

  function advance(deltaMs: number): SnapshotPlaybackSample<TSnapshot> {
    return samplePlayback(deltaMs, undefined, { accepted: false });
  }

  function samplePlayback(
    deltaMs: number,
    fallbackRenderTime: number | undefined,
    pushResult: SnapshotBufferPushResult
  ): SnapshotPlaybackSample<TSnapshot> {
    const frameDelta = recordPresentationFrame(deltaMs);
    const nextRenderTime =
      (renderTime ?? fallbackRenderTime ?? latestSnapshotTime ?? 0) + frameDelta;
    const maxRenderTime =
      clampToLatest && latestSnapshotTime !== undefined
        ? latestSnapshotTime + interpolationDelayMs
        : Number.POSITIVE_INFINITY;
    const clampedToLatest = nextRenderTime > maxRenderTime;
    if (clampedToLatest) {
      clampedFrames += 1;
    }
    renderTime = clampedToLatest ? maxRenderTime : nextRenderTime;
    lastSample = {
      ...buffer.sample(renderTime),
      pushResult,
      clampedToLatest
    };
    return lastSample;
  }

  function recordPresentationFrame(deltaMs: number): number {
    const normalizedDeltaMs = Math.min(maxFrameDeltaMs, Math.max(0, deltaMs));
    frameDeltaMs = normalizedDeltaMs;
    framesPresented += 1;
    framesPresentedInWindow += 1;
    frameWindowMs += normalizedDeltaMs;
    if (frameWindowMs >= 1000) {
      frameRate = Math.round((framesPresentedInWindow * 1000) / frameWindowMs);
      framesPresentedInWindow = 0;
      frameWindowMs = 0;
    }
    return normalizedDeltaMs;
  }

  return {
    present,
    advance,
    reset,
    frames() {
      return buffer.frames();
    },
    diagnostics() {
      return {
        ...buffer.diagnostics(),
        frameRate,
        framesPresented,
        clampedFrames,
        ...(frameDeltaMs === undefined ? {} : { frameDeltaMs }),
        ...(renderTime === undefined ? {} : { renderTime }),
        ...(latestSnapshotTime === undefined ? {} : { latestSnapshotTime }),
        ...(lastSample?.status === undefined ? {} : { lastSampleStatus: lastSample.status }),
        ...(lastSample?.snapshotAgeMs === undefined
          ? {}
          : { lastSampleAgeMs: lastSample.snapshotAgeMs }),
        ...(lastSample?.delayMs === undefined ? {} : { lastSampleDelayMs: lastSample.delayMs })
      };
    }
  };
}

export function interpolateNumber(
  from: NetworkScalar,
  to: NetworkScalar,
  alpha: number
): NetworkScalar {
  const amount = clamp01(alpha);
  return from + (to - from) * amount;
}

export function interpolateAngleRadians(
  from: NetworkAngleRadians,
  to: NetworkAngleRadians,
  alpha: number
): NetworkAngleRadians {
  const delta = shortestAngleDeltaRadians(from, to);
  return from + delta * clamp01(alpha);
}

export function interpolateVector2(
  from: NetworkVector2,
  to: NetworkVector2,
  alpha: number
): NetworkVector2 {
  return {
    x: interpolateNumber(from.x, to.x, alpha),
    y: interpolateNumber(from.y, to.y, alpha)
  };
}

export function interpolateVector3(
  from: NetworkVector3,
  to: NetworkVector3,
  alpha: number
): NetworkVector3 {
  return {
    x: interpolateNumber(from.x, to.x, alpha),
    y: interpolateNumber(from.y, to.y, alpha),
    z: interpolateNumber(from.z, to.z, alpha)
  };
}

export function interpolateQuaternion(
  from: NetworkQuaternion,
  to: NetworkQuaternion,
  alpha: number
): NetworkQuaternion {
  const amount = clamp01(alpha);
  let target = to;
  let cosine = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

  if (cosine < 0) {
    cosine = -cosine;
    target = {
      x: -to.x,
      y: -to.y,
      z: -to.z,
      w: -to.w
    };
  }

  if (cosine > 0.9995) {
    return normalizeQuaternion({
      x: interpolateNumber(from.x, target.x, amount),
      y: interpolateNumber(from.y, target.y, amount),
      z: interpolateNumber(from.z, target.z, amount),
      w: interpolateNumber(from.w, target.w, amount)
    });
  }

  const theta = Math.acos(clamp(cosine, -1, 1));
  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) <= Number.EPSILON) {
    return { ...from };
  }

  const weightFrom = Math.sin((1 - amount) * theta) / sinTheta;
  const weightTo = Math.sin(amount * theta) / sinTheta;
  return {
    x: from.x * weightFrom + target.x * weightTo,
    y: from.y * weightFrom + target.y * weightTo,
    z: from.z * weightFrom + target.z * weightTo,
    w: from.w * weightFrom + target.w * weightTo
  };
}

export function stepValue<TValue>(from: TValue, to: TValue, alpha: number, threshold = 1): TValue {
  return clamp01(alpha) >= threshold ? to : from;
}

export function defineSnapshotScalarTrack<TSnapshot>(
  options: Omit<SnapshotPresentationScalarTrack<TSnapshot>, "kind">
): SnapshotPresentationScalarTrack<TSnapshot> {
  return { ...options, kind: "scalar" };
}

export function defineSnapshotAngleTrack<TSnapshot>(
  options: Omit<SnapshotPresentationAngleTrack<TSnapshot>, "kind">
): SnapshotPresentationAngleTrack<TSnapshot> {
  return { ...options, kind: "angle-radians" };
}

export function defineSnapshotVector2Track<TSnapshot>(
  options: Omit<SnapshotPresentationVector2Track<TSnapshot>, "kind">
): SnapshotPresentationVector2Track<TSnapshot> {
  return { ...options, kind: "vector2" };
}

export function defineSnapshotVector3Track<TSnapshot>(
  options: Omit<SnapshotPresentationVector3Track<TSnapshot>, "kind">
): SnapshotPresentationVector3Track<TSnapshot> {
  return { ...options, kind: "vector3" };
}

export function defineSnapshotQuaternionTrack<TSnapshot>(
  options: Omit<SnapshotPresentationQuaternionTrack<TSnapshot>, "kind">
): SnapshotPresentationQuaternionTrack<TSnapshot> {
  return { ...options, kind: "quaternion" };
}

export function defineSnapshotStepTrack<TSnapshot, TValue = unknown>(
  options: Omit<SnapshotPresentationStepTrack<TSnapshot, TValue>, "kind">
): SnapshotPresentationStepTrack<TSnapshot, TValue> {
  return { ...options, kind: "step" };
}

export function createSnapshotPresentationProjector<TSnapshot>(
  tracks: Iterable<SnapshotPresentationTrack<TSnapshot>>
): SnapshotPresentationProjector<TSnapshot> {
  const states = Array.from(tracks, createPresentationTrackState);
  const output = createPresentationOutputState();
  const presented = createPresentedSnapshotTracks(output.values);

  return {
    present(sample) {
      beginPresentationOutput(output);
      for (const state of states) {
        presentTrackValues(sample, state, output);
      }
      prunePresentationOutput(output);
      return presented;
    },
    reset() {
      resetPresentationOutput(output);
      for (const state of states) {
        resetTrackState(state);
      }
    }
  };
}

export function presentSnapshotTracks<TSnapshot>(
  sample: SnapshotBufferSample<TSnapshot>,
  tracks: Iterable<SnapshotPresentationTrack<TSnapshot>>
): PresentedSnapshotTracks {
  return createSnapshotPresentationProjector(tracks).present(sample);
}

type SnapshotPresentationOutputState = {
  values: Map<SnapshotPresentationKey, unknown>;
  activeKeys: Set<SnapshotPresentationKey>;
};

type SnapshotPresentationTrackFrameEntry<TValue> = SnapshotPresentationSampleOptions & {
  key: SnapshotPresentationKey;
  value: TValue;
};

type SnapshotPresentationTrackFrame<TValue> = {
  byKey: Map<SnapshotPresentationKey, SnapshotPresentationTrackFrameEntry<TValue>>;
  entries: Array<SnapshotPresentationTrackFrameEntry<TValue>>;
  length: number;
};

type SnapshotPresentationTrackState<TSnapshot, TValue> = {
  track: SnapshotPresentationTrackBase<TSnapshot, TValue>;
  operations: SnapshotPresentationTrackOperations<TValue>;
  previous: SnapshotPresentationTrackFrame<TValue>;
  next: SnapshotPresentationTrackFrame<TValue>;
  previousWriter: SnapshotPresentationTrackWriter<TValue>;
  nextWriter: SnapshotPresentationTrackWriter<TValue>;
};

type SnapshotPresentationTrackOperations<TValue> = {
  write(output: SnapshotPresentationOutputState, key: SnapshotPresentationKey, value: TValue): void;
  interpolate(
    output: SnapshotPresentationOutputState,
    key: SnapshotPresentationKey,
    previous: TValue,
    next: TValue,
    alpha: number
  ): void;
  shouldSnap?(
    previous: TValue,
    next: TValue,
    nextSample: SnapshotPresentationTrackFrameEntry<TValue>
  ): boolean;
};

function createPresentationTrackState<TSnapshot>(
  track: SnapshotPresentationTrack<TSnapshot>
): SnapshotPresentationTrackState<TSnapshot, unknown> {
  switch (track.kind) {
    case "scalar":
      return createTypedTrackState(
        track,
        scalarTrackOperations
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
    case "angle-radians":
      return createTypedTrackState(
        track,
        angleTrackOperations
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
    case "vector2":
      return createTypedTrackState(
        track,
        createVector2TrackOperations(track)
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
    case "vector3":
      return createTypedTrackState(
        track,
        createVector3TrackOperations(track)
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
    case "quaternion":
      return createTypedTrackState(
        track,
        quaternionTrackOperations
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
    case "step":
      return createTypedTrackState(
        track,
        createStepTrackOperations(track)
      ) as unknown as SnapshotPresentationTrackState<TSnapshot, unknown>;
  }
}

function createTypedTrackState<TSnapshot, TValue>(
  track: SnapshotPresentationTrackBase<TSnapshot, TValue>,
  operations: SnapshotPresentationTrackOperations<TValue>
): SnapshotPresentationTrackState<TSnapshot, TValue> {
  const previous = createTrackFrame<TValue>();
  const next = createTrackFrame<TValue>();
  return {
    track,
    operations,
    previous,
    next,
    previousWriter: createTrackFrameWriter(previous),
    nextWriter: createTrackFrameWriter(next)
  };
}

function presentTrackValues<TSnapshot, TValue>(
  sample: SnapshotBufferSample<TSnapshot>,
  state: SnapshotPresentationTrackState<TSnapshot, TValue>,
  output: SnapshotPresentationOutputState
): void {
  const previousSnapshot = sample.previous?.snapshot;
  const nextSnapshot = sample.next?.snapshot ?? previousSnapshot;
  if (nextSnapshot === undefined) {
    return;
  }

  if (previousSnapshot === undefined) {
    beginTrackFrame(state.previous);
  } else {
    selectTrackFrame(previousSnapshot, state.track, state.previous, state.previousWriter);
  }
  selectTrackFrame(nextSnapshot, state.track, state.next, state.nextWriter);

  for (let index = 0; index < state.next.length; index += 1) {
    const nextSample = state.next.entries[index];
    if (!nextSample) {
      continue;
    }

    const previousSample = state.previous.byKey.get(nextSample.key);
    let shouldSnap =
      previousSample === undefined ||
      nextSample.snap === true ||
      (previousSample !== undefined &&
        state.operations.shouldSnap?.(previousSample.value, nextSample.value, nextSample) === true);

    if (!shouldSnap && previousSample !== undefined && state.track.snap !== undefined) {
      shouldSnap =
        state.track.snap({
          key: nextSample.key,
          previous: previousSample.value,
          next: nextSample.value,
          alpha: sample.alpha,
          ...(previousSnapshot === undefined ? {} : { previousSnapshot }),
          nextSnapshot,
          sample
        }) === true;
    }

    if (shouldSnap || previousSample === undefined) {
      state.operations.write(output, nextSample.key, nextSample.value);
      continue;
    }

    state.operations.interpolate(
      output,
      nextSample.key,
      previousSample.value,
      nextSample.value,
      sample.alpha
    );
  }
}

function selectTrackFrame<TSnapshot, TValue>(
  snapshot: TSnapshot,
  track: SnapshotPresentationTrackBase<TSnapshot, TValue>,
  frame: SnapshotPresentationTrackFrame<TValue>,
  writer: SnapshotPresentationTrackWriter<TValue>
): void {
  beginTrackFrame(frame);
  if (track.selectInto !== undefined) {
    track.selectInto(snapshot, writer);
    return;
  }

  if (track.select === undefined) {
    return;
  }

  for (const sample of track.select(snapshot)) {
    writer.add(sample.key, sample.value, sample);
  }
}

function createPresentationOutputState(): SnapshotPresentationOutputState {
  return {
    values: new Map<SnapshotPresentationKey, unknown>(),
    activeKeys: new Set<SnapshotPresentationKey>()
  };
}

function beginPresentationOutput(output: SnapshotPresentationOutputState): void {
  output.activeKeys.clear();
}

function markPresentationOutputKey(
  output: SnapshotPresentationOutputState,
  key: SnapshotPresentationKey
): void {
  output.activeKeys.add(key);
}

function prunePresentationOutput(output: SnapshotPresentationOutputState): void {
  for (const key of output.values.keys()) {
    if (!output.activeKeys.has(key)) {
      output.values.delete(key);
    }
  }
}

function resetPresentationOutput(output: SnapshotPresentationOutputState): void {
  output.values.clear();
  output.activeKeys.clear();
}

function createTrackFrame<TValue>(): SnapshotPresentationTrackFrame<TValue> {
  return {
    byKey: new Map<SnapshotPresentationKey, SnapshotPresentationTrackFrameEntry<TValue>>(),
    entries: [],
    length: 0
  };
}

function createTrackFrameWriter<TValue>(
  frame: SnapshotPresentationTrackFrame<TValue>
): SnapshotPresentationTrackWriter<TValue> {
  return {
    add(key, value, options) {
      writeTrackFrameEntry(frame, key, value, options);
    }
  };
}

function beginTrackFrame<TValue>(frame: SnapshotPresentationTrackFrame<TValue>): void {
  frame.byKey.clear();
  frame.length = 0;
}

function writeTrackFrameEntry<TValue>(
  frame: SnapshotPresentationTrackFrame<TValue>,
  key: SnapshotPresentationKey,
  value: TValue,
  options: SnapshotPresentationSampleOptions | undefined
): void {
  let entry = frame.entries[frame.length];
  if (entry === undefined) {
    entry = { key, value };
    frame.entries.push(entry);
  } else {
    entry.key = key;
    entry.value = value;
  }

  if (options?.snap === undefined) {
    delete entry.snap;
  } else {
    entry.snap = options.snap;
  }
  if (options?.snapDistance === undefined) {
    delete entry.snapDistance;
  } else {
    entry.snapDistance = options.snapDistance;
  }

  frame.length += 1;
  frame.byKey.set(key, entry);
}

function resetTrackState<TSnapshot, TValue>(
  state: SnapshotPresentationTrackState<TSnapshot, TValue>
): void {
  beginTrackFrame(state.previous);
  beginTrackFrame(state.next);
}

function createPresentedSnapshotTracks(
  values: Map<SnapshotPresentationKey, unknown>
): PresentedSnapshotTracks {
  return {
    values,
    value(key, fallback) {
      return (values.has(key) ? values.get(key) : fallback) as typeof fallback;
    },
    scalar(key, fallback) {
      return readPresentedValue(values, key, fallback, isNumber, cloneScalar);
    },
    angleRadians(key, fallback) {
      return readPresentedValue(values, key, fallback, isNumber, cloneScalar);
    },
    vector2(key, fallback) {
      return readPresentedValue(values, key, fallback, isNetworkVector2, cloneVector2);
    },
    vector2Into(key, target, fallback) {
      return writePresentedValue(values, key, target, fallback, isNetworkVector2, writeVector2Into);
    },
    vector3(key, fallback) {
      return readPresentedValue(values, key, fallback, isNetworkVector3, cloneVector3);
    },
    vector3Into(key, target, fallback) {
      return writePresentedValue(values, key, target, fallback, isNetworkVector3, writeVector3Into);
    },
    quaternion(key, fallback) {
      return readPresentedValue(values, key, fallback, isNetworkQuaternion, cloneQuaternion);
    },
    quaternionInto(key, target, fallback) {
      return writePresentedValue(
        values,
        key,
        target,
        fallback,
        isNetworkQuaternion,
        writeQuaternionInto
      );
    }
  };
}

function readPresentedValue<TValue>(
  values: ReadonlyMap<SnapshotPresentationKey, unknown>,
  key: SnapshotPresentationKey,
  fallback: TValue,
  isValue: (value: unknown) => value is TValue,
  clone: (value: TValue) => TValue
): TValue {
  const value = values.get(key);
  return isValue(value) ? clone(value) : clone(fallback);
}

function writePresentedValue<TValue>(
  values: ReadonlyMap<SnapshotPresentationKey, unknown>,
  key: SnapshotPresentationKey,
  target: TValue,
  fallback: TValue,
  isValue: (value: unknown) => value is TValue,
  writeInto: (target: TValue, value: TValue) => TValue
): TValue {
  const value = values.get(key);
  return writeInto(target, isValue(value) ? value : fallback);
}

const scalarTrackOperations: SnapshotPresentationTrackOperations<NetworkScalar> = {
  write(output, key, value) {
    writeScalarOutput(output, key, value);
  },
  interpolate(output, key, previous, next, alpha) {
    writeScalarOutput(output, key, interpolateNumber(previous, next, alpha));
  }
};

const angleTrackOperations: SnapshotPresentationTrackOperations<NetworkAngleRadians> = {
  write(output, key, value) {
    writeScalarOutput(output, key, value);
  },
  interpolate(output, key, previous, next, alpha) {
    writeScalarOutput(output, key, interpolateAngleRadians(previous, next, alpha));
  }
};

const quaternionTrackOperations: SnapshotPresentationTrackOperations<NetworkQuaternion> = {
  write(output, key, value) {
    writeQuaternionOutput(output, key, value);
  },
  interpolate(output, key, previous, next, alpha) {
    writeQuaternionOutput(
      output,
      key,
      interpolateQuaternionInto(output.values.get(key), previous, next, alpha)
    );
  }
};

function createVector2TrackOperations<TSnapshot>(
  track: SnapshotPresentationVector2Track<TSnapshot>
): SnapshotPresentationTrackOperations<NetworkVector2> {
  return {
    write(output, key, value) {
      writeVector2Output(output, key, value);
    },
    interpolate(output, key, previous, next, alpha) {
      writeVector2Output(
        output,
        key,
        interpolateVector2Into(output.values.get(key), previous, next, alpha)
      );
    },
    shouldSnap(previous, next, nextSample) {
      const snapDistance = normalizeTrackSnapDistance(nextSample.snapDistance, track.snapDistance);
      return snapDistance !== undefined && distanceVector2(previous, next) >= snapDistance;
    }
  };
}

function createVector3TrackOperations<TSnapshot>(
  track: SnapshotPresentationVector3Track<TSnapshot>
): SnapshotPresentationTrackOperations<NetworkVector3> {
  return {
    write(output, key, value) {
      writeVector3Output(output, key, value);
    },
    interpolate(output, key, previous, next, alpha) {
      writeVector3Output(
        output,
        key,
        interpolateVector3Into(output.values.get(key), previous, next, alpha)
      );
    },
    shouldSnap(previous, next, nextSample) {
      const snapDistance = normalizeTrackSnapDistance(nextSample.snapDistance, track.snapDistance);
      return snapDistance !== undefined && distanceVector3(previous, next) >= snapDistance;
    }
  };
}

function createStepTrackOperations<TSnapshot, TValue>(
  track: SnapshotPresentationStepTrack<TSnapshot, TValue>
): SnapshotPresentationTrackOperations<TValue> {
  return {
    write(output, key, value) {
      output.values.set(key, value);
      markPresentationOutputKey(output, key);
    },
    interpolate(output, key, previous, next, alpha) {
      output.values.set(key, stepValue(previous, next, alpha, track.threshold));
      markPresentationOutputKey(output, key);
    }
  };
}

function writeScalarOutput(
  output: SnapshotPresentationOutputState,
  key: SnapshotPresentationKey,
  value: NetworkScalar
): void {
  output.values.set(key, value);
  markPresentationOutputKey(output, key);
}

function writeVector2Output(
  output: SnapshotPresentationOutputState,
  key: SnapshotPresentationKey,
  value: NetworkVector2
): void {
  output.values.set(key, copyVector2Into(output.values.get(key), value));
  markPresentationOutputKey(output, key);
}

function writeVector3Output(
  output: SnapshotPresentationOutputState,
  key: SnapshotPresentationKey,
  value: NetworkVector3
): void {
  output.values.set(key, copyVector3Into(output.values.get(key), value));
  markPresentationOutputKey(output, key);
}

function writeQuaternionOutput(
  output: SnapshotPresentationOutputState,
  key: SnapshotPresentationKey,
  value: NetworkQuaternion
): void {
  output.values.set(key, copyQuaternionInto(output.values.get(key), value));
  markPresentationOutputKey(output, key);
}

function cloneScalar(value: NetworkScalar): NetworkScalar {
  return value;
}

function cloneVector2(value: NetworkVector2): NetworkVector2 {
  return {
    x: value.x,
    y: value.y
  };
}

function cloneVector3(value: NetworkVector3): NetworkVector3 {
  return {
    x: value.x,
    y: value.y,
    z: value.z
  };
}

function cloneQuaternion(value: NetworkQuaternion): NetworkQuaternion {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
    w: value.w
  };
}

function copyVector2Into(target: unknown, value: NetworkVector2): NetworkVector2 {
  return writeVector2Into(isNetworkVector2(target) ? target : { x: 0, y: 0 }, value);
}

function copyVector3Into(target: unknown, value: NetworkVector3): NetworkVector3 {
  return writeVector3Into(isNetworkVector3(target) ? target : { x: 0, y: 0, z: 0 }, value);
}

function copyQuaternionInto(target: unknown, value: NetworkQuaternion): NetworkQuaternion {
  return writeQuaternionInto(
    isNetworkQuaternion(target) ? target : { x: 0, y: 0, z: 0, w: 1 },
    value
  );
}

function writeVector2Into(target: NetworkVector2, value: NetworkVector2): NetworkVector2 {
  target.x = value.x;
  target.y = value.y;
  return target;
}

function writeVector3Into(target: NetworkVector3, value: NetworkVector3): NetworkVector3 {
  target.x = value.x;
  target.y = value.y;
  target.z = value.z;
  return target;
}

function writeQuaternionInto(
  target: NetworkQuaternion,
  value: NetworkQuaternion
): NetworkQuaternion {
  target.x = value.x;
  target.y = value.y;
  target.z = value.z;
  target.w = value.w;
  return target;
}

function interpolateVector2Into(
  target: unknown,
  from: NetworkVector2,
  to: NetworkVector2,
  alpha: number
): NetworkVector2 {
  const output = isNetworkVector2(target) ? target : { x: 0, y: 0 };
  output.x = interpolateNumber(from.x, to.x, alpha);
  output.y = interpolateNumber(from.y, to.y, alpha);
  return output;
}

function interpolateVector3Into(
  target: unknown,
  from: NetworkVector3,
  to: NetworkVector3,
  alpha: number
): NetworkVector3 {
  const output = isNetworkVector3(target) ? target : { x: 0, y: 0, z: 0 };
  output.x = interpolateNumber(from.x, to.x, alpha);
  output.y = interpolateNumber(from.y, to.y, alpha);
  output.z = interpolateNumber(from.z, to.z, alpha);
  return output;
}

function interpolateQuaternionInto(
  target: unknown,
  from: NetworkQuaternion,
  to: NetworkQuaternion,
  alpha: number
): NetworkQuaternion {
  const output = isNetworkQuaternion(target) ? target : { x: 0, y: 0, z: 0, w: 1 };
  const amount = clamp01(alpha);
  let targetX = to.x;
  let targetY = to.y;
  let targetZ = to.z;
  let targetW = to.w;
  let cosine = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

  if (cosine < 0) {
    cosine = -cosine;
    targetX = -targetX;
    targetY = -targetY;
    targetZ = -targetZ;
    targetW = -targetW;
  }

  if (cosine > 0.9995) {
    output.x = interpolateNumber(from.x, targetX, amount);
    output.y = interpolateNumber(from.y, targetY, amount);
    output.z = interpolateNumber(from.z, targetZ, amount);
    output.w = interpolateNumber(from.w, targetW, amount);
    return normalizeQuaternionInto(output);
  }

  const theta = Math.acos(clamp(cosine, -1, 1));
  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) <= Number.EPSILON) {
    return writeQuaternionInto(output, from);
  }

  const weightFrom = Math.sin((1 - amount) * theta) / sinTheta;
  const weightTo = Math.sin(amount * theta) / sinTheta;
  output.x = from.x * weightFrom + targetX * weightTo;
  output.y = from.y * weightFrom + targetY * weightTo;
  output.z = from.z * weightFrom + targetZ * weightTo;
  output.w = from.w * weightFrom + targetW * weightTo;
  return output;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isNetworkVector2(value: unknown): value is NetworkVector2 {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isNetworkVector3(value: unknown): value is NetworkVector3 {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.z === "number"
  );
}

function isNetworkQuaternion(value: unknown): value is NetworkQuaternion {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.z === "number" &&
    typeof value.w === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTrackSnapDistance(
  sampleDistance: number | undefined,
  trackDistance: number | undefined
): number | undefined {
  const value = sampleDistance ?? trackDistance;
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, value);
}

function distanceVector2(previous: NetworkVector2, next: NetworkVector2): number {
  return Math.hypot(previous.x - next.x, previous.y - next.y);
}

function distanceVector3(previous: NetworkVector3, next: NetworkVector3): number {
  return Math.hypot(previous.x - next.x, previous.y - next.y, previous.z - next.z);
}

function sampleFrames<TSnapshot>(
  frames: Array<SnapshotBufferFrame<TSnapshot>>,
  timing: {
    renderTime: number;
    sampleTime: number;
    delayMs: number;
  }
): SnapshotBufferSample<TSnapshot> {
  if (frames.length === 0) {
    return {
      status: "empty",
      renderTime: timing.renderTime,
      sampleTime: timing.sampleTime,
      delayMs: timing.delayMs,
      alpha: 0,
      bufferLength: 0
    };
  }

  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last) {
    return {
      status: "empty",
      renderTime: timing.renderTime,
      sampleTime: timing.sampleTime,
      delayMs: timing.delayMs,
      alpha: 0,
      bufferLength: 0
    };
  }

  if (timing.sampleTime <= first.time) {
    return createSampleResult(
      timing,
      timing.sampleTime === first.time ? "exact" : "before-first",
      first,
      first,
      0,
      frames.length
    );
  }

  if (timing.sampleTime >= last.time) {
    return createSampleResult(
      timing,
      timing.sampleTime === last.time ? "exact" : "after-latest",
      last,
      last,
      0,
      frames.length
    );
  }

  for (let index = 0; index < frames.length - 1; index += 1) {
    const previous = frames[index];
    const next = frames[index + 1];
    if (!previous || !next) {
      continue;
    }
    if (timing.sampleTime === previous.time) {
      return createSampleResult(timing, "exact", previous, previous, 0, frames.length);
    }
    if (timing.sampleTime > previous.time && timing.sampleTime < next.time) {
      const span = next.time - previous.time;
      const alpha = span <= 0 ? 0 : (timing.sampleTime - previous.time) / span;
      return createSampleResult(timing, "interpolated", previous, next, alpha, frames.length);
    }
  }

  return createSampleResult(timing, "after-latest", last, last, 0, frames.length);
}

function createSampleResult<TSnapshot>(
  timing: {
    renderTime: number;
    sampleTime: number;
    delayMs: number;
  },
  status: SnapshotSampleStatus,
  previous: SnapshotBufferFrame<TSnapshot>,
  next: SnapshotBufferFrame<TSnapshot>,
  alpha: number,
  bufferLength: number
): SnapshotBufferSample<TSnapshot> {
  return {
    status,
    renderTime: timing.renderTime,
    sampleTime: timing.sampleTime,
    delayMs: timing.delayMs,
    alpha,
    previous: cloneFrame(previous),
    next: cloneFrame(next),
    snapshotAgeMs: Math.max(0, timing.renderTime - next.time),
    bufferLength
  };
}

function resolveSnapshotTime<TSnapshot>(
  entry: SnapshotBufferEntry<TSnapshot>,
  options: SnapshotBufferOptions<TSnapshot>
): number | undefined {
  const explicit = options.readTime?.(entry);
  if (explicit !== undefined) {
    return explicit;
  }

  switch (options.timeSource) {
    case "time":
      return entry.time;
    case "serverTime":
      return entry.serverTime;
    case "tick":
      return entry.tick;
    case "receivedAt":
      return entry.receivedAt;
    case "version":
      return typeof entry.version === "number" ? entry.version : undefined;
    default:
      return (
        entry.time ??
        entry.serverTime ??
        entry.tick ??
        entry.receivedAt ??
        (typeof entry.version === "number" ? entry.version : undefined)
      );
  }
}

function normalizeFrame<TSnapshot>(
  entry: SnapshotBufferEntry<TSnapshot>,
  time: number
): SnapshotBufferFrame<TSnapshot> {
  return {
    snapshot: entry.snapshot,
    time,
    ...(entry.serverTime === undefined ? {} : { serverTime: entry.serverTime }),
    ...(entry.tick === undefined ? {} : { tick: entry.tick }),
    ...(entry.version === undefined ? {} : { version: entry.version }),
    ...(entry.receivedAt === undefined ? {} : { receivedAt: entry.receivedAt })
  };
}

function insertFrame<TSnapshot>(
  frames: Array<SnapshotBufferFrame<TSnapshot>>,
  frame: SnapshotBufferFrame<TSnapshot>
): void {
  const insertAt = frames.findIndex((candidate) => candidate.time > frame.time);
  if (insertAt < 0) {
    frames.push(frame);
  } else {
    frames.splice(insertAt, 0, frame);
  }
}

function trimFrames<TSnapshot>(
  frames: Array<SnapshotBufferFrame<TSnapshot>>,
  options: {
    maxSnapshots: number;
    maxAgeMs: number;
    diagnostics: SnapshotBufferDiagnostics;
  }
): void {
  while (frames.length > options.maxSnapshots) {
    frames.shift();
    options.diagnostics.droppedSnapshots += 1;
  }

  const newestTime = frames.at(-1)?.time;
  if (newestTime === undefined || !Number.isFinite(options.maxAgeMs)) {
    return;
  }

  const minimumTime = newestTime - options.maxAgeMs;
  while (frames.length > 1 && (frames[0]?.time ?? newestTime) < minimumTime) {
    frames.shift();
    options.diagnostics.droppedSnapshots += 1;
  }
}

function cloneFrame<TSnapshot>(
  frame: SnapshotBufferFrame<TSnapshot>
): SnapshotBufferFrame<TSnapshot> {
  return {
    snapshot: frame.snapshot,
    time: frame.time,
    ...(frame.serverTime === undefined ? {} : { serverTime: frame.serverTime }),
    ...(frame.tick === undefined ? {} : { tick: frame.tick }),
    ...(frame.version === undefined ? {} : { version: frame.version }),
    ...(frame.receivedAt === undefined ? {} : { receivedAt: frame.receivedAt })
  };
}

function normalizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeMaxAgeMs(value: number | undefined): number {
  if (value === undefined || value === Number.POSITIVE_INFINITY || !Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, value);
}

function shortestAngleDeltaRadians(from: number, to: number): number {
  const fullTurn = Math.PI * 2;
  return ((((to - from) % fullTurn) + Math.PI * 3) % fullTurn) - Math.PI;
}

function normalizeQuaternion(quaternion: NetworkQuaternion): NetworkQuaternion {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (length <= Number.EPSILON) {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    };
  }

  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length
  };
}

function normalizeQuaternionInto(quaternion: NetworkQuaternion): NetworkQuaternion {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (length <= Number.EPSILON) {
    quaternion.x = 0;
    quaternion.y = 0;
    quaternion.z = 0;
    quaternion.w = 1;
    return quaternion;
  }

  quaternion.x /= length;
  quaternion.y /= length;
  quaternion.z /= length;
  quaternion.w /= length;
  return quaternion;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
