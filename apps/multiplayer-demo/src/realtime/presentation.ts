import {
  createSnapshotPresentationProjector,
  createSnapshotPlayback,
  defineSnapshotVector2Track,
  stepValue,
  type PresentedSnapshotTracks,
  type SnapshotPlaybackDiagnostics,
  type SnapshotPlaybackSample,
  type SnapshotPresentationTrack
} from "@gamekit/multiplayer-core";
import { REALTIME_ARENA_TICK_MS } from "./config";
import type { RealtimeArenaPhase, RealtimeArenaSnapshot } from "./domain";

export type RealtimeArenaPresentation = {
  reset(): void;
  present(snapshot: RealtimeArenaSnapshot, deltaMs: number): RealtimeArenaSnapshot;
  diagnostics(): RealtimeArenaPresentationDiagnostics;
};

export type RealtimeArenaPresentationOptions = {
  interpolationDelayMs?: number;
  snapDistance?: number;
  maxSnapshots?: number;
};

export type RealtimeArenaPresentationDiagnostics = SnapshotPlaybackDiagnostics;

const DEFAULT_INTERPOLATION_DELAY_MS = 100;
const DEFAULT_SNAP_DISTANCE = 96;

export function createRealtimeArenaPresentation(
  options: RealtimeArenaPresentationOptions = {}
): RealtimeArenaPresentation {
  const snapDistance = options.snapDistance ?? DEFAULT_SNAP_DISTANCE;
  const tracks = createArenaPresentationTracks(snapDistance);
  const projector = createSnapshotPresentationProjector(tracks);
  const playback = createSnapshotPlayback<RealtimeArenaSnapshot>({
    interpolationDelayMs: options.interpolationDelayMs ?? DEFAULT_INTERPOLATION_DELAY_MS,
    maxSnapshots: options.maxSnapshots ?? 24,
    timeSource: "tick",
    readTime(entry) {
      return entry.snapshot.tick * REALTIME_ARENA_TICK_MS;
    },
    shouldReset(previous, next) {
      return (
        previous !== undefined &&
        (next.tick < previous.tick || shouldSnapPhase(previous.phase, next.phase))
      );
    }
  });

  return {
    reset() {
      playback.reset();
      projector.reset();
    },
    present(snapshot, deltaMs) {
      const sample = playback.present(
        {
          snapshot,
          tick: snapshot.tick,
          time: snapshot.tick * REALTIME_ARENA_TICK_MS
        },
        deltaMs
      );
      return projectArenaSnapshot(sample, snapshot, projector.present(sample));
    },
    diagnostics() {
      return playback.diagnostics();
    }
  };
}

function projectArenaSnapshot(
  sample: SnapshotPlaybackSample<RealtimeArenaSnapshot>,
  fallback: RealtimeArenaSnapshot,
  presented: PresentedSnapshotTracks
): RealtimeArenaSnapshot {
  const previous = sample.previous?.snapshot;
  const next = sample.next?.snapshot ?? previous ?? fallback;
  if (!previous || sample.status === "empty") {
    return cloneArenaSnapshot(next);
  }

  const discrete = stepValue(previous, next, sample.alpha);
  const players = next.players.map((player) => {
    return {
      ...player,
      spawn: { ...player.spawn },
      position: presented.vector2(playerKey(player.id), player.position),
      velocity: { ...player.velocity },
      ...(player.latestInput === undefined ? {} : { latestInput: { ...player.latestInput } })
    };
  });
  const playersById = new Map(players.map((player) => [player.id, player]));
  const cores = next.cores.map((core) => {
    const carriedByPlayer =
      core.carriedByPlayerId === undefined ? undefined : playersById.get(core.carriedByPlayerId);

    return {
      ...core,
      spawn: { ...core.spawn },
      position:
        carriedByPlayer === undefined
          ? presented.vector2(coreKey(core.id), core.position)
          : { ...carriedByPlayer.position }
    };
  });

  return {
    ...discrete,
    bounds: { ...discrete.bounds },
    rules: { ...discrete.rules },
    players,
    cores,
    relayNodes: discrete.relayNodes.map((relay) => ({
      ...relay,
      position: { ...relay.position }
    })),
    walls: discrete.walls.map((wall) => ({ ...wall })),
    score: { ...discrete.score },
    events: discrete.events.map((event) => ({ ...event })),
    ...(discrete.result === undefined
      ? {}
      : {
          result: {
            ...discrete.result,
            score: { ...discrete.result.score }
          }
        })
  };
}

function cloneArenaSnapshot(snapshot: RealtimeArenaSnapshot): RealtimeArenaSnapshot {
  return {
    ...snapshot,
    bounds: { ...snapshot.bounds },
    rules: { ...snapshot.rules },
    players: snapshot.players.map((player) => ({
      ...player,
      spawn: { ...player.spawn },
      position: { ...player.position },
      velocity: { ...player.velocity },
      ...(player.latestInput === undefined ? {} : { latestInput: { ...player.latestInput } })
    })),
    cores: snapshot.cores.map((core) => ({
      ...core,
      spawn: { ...core.spawn },
      position: { ...core.position }
    })),
    relayNodes: snapshot.relayNodes.map((relay) => ({
      ...relay,
      position: { ...relay.position }
    })),
    walls: snapshot.walls.map((wall) => ({ ...wall })),
    score: { ...snapshot.score },
    events: snapshot.events.map((event) => ({ ...event })),
    ...(snapshot.result === undefined
      ? {}
      : {
          result: {
            ...snapshot.result,
            score: { ...snapshot.result.score }
          }
        })
  };
}

function createArenaPresentationTracks(
  snapDistance: number
): Array<SnapshotPresentationTrack<RealtimeArenaSnapshot>> {
  return [
    defineSnapshotVector2Track<RealtimeArenaSnapshot>({
      snapDistance,
      selectInto(snapshot, writer) {
        for (const player of snapshot.players) {
          writer.add(playerKey(player.id), player.position);
        }
      }
    }),
    defineSnapshotVector2Track<RealtimeArenaSnapshot>({
      snapDistance,
      selectInto(snapshot, writer) {
        for (const core of snapshot.cores) {
          if (core.carriedByPlayerId === undefined) {
            writer.add(coreKey(core.id), core.position);
          }
        }
      }
    })
  ];
}

function shouldSnapPhase(
  previous: RealtimeArenaPhase | undefined,
  next: RealtimeArenaPhase
): boolean {
  if (previous === undefined || previous === next) {
    return false;
  }

  return next === "lobby" || next === "countdown" || previous === "results";
}

function playerKey(playerId: string): string {
  return `player:${playerId}:position`;
}

function coreKey(coreId: string): string {
  return `core:${coreId}:position`;
}
