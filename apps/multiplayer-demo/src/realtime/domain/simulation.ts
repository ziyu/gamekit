import {
  addInitialPlayer,
  assignRealtimeArenaPlayerLabel,
  resetRealtimeArenaPieces,
  resetRealtimeArenaPlayerRuntime,
  resetRoundPieces
} from "./state";
import type {
  RealtimeArenaActionResult,
  RealtimeArenaCore,
  RealtimeArenaEvent,
  RealtimeArenaPlayer,
  RealtimeArenaPlayerInput,
  RealtimeArenaState,
  RealtimeArenaVector,
  RealtimeArenaWall,
  RealtimeInputFrame,
  RealtimeRoundResult
} from "./types";

const ACCEPTED: RealtimeArenaActionResult = { accepted: true };
const NEUTRAL_INPUT: RealtimeInputFrame = {
  sequence: 0,
  clientTime: 0,
  moveX: 0,
  moveY: 0,
  sprint: false,
  interact: false
};

export function joinRealtimeArenaPlayer(
  state: RealtimeArenaState,
  input: RealtimeArenaPlayerInput
): RealtimeArenaActionResult {
  if (state.phase !== "lobby") {
    return reject("round-not-in-lobby", "Players can only join the realtime arena lobby.");
  }
  if (state.players.some((player) => player.id === input.id)) {
    return reject("duplicate-player", `Player already joined: ${input.id}`);
  }

  const player = addInitialPlayer(state, input);
  recordRealtimeArenaEvent(state, {
    type: "player.joined",
    playerId: player.id,
    teamId: player.teamId,
    label: `${player.label} joined`
  });
  return ACCEPTED;
}

export function setRealtimeArenaPlayerReady(
  state: RealtimeArenaState,
  playerId: string,
  ready: boolean
): RealtimeArenaActionResult {
  if (state.phase !== "lobby") {
    return reject("round-not-in-lobby", "Ready state can only change in the lobby.");
  }

  const player = findPlayer(state, playerId);
  if (!player) {
    return reject("unknown-player", `Unknown player: ${playerId}`);
  }

  player.ready = ready;
  recordRealtimeArenaEvent(state, {
    type: "player.ready",
    playerId,
    teamId: player.teamId,
    label: `${player.label} ${ready ? "ready" : "not ready"}`
  });
  return ACCEPTED;
}

export function setRealtimeArenaPlayerName(
  state: RealtimeArenaState,
  playerId: string,
  name: string
): RealtimeArenaActionResult {
  const player = findPlayer(state, playerId);
  if (!player) {
    return reject("unknown-player", `Unknown player: ${playerId}`);
  }

  const previousLabel = player.label;
  const nextLabel = assignRealtimeArenaPlayerLabel(state, player, name);
  if (nextLabel !== previousLabel) {
    recordRealtimeArenaEvent(state, {
      type: "player.name",
      playerId,
      teamId: player.teamId,
      label: `${previousLabel} is now ${nextLabel}`
    });
  }

  return ACCEPTED;
}

export function removeRealtimeArenaPlayer(
  state: RealtimeArenaState,
  playerId: string
): RealtimeArenaActionResult {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) {
    return reject("unknown-player", `Unknown player: ${playerId}`);
  }

  const [player] = state.players.splice(playerIndex, 1);
  if (!player) {
    return reject("unknown-player", `Unknown player: ${playerId}`);
  }

  releasePlayerCore(state, player);
  resetRealtimeArenaPlayerRuntime(player);
  recordRealtimeArenaEvent(state, {
    type: "player.left",
    playerId: player.id,
    teamId: player.teamId,
    label: `${player.label} left`
  });

  if (state.players.length === 0 && state.phase !== "lobby") {
    state.phase = "lobby";
    state.phaseElapsedMs = 0;
    state.roundElapsedMs = 0;
    resetRoundPieces(state);
    delete state.result;
  }

  return ACCEPTED;
}

export function startRealtimeArenaCountdown(state: RealtimeArenaState): RealtimeArenaActionResult {
  if (state.phase !== "lobby") {
    return reject("round-not-in-lobby", "Realtime arena can only start from the lobby.");
  }
  if (state.players.length === 0) {
    return reject("empty-lobby", "Realtime arena needs at least one player.");
  }
  if (state.players.some((player) => player.connected && !player.ready)) {
    return reject("players-not-ready", "All connected players must be ready.");
  }

  resetRoundPieces(state);
  delete state.result;
  state.phase = "countdown";
  state.phaseElapsedMs = 0;
  state.roundElapsedMs = 0;
  recordRealtimeArenaEvent(state, {
    type: "round.countdown",
    label: "Round countdown started"
  });

  if (state.rules.countdownMs <= 0) {
    enterRunning(state);
  }

  return ACCEPTED;
}

