import type { RealtimeArenaPhase, RealtimeArenaSnapshot, RealtimeArenaVector } from "./domain";

export type RealtimeArenaPresentation = {
  reset(): void;
  present(snapshot: RealtimeArenaSnapshot, deltaMs: number): RealtimeArenaSnapshot;
};

export type RealtimeArenaPresentationOptions = {
  smoothingMs?: number;
  snapDistance?: number;
};

type PresentedVector = {
  x: number;
  y: number;
};

const DEFAULT_SMOOTHING_MS = 72;
const DEFAULT_SNAP_DISTANCE = 96;

export function createRealtimeArenaPresentation(
  options: RealtimeArenaPresentationOptions = {}
): RealtimeArenaPresentation {
  const smoothingMs = Math.max(1, options.smoothingMs ?? DEFAULT_SMOOTHING_MS);
  const snapDistance = Math.max(0, options.snapDistance ?? DEFAULT_SNAP_DISTANCE);
  const positions = new Map<string, PresentedVector>();
  let lastTick: number | undefined;
  let lastPhase: RealtimeArenaPhase | undefined;

  function reset(): void {
    positions.clear();
    lastTick = undefined;
    lastPhase = undefined;
  }

  return {
    reset,
    present(snapshot, deltaMs) {
      if (
        lastTick !== undefined &&
        (snapshot.tick < lastTick || shouldSnapPhase(lastPhase, snapshot.phase))
      ) {
        positions.clear();
      }

      lastTick = snapshot.tick;
      lastPhase = snapshot.phase;

      const activeKeys = new Set<string>();
      const players = snapshot.players.map((player) => {
        const key = `player:${player.id}`;
        activeKeys.add(key);
        return {
          ...player,
          spawn: { ...player.spawn },
          position: presentVector(positions, key, player.position, deltaMs, {
            smoothingMs,
            snapDistance
          }),
          velocity: { ...player.velocity },
          ...(player.latestInput === undefined ? {} : { latestInput: { ...player.latestInput } })
        };
      });
      const playersById = new Map(players.map((player) => [player.id, player]));
      const cores = snapshot.cores.map((core) => {
        const carriedByPlayer =
          core.carriedByPlayerId === undefined
            ? undefined
            : playersById.get(core.carriedByPlayerId);
        const key = `core:${core.id}`;
        activeKeys.add(key);
        const position =
          carriedByPlayer === undefined
            ? presentVector(positions, key, core.position, deltaMs, {
                smoothingMs,
                snapDistance
              })
            : { ...carriedByPlayer.position };

        return {
          ...core,
          spawn: { ...core.spawn },
          position
        };
      });

      removeInactivePositions(positions, activeKeys);

      return {
        ...snapshot,
        bounds: { ...snapshot.bounds },
        rules: { ...snapshot.rules },
        players,
        cores,
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
  };
}

function presentVector(
  positions: Map<string, PresentedVector>,
  key: string,
  target: RealtimeArenaVector,
  deltaMs: number,
  options: Required<RealtimeArenaPresentationOptions>
): RealtimeArenaVector {
  const current = positions.get(key);
  if (current === undefined || distance(current, target) >= options.snapDistance || deltaMs <= 0) {
    const snapped = { ...target };
    positions.set(key, snapped);
    return { ...snapped };
  }

  const amount = 1 - Math.exp(-deltaMs / options.smoothingMs);
  const next = {
    x: lerp(current.x, target.x, amount),
    y: lerp(current.y, target.y, amount)
  };
  positions.set(key, next);
  return { ...next };
}

function removeInactivePositions(
  positions: Map<string, PresentedVector>,
  activeKeys: Set<string>
): void {
  for (const key of positions.keys()) {
    if (!activeKeys.has(key)) {
      positions.delete(key);
    }
  }
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

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, amount));
}

function distance(a: RealtimeArenaVector, b: RealtimeArenaVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
