export type RealtimeArenaPhase = "lobby" | "countdown" | "running" | "ending" | "results";

export type RealtimeArenaVector = {
  x: number;
  y: number;
};

export type RealtimeArenaBounds = {
  width: number;
  height: number;
};

export type RealtimeArenaRules = {
  countdownMs: number;
  roundDurationMs: number;
  endingDurationMs: number;
  scoreLimit: number;
  playerRadius: number;
  playerSpeedPerSecond: number;
  sprintMultiplier: number;
  sprintDurationMs: number;
  sprintCooldownMs: number;
  pickupRadius: number;
  deliverRadius: number;
  maxEvents: number;
};

export type RealtimeArenaWall = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RealtimeArenaRelayNode = {
  id: string;
  teamId: string;
  position: RealtimeArenaVector;
  radius: number;
};

export type RealtimeArenaCore = {
  id: string;
  spawn: RealtimeArenaVector;
  position: RealtimeArenaVector;
  radius: number;
  carriedByPlayerId?: string;
};

export type RealtimeInputFrame = {
  sequence: number;
  clientTime: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  sprint: boolean;
  interact: boolean;
};

export type RealtimeArenaPlayer = {
  id: string;
  label: string;
  teamId: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  spawn: RealtimeArenaVector;
  position: RealtimeArenaVector;
  velocity: RealtimeArenaVector;
  lastInputSequence: number;
  pendingInteract: boolean;
  sprintRemainingMs: number;
  sprintCooldownMs: number;
  deliveredCores: number;
  rejectedInputs: number;
  carryingCoreId?: string;
  latestInput?: RealtimeInputFrame;
};

export type RealtimeRoundResult = {
  reason: "score-limit" | "time-limit" | "draw";
  score: Record<string, number>;
  durationMs: number;
  winnerTeamId?: string;
};

export type RealtimeArenaEvent = {
  id: number;
  tick: number;
  type:
    | "player.joined"
    | "player.left"
    | "player.name"
    | "player.ready"
    | "round.countdown"
    | "round.started"
    | "round.ending"
    | "round.results"
    | "round.rematch"
    | "core.picked"
    | "core.delivered"
    | "input.rejected";
  playerId?: string;
  teamId?: string;
  coreId?: string;
  code?: string;
  label: string;
};

export type RealtimeArenaState = {
  phase: RealtimeArenaPhase;
  tick: number;
  phaseElapsedMs: number;
  roundElapsedMs: number;
  nextEventId: number;
  bounds: RealtimeArenaBounds;
  rules: RealtimeArenaRules;
  spawnPoints: Record<string, RealtimeArenaVector>;
  players: RealtimeArenaPlayer[];
  cores: RealtimeArenaCore[];
  relayNodes: RealtimeArenaRelayNode[];
  walls: RealtimeArenaWall[];
  score: Record<string, number>;
  events: RealtimeArenaEvent[];
  result?: RealtimeRoundResult;
};

export type RealtimeArenaPlayerInput = {
  id: string;
  label?: string;
  teamId?: string;
};

export type RealtimeArenaCoreInput = {
  id: string;
  position: RealtimeArenaVector;
  radius?: number;
};

export type RealtimeArenaLayoutInput = {
  bounds?: RealtimeArenaBounds;
  spawnPoints?: Record<string, RealtimeArenaVector>;
  relayNodes?: RealtimeArenaRelayNode[];
  cores?: RealtimeArenaCoreInput[];
  walls?: RealtimeArenaWall[];
};

export type RealtimeArenaStateOptions = {
  rules?: Partial<RealtimeArenaRules>;
  layout?: RealtimeArenaLayoutInput;
  players?: RealtimeArenaPlayerInput[];
};

export type RealtimeArenaActionResult =
  | { accepted: true }
  | { accepted: false; code: string; reason: string };

export type RealtimeArenaSnapshot = {
  phase: RealtimeArenaPhase;
  tick: number;
  phaseElapsedMs: number;
  roundElapsedMs: number;
  bounds: RealtimeArenaBounds;
  rules: RealtimeArenaRules;
  players: Array<
    Omit<RealtimeArenaPlayer, "latestInput" | "pendingInteract"> & {
      latestInput?: RealtimeInputFrame;
    }
  >;
  cores: RealtimeArenaCore[];
  relayNodes: RealtimeArenaRelayNode[];
  walls: RealtimeArenaWall[];
  score: Record<string, number>;
  events: RealtimeArenaEvent[];
  result?: RealtimeRoundResult;
};