export function applyRealtimeInputFrame(
  state: RealtimeArenaState,
  playerId: string,
  frame: RealtimeInputFrame
): RealtimeArenaActionResult {
  const player = findPlayer(state, playerId);
  if (!player) {
    return reject("unknown-player", `Unknown player: ${playerId}`);
  }

  if (state.phase !== "running") {
    return rejectPlayerInput(
      state,
      player,
      "round-not-running",
      "Gameplay input is only accepted while running."
    );
  }
  if (!isValidInputFrame(frame)) {
    return rejectPlayerInput(
      state,
      player,
      "invalid-input-frame",
      "Realtime input frame is invalid."
    );
  }
  if (frame.sequence <= player.lastInputSequence) {
    return rejectPlayerInput(
      state,
      player,
      frame.sequence === player.lastInputSequence ? "duplicate-input" : "stale-input",
      "Realtime input sequence must be strictly increasing."
    );
  }

  player.lastInputSequence = frame.sequence;
  player.latestInput = { ...frame };
  if (frame.interact) {
    player.pendingInteract = true;
  }
  return ACCEPTED;
}

export function tickRealtimeArena(state: RealtimeArenaState, deltaMs: number): void {
  const delta = Math.max(0, deltaMs);
  state.tick += 1;

  switch (state.phase) {
    case "lobby":
    case "results":
      return;
    case "countdown":
      state.phaseElapsedMs += delta;
      if (state.phaseElapsedMs >= state.rules.countdownMs) {
        enterRunning(state);
      }
      return;
    case "running":
      tickRunning(state, delta);
      return;
    case "ending":
      state.phaseElapsedMs += delta;
      if (state.phaseElapsedMs >= state.rules.endingDurationMs) {
        enterResults(state);
      }
      return;
  }
}

export function rematchRealtimeArena(state: RealtimeArenaState): RealtimeArenaActionResult {
  if (state.phase !== "results") {
    return reject("round-not-results", "Realtime arena can only rematch from results.");
  }

  state.phase = "lobby";
  state.phaseElapsedMs = 0;
  state.roundElapsedMs = 0;
  resetRealtimeArenaPieces(state);
  delete state.result;
  recordRealtimeArenaEvent(state, {
    type: "round.rematch",
    label: "Round rematch requested"
  });
  return ACCEPTED;
}

export function recordRealtimeArenaEvent(
  state: RealtimeArenaState,
  input: Omit<RealtimeArenaEvent, "id" | "tick">
): void {
  state.events.push({
    id: state.nextEventId,
    tick: state.tick,
    ...input
  });
  state.nextEventId += 1;
  if (state.events.length > state.rules.maxEvents) {
    state.events.shift();
  }
}

function tickRunning(state: RealtimeArenaState, deltaMs: number): void {
  state.phaseElapsedMs += deltaMs;
  state.roundElapsedMs += deltaMs;

  for (const player of state.players) {
    updateSprintTimers(player, deltaMs);
    updatePlayerMotion(state, player, deltaMs);
    updateCarriedCore(state, player);
    if (player.pendingInteract) {
      handlePlayerInteract(state, player);
      player.pendingInteract = false;
    }
  }

  const scoreLimitResult = findScoreLimitResult(state);
  if (scoreLimitResult) {
    enterEnding(state, scoreLimitResult);
    return;
  }

  if (state.roundElapsedMs >= state.rules.roundDurationMs) {
    enterEnding(state, createTimeLimitResult(state));
  }
}

function updateSprintTimers(player: RealtimeArenaPlayer, deltaMs: number): void {
  player.sprintRemainingMs = Math.max(0, player.sprintRemainingMs - deltaMs);
  player.sprintCooldownMs = Math.max(0, player.sprintCooldownMs - deltaMs);
}

