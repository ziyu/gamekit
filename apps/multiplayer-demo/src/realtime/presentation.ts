import {
  createMultiplayerSnapshotPresentation,
  type MultiplayerPresentationVector
} from "@gamekit/multiplayer-core";
import type { RealtimeArenaPhase, RealtimeArenaSnapshot } from "./domain";

export type RealtimeArenaPresentation = {
  reset(): void;
  present(snapshot: RealtimeArenaSnapshot, deltaMs: number): RealtimeArenaSnapshot;
};

export type RealtimeArenaPresentationOptions = {
  smoothingMs?: number;
  snapDistance?: number;
};

const DEFAULT_SMOOTHING_MS = 72;
const DEFAULT_SNAP_DISTANCE = 96;

export function createRealtimeArenaPresentation(
  options: RealtimeArenaPresentationOptions = {}
): RealtimeArenaPresentation {
  const presentation = createMultiplayerSnapshotPresentation<RealtimeArenaSnapshot>({
    smoothingMs: options.smoothingMs ?? DEFAULT_SMOOTHING_MS,
    snapDistance: options.snapDistance ?? DEFAULT_SNAP_DISTANCE,
    shouldReset(previous, next) {
      return (
        previous !== undefined &&
        (next.tick < previous.tick || shouldSnapPhase(previous.phase, next.phase))
      );
    },
    selectSamples(snapshot) {
      return [
        ...snapshot.players.map((player) => ({
          key: playerKey(player.id),
          target: player.position
        })),
        ...snapshot.cores
          .filter((core) => core.carriedByPlayerId === undefined)
          .map((core) => ({
            key: coreKey(core.id),
            target: core.position
          }))
      ];
    },
    applyPresentedSnapshot({ snapshot, presented }) {
      const players = snapshot.players.map((player) => ({
        ...player,
        spawn: { ...player.spawn },
        position: readPresentedPosition(presented, playerKey(player.id), player.position),
        velocity: { ...player.velocity },
        ...(player.latestInput === undefined ? {} : { latestInput: { ...player.latestInput } })
      }));
      const playersById = new Map(players.map((player) => [player.id, player]));
      const cores = snapshot.cores.map((core) => {
        const carriedByPlayer =
          core.carriedByPlayerId === undefined
            ? undefined
            : playersById.get(core.carriedByPlayerId);

        return {
          ...core,
          spawn: { ...core.spawn },
          position:
            carriedByPlayer === undefined
              ? readPresentedPosition(presented, coreKey(core.id), core.position)
              : { ...carriedByPlayer.position }
        };
      });

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
  });

  return {
    reset() {
      presentation.reset();
    },
    present(snapshot, deltaMs) {
      return presentation.present(snapshot, deltaMs);
    }
  };
}

function readPresentedPosition(
  presented: ReadonlyMap<string, MultiplayerPresentationVector>,
  key: string,
  fallback: MultiplayerPresentationVector
): MultiplayerPresentationVector {
  return { ...(presented.get(key) ?? fallback) };
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
  return `player:${playerId}`;
}

function coreKey(coreId: string): string {
  return `core:${coreId}`;
}
