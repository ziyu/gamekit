import { performance } from "node:perf_hooks";
import {
  createSnapshotPlayback,
  createSnapshotPresentationProjector,
  defineSnapshotVector2Track,
  type NetworkVector2,
  type PresentedSnapshotTracks
} from "../packages/multiplayer-core/src";

type BenchmarkSnapshot = {
  tick: number;
  positions: NetworkVector2[];
};

const CASES = [100, 1_000, 5_000];
const TRACK_WRITES_PER_CASE = 1_000_000;
const TICK_MS = 50;

const results = CASES.map(runCase);

console.log(
  JSON.stringify(
    {
      projector: "@gamekit/multiplayer-core",
      cases: results
    },
    null,
    2
  )
);

function runCase(trackCount: number) {
  const frames = Math.max(120, Math.floor(TRACK_WRITES_PER_CASE / trackCount));
  const warmupFrames = Math.min(120, frames);
  const previous = createSnapshot(trackCount, 0, 0);
  const next = createSnapshot(trackCount, 1, 10);
  const playback = createSnapshotPlayback<BenchmarkSnapshot>({
    interpolationDelayMs: 0,
    readTime(entry) {
      return entry.snapshot.tick * TICK_MS;
    }
  });
  const projector = createSnapshotPresentationProjector<BenchmarkSnapshot>([
    defineSnapshotVector2Track<BenchmarkSnapshot>({
      selectInto(snapshot, writer) {
        for (let index = 0; index < snapshot.positions.length; index += 1) {
          const position = snapshot.positions[index];
          if (position) {
            writer.add(index, position);
          }
        }
      }
    })
  ]);
  const targets = Array.from({ length: trackCount }, () => ({ x: 0, y: 0 }));
  const fallback = { x: 0, y: 0 };

  playback.present({ snapshot: previous }, 0);
  const sample = playback.present({ snapshot: next }, TICK_MS / 2);

  for (let frame = 0; frame < warmupFrames; frame += 1) {
    projectAndWrite(projector.present(sample), targets, fallback);
  }

  const start = performance.now();
  let checksum = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    checksum += projectAndWrite(projector.present(sample), targets, fallback);
  }
  const durationMs = performance.now() - start;
  const writes = frames * trackCount;

  return {
    trackCount,
    frames,
    writes,
    durationMs: round(durationMs),
    msPerFrame: round(durationMs / frames),
    microsecondsPerTrackWrite: round((durationMs * 1000) / writes),
    checksum: round(checksum)
  };
}

function createSnapshot(trackCount: number, tick: number, offset: number): BenchmarkSnapshot {
  return {
    tick,
    positions: Array.from({ length: trackCount }, (_, index) => ({
      x: index + offset,
      y: index * 0.5 + offset
    }))
  };
}

function projectAndWrite(
  presented: PresentedSnapshotTracks,
  targets: NetworkVector2[],
  fallback: NetworkVector2
): number {
  let checksum = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    if (!target) {
      continue;
    }
    presented.vector2Into(index, target, fallback);
    checksum += target.x;
  }
  return checksum;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