function updatePlayerMotion(
  state: RealtimeArenaState,
  player: RealtimeArenaPlayer,
  deltaMs: number
): void {
  const input = player.latestInput ?? NEUTRAL_INPUT;
  if (input.sprint && player.sprintCooldownMs <= 0 && player.sprintRemainingMs <= 0) {
    player.sprintRemainingMs = state.rules.sprintDurationMs;
    player.sprintCooldownMs = state.rules.sprintCooldownMs;
  }

  const direction = normalizeVector({ x: input.moveX, y: input.moveY });
  const speed =
    state.rules.playerSpeedPerSecond *
    (player.sprintRemainingMs > 0 ? state.rules.sprintMultiplier : 1);
  const distance = (speed * deltaMs) / 1000;
  const nextPosition = {
    x: player.position.x + direction.x * distance,
    y: player.position.y + direction.y * distance
  };
  const resolved = resolveMovement(state, player.position, nextPosition, state.rules.playerRadius);
  player.velocity = {
    x: deltaMs <= 0 ? 0 : ((resolved.x - player.position.x) / deltaMs) * 1000,
    y: deltaMs <= 0 ? 0 : ((resolved.y - player.position.y) / deltaMs) * 1000
  };
  player.position = resolved;
}

function updateCarriedCore(state: RealtimeArenaState, player: RealtimeArenaPlayer): void {
  if (!player.carryingCoreId) {
    return;
  }

  const core = state.cores.find((candidate) => candidate.id === player.carryingCoreId);
  if (core) {
    core.position = { ...player.position };
  }
}

function handlePlayerInteract(state: RealtimeArenaState, player: RealtimeArenaPlayer): void {
  if (player.carryingCoreId) {
    tryDeliverCore(state, player);
    return;
  }

  const core = findPickupCore(state, player);
  if (!core) {
    return;
  }

  core.carriedByPlayerId = player.id;
  player.carryingCoreId = core.id;
  core.position = { ...player.position };
  recordRealtimeArenaEvent(state, {
    type: "core.picked",
    playerId: player.id,
    teamId: player.teamId,
    coreId: core.id,
    label: `${player.label} picked ${core.id}`
  });
}

function tryDeliverCore(state: RealtimeArenaState, player: RealtimeArenaPlayer): void {
  const relay = state.relayNodes.find(
    (node) =>
      node.teamId === player.teamId &&
      distance(player.position, node.position) <= node.radius + state.rules.deliverRadius
  );
  if (!relay || !player.carryingCoreId) {
    return;
  }

  const core = state.cores.find((candidate) => candidate.id === player.carryingCoreId);
  if (!core) {
    delete player.carryingCoreId;
    return;
  }

  state.score[player.teamId] = (state.score[player.teamId] ?? 0) + 1;
  player.deliveredCores += 1;
  delete player.carryingCoreId;
  delete core.carriedByPlayerId;
  core.position = { ...core.spawn };
  recordRealtimeArenaEvent(state, {
    type: "core.delivered",
    playerId: player.id,
    teamId: player.teamId,
    coreId: core.id,
    label: `${player.label} delivered ${core.id}`
  });
}

function releasePlayerCore(state: RealtimeArenaState, player: RealtimeArenaPlayer): void {
  if (!player.carryingCoreId) {
    return;
  }

  const core = state.cores.find((candidate) => candidate.id === player.carryingCoreId);
  if (core) {
    delete core.carriedByPlayerId;
    core.position = { ...core.spawn };
  }
  delete player.carryingCoreId;
}

function findPickupCore(
  state: RealtimeArenaState,
  player: RealtimeArenaPlayer
): RealtimeArenaCore | undefined {
  return state.cores.find(
    (core) =>
      core.carriedByPlayerId === undefined &&
      distance(player.position, core.position) <= core.radius + state.rules.pickupRadius
  );
}

function findScoreLimitResult(state: RealtimeArenaState): RealtimeRoundResult | undefined {
  for (const [teamId, score] of Object.entries(state.score)) {
    if (score >= state.rules.scoreLimit) {
      return {
        reason: "score-limit",
        winnerTeamId: teamId,
        score: { ...state.score },
        durationMs: state.roundElapsedMs
      };
    }
  }

  return undefined;
}

