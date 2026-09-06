import { performance } from "node:perf_hooks";
import {
  createMultiplayerPredictionBuffer,
  createSnapshotPlayback,
  createSnapshotPresentationProjector,
  defineSnapshotVector2Track,
  type NetworkVector2
} from "../packages/multiplayer-core/src";

type StabilitySnapshot = {
  tick: number;
  positions: NetworkVector2[];
};

type StabilityState = {
  x: number;
  y: number;
};

const SIMULATED_MINUTES = 30;
const PRESENTATION_FPS = 60;
const SNAPSHOT_TPS = 20;
const TRACK_COUNT = 32;
const MAX_RETAINED_HEAP_GROWTH_BYTES = 16 * 1024 * 1024;
const MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES = 24 * 1024 * 1024;
const FRAME_DELTA_MS = 1000 / PRESENTATION_FPS;
const SNAPSHOT_INTERVAL_FRAMES = PRESENTATION_FPS / SNAPSHOT_TPS;
const SIMULATED_FRAMES = SIMULATED_MINUTES * 60 * PRESENTATION_FPS;
const SAMPLE_INTERVAL_FRAMES = 60 * PRESENTATION_FPS;
const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;

if (forceGc === undefined) {
  throw new Error("Multiplayer stability benchmark requires Node.js --expose-gc.");
}

const playback = createSnapshotPlayback<StabilitySnapshot>({
  interpolationDelayMs: 50,
  adaptiveDelay: {
    minDelayMs: 50,
    maxDelayMs: 150
  },
  maxSnapshots: 24,
  readTime(entry) {
    return entry.snapshot.tick * 50;
  }
});
const projector = createSnapshotPresentationProjector<StabilitySnapshot>([
  defineSnapshotVector2Track<StabilitySnapshot>({
    selectInto(snapshot, writer) {
      for (let index = 0; index < snapshot.positions.length; index += 1) {
        const position = snapshot.positions[index];
        if (position !== undefined) {
          writer.add(index, position);
        }
      }
    }
  })
]);
const prediction = createMultiplayerPredictionBuffer<StabilityState, StabilityState>({
  initialState: { x: 0, y: 0 },
  maxInputs: 240,
  predictionStepMs: 50,
  cloneState(state) {
    return { x: state.x, y: state.y };
  },
  applyInput(state, input) {
    state.x += input.x;
    state.y += input.y;
    return state;
  },
  presentState(from, to, context) {
    to.x = from.x + (to.x - from.x) * context.alpha;
    to.y = from.y + (to.y - from.y) * context.alpha;
    return to;
  },
  measureCorrection(previous, next) {
    return Math.hypot(previous.x - next.x, previous.y - next.y);
  }
});
const targets = Array.from({ length: TRACK_COUNT }, () => ({ x: 0, y: 0 }));
const fallback = { x: 0, y: 0 };
let latestSnapshot = createSnapshot(0);
let snapshotTick = 0;
let inputSequence = 0;
let timestamp = 0;
let checksum = 0;

for (let frame = 0; frame < PRESENTATION_FPS * 10; frame += 1) {
  runFrame(frame);
}
forceGc();
const baselineHeapBytes = process.memoryUsage().heapUsed;
let maxRetainedHeapBytes = baselineHeapBytes;
const start = performance.now();

for (let frame = 0; frame < SIMULATED_FRAMES; frame += 1) {
  runFrame(frame);
  if ((frame + 1) % SAMPLE_INTERVAL_FRAMES === 0) {
    forceGc();
    maxRetainedHeapBytes = Math.max(maxRetainedHeapBytes, process.memoryUsage().heapUsed);
  }
}

forceGc();
const durationMs = performance.now() - start;
const finalHeapBytes = process.memoryUsage().heapUsed;
const retainedHeapGrowthBytes = Math.max(0, finalHeapBytes - baselineHeapBytes);
const peakRetainedHeapGrowthBytes = Math.max(0, maxRetainedHeapBytes - baselineHeapBytes);
const playbackDiagnostics = playback.diagnostics();
const predictionDiagnostics = prediction.diagnostics();
const failures: string[] = [];

if (retainedHeapGrowthBytes > MAX_RETAINED_HEAP_GROWTH_BYTES) {
  failures.push("final retained heap growth exceeded 16 MiB");
}
if (peakRetainedHeapGrowthBytes > MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES) {
  failures.push("peak retained heap growth exceeded 24 MiB");
}
if (playbackDiagnostics.bufferLength > 24) {
  failures.push("snapshot playback buffer exceeded 24 entries");
}
if (predictionDiagnostics.pendingInputs > 240) {
  failures.push("prediction input buffer exceeded 240 entries");
}

console.log(
  JSON.stringify(
    {
      benchmark: "multiplayer-stability",
      simulatedMinutes: SIMULATED_MINUTES,
      presentationFps: PRESENTATION_FPS,
      snapshotTps: SNAPSHOT_TPS,
      trackCount: TRACK_COUNT,
      frames: SIMULATED_FRAMES,
      durationMs: round(durationMs),
      baselineHeapMiB: toMiB(baselineHeapBytes),
      finalHeapMiB: toMiB(finalHeapBytes),
      retainedHeapGrowthMiB: toMiB(retainedHeapGrowthBytes),
      peakRetainedHeapGrowthMiB: toMiB(peakRetainedHeapGrowthBytes),
      snapshotBufferLength: playbackDiagnostics.bufferLength,
      predictionPendingInputs: predictionDiagnostics.pendingInputs,
      interpolationDelayMs: round(playbackDiagnostics.interpolationDelayMs),
      estimatedJitterMs: round(playbackDiagnostics.estimatedJitterMs),
      checksum: round(checksum),
      passed: failures.length === 0,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exitCode = 1;
}

function runFrame(frame: number): void {
  timestamp += FRAME_DELTA_MS;
  if (frame % SNAPSHOT_INTERVAL_FRAMES === 0) {
    snapshotTick += 1;
    inputSequence += 1;
    latestSnapshot = createSnapshot(snapshotTick);
    prediction.predict({
      sequence: inputSequence,
      input: { x: 1, y: 2 },
      timestamp
    });
    if (inputSequence % 4 === 0) {
      const acknowledgedSequence = inputSequence - 2;
      prediction.reconcile({
        authoritativeState: {
          x: acknowledgedSequence,
          y: acknowledgedSequence * 2
        },
        acknowledgedSequence,
        timestamp
      });
    }
  }

  const sample = playback.present({ snapshot: latestSnapshot }, FRAME_DELTA_MS);
  const presented = projector.present(sample);
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    if (target !== undefined) {
      presented.vector2Into(index, target, fallback);
      checksum += target.x + target.y;
    }
  }
  const predicted = prediction.present({ deltaMs: FRAME_DELTA_MS, timestamp });
  checksum += predicted.x + predicted.y;
}

function createSnapshot(tick: number): StabilitySnapshot {
  return {
    tick,
    positions: Array.from({ length: TRACK_COUNT }, (_, index) => ({
      x: tick + index,
      y: tick * 2 + index
    }))
  };
}

function toMiB(bytes: number): number {
  return round(bytes / (1024 * 1024));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
