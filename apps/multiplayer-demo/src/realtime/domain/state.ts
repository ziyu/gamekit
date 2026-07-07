import type {
  RealtimeArenaBounds,
  RealtimeArenaCore,
  RealtimeArenaLayoutInput,
  RealtimeArenaPlayer,
  RealtimeArenaPlayerInput,
  RealtimeArenaRelayNode,
  RealtimeArenaRules,
  RealtimeArenaSnapshot,
  RealtimeArenaState,
  RealtimeArenaStateOptions,
  RealtimeArenaVector,
  RealtimeArenaWall
} from "./types";

export const DEFAULT_REALTIME_ARENA_RULES: RealtimeArenaRules = {
  countdownMs: 3000,
  roundDurationMs: 90000,
  endingDurationMs: 1400,
  scoreLimit: 5,
  playerRadius: 12,
  playerSpeedPerSecond: 130,
  sprintMultiplier: 1.75,
  sprintDurationMs: 260,
  sprintCooldownMs: 900,
  pickupRadius: 22,
  deliverRadius: 30,
  maxEvents: 32
};

const DEFAULT_BOUNDS: RealtimeArenaBounds = {
  width: 480,
  height: 320
};

const DEFAULT_SPAWN_POINTS: Record<string, RealtimeArenaVector> = {
  green: { x: 84, y: 160 },
  orange: { x: 396, y: 160 }
};

const DEFAULT_RELAY_NODES: RealtimeArenaRelayNode[] = [
  {
    id: "relay-green",
    teamId: "green",
    position: { x: 42, y: 160 },
    radius: 28
  },
  {
    id: "relay-orange",
    teamId: "orange",
    position: { x: 438, y: 160 },
    radius: 28
  }
];

const DEFAULT_CORES = [
  {
    id: "core-alpha",
    position: { x: 240, y: 160 },
    radius: 10
  }
];

const DEFAULT_WALLS: RealtimeArenaWall[] = [
  {
    id: "wall-north",
    x: 214,
    y: 78,
    width: 52,
    height: 32
  },
  {
    id: "wall-south",
    x: 214,
    y: 210,
    width: 52,
    height: 32
  }
];

export function createRealtimeArenaState(
  options: RealtimeArenaStateOptions = {}
): RealtimeArenaState {
  const rules: RealtimeArenaRules = {
    ...DEFAULT_REALTIME_ARENA_RULES,
    ...options.rules
  };
  const layout = options.layout ?? {};
  const bounds = cloneBounds(layout.bounds ?? DEFAULT_BOUNDS);
  const spawnPoints = cloneSpawnPoints(layout.spawnPoints ?? DEFAULT_SPAWN_POINTS);
  const relayNodes = cloneRelayNodes(layout.relayNodes ?? DEFAULT_RELAY_NODES);
  const cores = createCores(layout);
  const walls = cloneWalls(layout.walls ?? DEFAULT_WALLS);
  const score = createInitialScore(relayNodes);
  const state: RealtimeArenaState = {
    phase: "lobby",
    tick: 0,
    phaseElapsedMs: 0,
    roundElapsedMs: 0,
    nextEventId: 1,
    bounds,
    rules,
    spawnPoints,
    players: [],
    cores,
    relayNodes,
    walls,
    score,
    events: []
  };

  for (const player of options.players ?? []) {
    addInitialPlayer(state, player);
  }

  return state;
}

export function captureRealtimeArenaSnapshot(state: RealtimeArenaState): RealtimeArenaSnapshot {
  return {
    phase: state.phase,
    tick: state.tick,
    phaseElapsedMs: state.phaseElapsedMs,
    roundElapsedMs: state.roundElapsedMs,
    bounds: cloneBounds(state.bounds),
    rules: { ...state.rules },
    players: state.players.map((player) => ({
      id: player.id,
      label: player.label,
      teamId: player.teamId,
      slot: player.slot,
      ready: player.ready,
      connected: player.connected,
      spawn: cloneVector(player.spawn),
      position: cloneVector(player.position),
      velocity: cloneVector(player.velocity),
      lastInputSequence: player.lastInputSequence,
      sprintRemainingMs: player.sprintRemainingMs,
      sprintCooldownMs: player.sprintCooldownMs,
      deliveredCores: player.deliveredCores,
      rejectedInputs: player.rejectedInputs,
      ...(player.carryingCoreId === undefined ? {} : { carryingCoreId: player.carryingCoreId }),
      ...(player.latestInput === undefined ? {} : { latestInput: { ...player.latestInput } })
    })),
    cores: state.cores.map((core) => ({
      id: core.id,
      spawn: cloneVector(core.spawn),
      position: cloneVector(core.position),
      radius: core.radius,
      ...(core.carriedByPlayerId === undefined ? {} : { carriedByPlayerId: core.carriedByPlayerId })
    })),
    relayNodes: cloneRelayNodes(state.relayNodes),
    walls: cloneWalls(state.walls),
    score: { ...state.score },
    events: state.events.map((event) => ({ ...event })),
    ...(state.result === undefined
      ? {}
      : {
          result: {
            reason: state.result.reason,
            score: { ...state.result.score },
            durationMs: state.result.durationMs,
            ...(state.result.winnerTeamId === undefined
              ? {}
              : { winnerTeamId: state.result.winnerTeamId })
          }
        })
  };
}

