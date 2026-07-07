import {
  createRealtimeArenaState,
  joinRealtimeArenaPlayer,
  type RealtimeArenaLayoutInput,
  type RealtimeArenaPlayerInput,
  type RealtimeArenaRules,
  type RealtimeArenaState
} from "./domain";

export const REALTIME_ARENA_TICK_MS = 50;

export const REALTIME_ARENA_RULES: Partial<RealtimeArenaRules> = {
  countdownMs: 1800,
  roundDurationMs: 60000,
  endingDurationMs: 1500,
  scoreLimit: 3,
  playerRadius: 13,
  playerSpeedPerSecond: 155,
  sprintMultiplier: 1.8,
  sprintDurationMs: 240,
  sprintCooldownMs: 820,
  pickupRadius: 24,
  deliverRadius: 30,
  maxEvents: 18
};

export const REALTIME_ARENA_LAYOUT: RealtimeArenaLayoutInput = {
  bounds: { width: 720, height: 420 },
  spawnPoints: {
    green: { x: 110, y: 210 },
    orange: { x: 610, y: 210 }
  },
  relayNodes: [
    {
      id: "relay-green",
      teamId: "green",
      position: { x: 64, y: 210 },
      radius: 34
    },
    {
      id: "relay-orange",
      teamId: "orange",
      position: { x: 656, y: 210 },
      radius: 34
    }
  ],
  cores: [
    {
      id: "core-alpha",
      position: { x: 360, y: 158 },
      radius: 10
    },
    {
      id: "core-beta",
      position: { x: 360, y: 262 },
      radius: 10
    }
  ],
  walls: [
    { id: "wall-northwest", x: 224, y: 88, width: 58, height: 68 },
    { id: "wall-southwest", x: 224, y: 264, width: 58, height: 68 },
    { id: "wall-northeast", x: 438, y: 88, width: 58, height: 68 },
    { id: "wall-southeast", x: 438, y: 264, width: 58, height: 68 },
    { id: "wall-center", x: 338, y: 194, width: 44, height: 32 }
  ]
};

export function createRealtimePracticeArenaState(
  players: RealtimeArenaPlayerInput[] = []
): RealtimeArenaState {
  const state = createRealtimeArenaState({
    layout: REALTIME_ARENA_LAYOUT,
    rules: REALTIME_ARENA_RULES
  });

  for (const player of players) {
    joinRealtimeArenaPlayer(state, player);
  }

  return state;
}