function createTimeLimitResult(state: RealtimeArenaState): RealtimeRoundResult {
  const entries = Object.entries(state.score);
  let bestScore = Number.NEGATIVE_INFINITY;
  let winnerTeamId: string | undefined;
  let tied = false;

  for (const [teamId, score] of entries) {
    if (score > bestScore) {
      bestScore = score;
      winnerTeamId = teamId;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  return {
    reason: tied ? "draw" : "time-limit",
    score: { ...state.score },
    durationMs: state.roundElapsedMs,
    ...(tied || winnerTeamId === undefined ? {} : { winnerTeamId })
  };
}

function enterRunning(state: RealtimeArenaState): void {
  state.phase = "running";
  state.phaseElapsedMs = 0;
  state.roundElapsedMs = 0;
  for (const player of state.players) {
    player.position = { ...player.spawn };
    player.velocity = { x: 0, y: 0 };
    player.pendingInteract = false;
    delete player.carryingCoreId;
  }
  for (const core of state.cores) {
    core.position = { ...core.spawn };
    delete core.carriedByPlayerId;
  }
  recordRealtimeArenaEvent(state, {
    type: "round.started",
    label: "Round started"
  });
}

function enterEnding(state: RealtimeArenaState, result: RealtimeRoundResult): void {
  state.phase = "ending";
  state.phaseElapsedMs = 0;
  state.result = result;
  for (const player of state.players) {
    player.velocity = { x: 0, y: 0 };
  }
  recordRealtimeArenaEvent(state, {
    type: "round.ending",
    ...(result.winnerTeamId === undefined ? {} : { teamId: result.winnerTeamId }),
    label:
      result.winnerTeamId === undefined
        ? `Round ending as ${result.reason}`
        : `Round ending with ${result.winnerTeamId} ahead`
  });

  if (state.rules.endingDurationMs <= 0) {
    enterResults(state);
  }
}

function enterResults(state: RealtimeArenaState): void {
  state.phase = "results";
  state.phaseElapsedMs = 0;
  recordRealtimeArenaEvent(state, {
    type: "round.results",
    ...(state.result?.winnerTeamId === undefined ? {} : { teamId: state.result.winnerTeamId }),
    label:
      state.result?.winnerTeamId === undefined
        ? "Round results: draw"
        : `Round results: ${state.result.winnerTeamId} wins`
  });
}

function rejectPlayerInput(
  state: RealtimeArenaState,
  player: RealtimeArenaPlayer,
  code: string,
  reason: string
): RealtimeArenaActionResult {
  player.rejectedInputs += 1;
  recordRealtimeArenaEvent(state, {
    type: "input.rejected",
    playerId: player.id,
    teamId: player.teamId,
    code,
    label: `${player.label} input rejected: ${code}`
  });
  return reject(code, reason);
}

function reject(code: string, reason: string): RealtimeArenaActionResult {
  return {
    accepted: false,
    code,
    reason
  };
}

function findPlayer(state: RealtimeArenaState, playerId: string): RealtimeArenaPlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

function isValidInputFrame(frame: RealtimeInputFrame): boolean {
  return (
    Number.isInteger(frame.sequence) &&
    frame.sequence > 0 &&
    Number.isFinite(frame.clientTime) &&
    isMoveAxis(frame.moveX) &&
    isMoveAxis(frame.moveY) &&
    typeof frame.sprint === "boolean" &&
    typeof frame.interact === "boolean"
  );
}

function isMoveAxis(value: unknown): value is -1 | 0 | 1 {
  return value === -1 || value === 0 || value === 1;
}

function normalizeVector(vector: RealtimeArenaVector): RealtimeArenaVector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function resolveMovement(
  state: RealtimeArenaState,
  current: RealtimeArenaVector,
  target: RealtimeArenaVector,
  radius: number
): RealtimeArenaVector {
  const clampedTarget = clampToBounds(state, target, radius);
  if (!collidesWithWall(state.walls, clampedTarget, radius)) {
    return clampedTarget;
  }

  const xOnly = clampToBounds(state, { x: clampedTarget.x, y: current.y }, radius);
  if (!collidesWithWall(state.walls, xOnly, radius)) {
    return xOnly;
  }

  const yOnly = clampToBounds(state, { x: current.x, y: clampedTarget.y }, radius);
  if (!collidesWithWall(state.walls, yOnly, radius)) {
    return yOnly;
  }

  return current;
}

function clampToBounds(
  state: RealtimeArenaState,
  point: RealtimeArenaVector,
  radius: number
): RealtimeArenaVector {
  return {
    x: clamp(point.x, radius, state.bounds.width - radius),
    y: clamp(point.y, radius, state.bounds.height - radius)
  };
}

function collidesWithWall(
  walls: RealtimeArenaWall[],
  point: RealtimeArenaVector,
  radius: number
): boolean {
  return walls.some((wall) => pointIntersectsExpandedWall(wall, point, radius));
}

function pointIntersectsExpandedWall(
  wall: RealtimeArenaWall,
  point: RealtimeArenaVector,
  radius: number
): boolean {
  return (
    point.x >= wall.x - radius &&
    point.x <= wall.x + wall.width + radius &&
    point.y >= wall.y - radius &&
    point.y <= wall.y + wall.height + radius
  );
}

function distance(a: RealtimeArenaVector, b: RealtimeArenaVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