export function addInitialPlayer(
  state: RealtimeArenaState,
  input: RealtimeArenaPlayerInput
): RealtimeArenaPlayer {
  const slot = nextAvailablePlayerSlot(state);
  const teamId = input.teamId ?? inferTeamForSlot(slot);
  const spawn = cloneVector(state.spawnPoints[teamId] ?? fallbackSpawn(state, slot));
  const player: RealtimeArenaPlayer = {
    id: input.id,
    label: input.label ?? input.id,
    teamId,
    slot,
    ready: false,
    connected: true,
    spawn: cloneVector(spawn),
    position: cloneVector(spawn),
    velocity: { x: 0, y: 0 },
    lastInputSequence: 0,
    pendingInteract: false,
    sprintRemainingMs: 0,
    sprintCooldownMs: 0,
    deliveredCores: 0,
    rejectedInputs: 0
  };

  state.players.push(player);
  state.score[teamId] ??= 0;
  return player;
}

export function resetRealtimeArenaPlayerRuntime(player: RealtimeArenaPlayer): void {
  player.ready = false;
  player.velocity = { x: 0, y: 0 };
  player.pendingInteract = false;
  player.sprintRemainingMs = 0;
  player.sprintCooldownMs = 0;
  delete player.carryingCoreId;
  delete player.latestInput;
}

export function resetRealtimeArenaPieces(state: RealtimeArenaState): void {
  for (const player of state.players) {
    player.ready = false;
    player.position = cloneVector(player.spawn);
    player.velocity = { x: 0, y: 0 };
    player.lastInputSequence = 0;
    player.pendingInteract = false;
    player.sprintRemainingMs = 0;
    player.sprintCooldownMs = 0;
    player.deliveredCores = 0;
    player.rejectedInputs = 0;
    delete player.carryingCoreId;
    delete player.latestInput;
  }
  resetRoundPieces(state);
}

export function resetRoundPieces(state: RealtimeArenaState): void {
  for (const teamId of Object.keys(state.score)) {
    state.score[teamId] = 0;
  }
  for (const player of state.players) {
    player.position = cloneVector(player.spawn);
    player.velocity = { x: 0, y: 0 };
    player.pendingInteract = false;
    player.sprintRemainingMs = 0;
    player.sprintCooldownMs = 0;
    player.deliveredCores = 0;
    delete player.carryingCoreId;
  }
  for (const core of state.cores) {
    core.position = cloneVector(core.spawn);
    delete core.carriedByPlayerId;
  }
}

function createCores(layout: RealtimeArenaLayoutInput): RealtimeArenaCore[] {
  return (layout.cores ?? DEFAULT_CORES).map((core) => ({
    id: core.id,
    spawn: cloneVector(core.position),
    position: cloneVector(core.position),
    radius: core.radius ?? 10
  }));
}

function createInitialScore(relayNodes: RealtimeArenaRelayNode[]): Record<string, number> {
  const score: Record<string, number> = {};
  for (const relay of relayNodes) {
    score[relay.teamId] = 0;
  }
  return score;
}

function cloneSpawnPoints(
  spawnPoints: Record<string, RealtimeArenaVector>
): Record<string, RealtimeArenaVector> {
  const cloned: Record<string, RealtimeArenaVector> = {};
  for (const [teamId, point] of Object.entries(spawnPoints)) {
    cloned[teamId] = cloneVector(point);
  }
  return cloned;
}

function cloneRelayNodes(relayNodes: RealtimeArenaRelayNode[]): RealtimeArenaRelayNode[] {
  return relayNodes.map((relay) => ({
    id: relay.id,
    teamId: relay.teamId,
    position: cloneVector(relay.position),
    radius: relay.radius
  }));
}

function cloneWalls(walls: RealtimeArenaWall[]): RealtimeArenaWall[] {
  return walls.map((wall) => ({ ...wall }));
}

function cloneBounds(bounds: RealtimeArenaBounds): RealtimeArenaBounds {
  return { ...bounds };
}

function cloneVector(vector: RealtimeArenaVector): RealtimeArenaVector {
  return { ...vector };
}

function nextAvailablePlayerSlot(state: RealtimeArenaState): number {
  const usedSlots = new Set(state.players.map((player) => player.slot));
  let slot = 0;
  while (usedSlots.has(slot)) {
    slot += 1;
  }
  return slot;
}

function inferTeamForSlot(slot: number): string {
  return slot % 2 === 0 ? "green" : "orange";
}

function fallbackSpawn(state: RealtimeArenaState, slot: number): RealtimeArenaVector {
  const offset = slot * 18;
  return {
    x: Math.min(state.bounds.width - 32, 32 + offset),
    y: Math.min(state.bounds.height - 32, 32 + offset)
  };
}
