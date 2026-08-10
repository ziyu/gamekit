import { GameError } from "@gamekit/core";
import type {
  PhysicsBackendAdapter,
  PhysicsBodyDefinition,
  PhysicsBodyPatch,
  PhysicsBodyState,
  PhysicsColliderDefinition,
  PhysicsContactEvent,
  PhysicsScene,
  PhysicsSceneCheckpoint,
  PhysicsSceneConfig
} from "./types";

export type PhysicsPredictionIslandGeneration = string | number;

export type PhysicsPredictionIslandMemberDefinition = {
  id: string;
  body: PhysicsBodyDefinition & { id: string };
  colliders?: readonly PhysicsColliderDefinition[];
};

export type PhysicsPredictionIslandEnvironment = {
  bodies?: readonly PhysicsBodyDefinition[];
  colliders?: readonly PhysicsColliderDefinition[];
};

export type PhysicsPredictionIslandCommand =
  | {
      type: "spawn";
      tick: number;
      sequence: number;
      member: PhysicsPredictionIslandMemberDefinition;
    }
  | {
      type: "patch";
      tick: number;
      sequence: number;
      memberId: string;
      patch: PhysicsBodyPatch;
    }
  | {
      type: "despawn";
      tick: number;
      sequence: number;
      memberId: string;
    };

export type PhysicsPredictionIslandMemberState = {
  id: string;
  body: PhysicsBodyState;
};

export type PhysicsPredictionIslandStateSnapshot = {
  generation: PhysicsPredictionIslandGeneration;
  tick: number;
  members: PhysicsPredictionIslandMemberState[];
};

export type PhysicsPredictionIslandContact = PhysicsContactEvent & {
  tick: number;
};

export type PhysicsPredictionIslandAdvanceResult = {
  tick: number;
  steps: number;
  appliedCommands: number;
  contacts: PhysicsPredictionIslandContact[];
};

export type PhysicsPredictionIslandQueueResult = {
  status: "queued" | "replayed" | "duplicate" | "conflict" | "history-overflow" | "capacity";
  replayedTicks: number;
  contacts: PhysicsPredictionIslandContact[];
};

export type PhysicsPredictionIslandReconcileResult = {
  status:
    | "confirmed"
    | "corrected"
    | "membership-mismatch"
    | "history-overflow"
    | "stale-generation";
  correctionMagnitude: number;
  replayedTicks: number;
};

export type PhysicsPredictionIslandDiagnostics = {
  backend: string;
  generation: PhysicsPredictionIslandGeneration;
  tick: number;
  members: number;
  historyEntries: number;
  historyBytes: number;
  commands: number;
  spawned: number;
  patched: number;
  despawned: number;
  steps: number;
  checkpointCaptures: number;
  checkpointRestores: number;
  resimulations: number;
  resimulatedTicks: number;
  reconciliations: number;
  corrections: number;
  membershipMismatches: number;
  historyOverflows: number;
  duplicateCommands: number;
  conflictingCommands: number;
  rejectedCommands: number;
  maxCorrectionMagnitude: number;
  disposed: boolean;
};

export type CreatePhysicsPredictionIslandOptions = {
  backend: PhysicsBackendAdapter;
  generation: PhysicsPredictionIslandGeneration;
  scene?: PhysicsSceneConfig;
  environment?: PhysicsPredictionIslandEnvironment;
  initialMembers?: readonly PhysicsPredictionIslandMemberDefinition[];
  initialTick?: number;
  fixedDeltaMs?: number;
  maxHistoryTicks?: number;
  maxMembers?: number;
  maxCommands?: number;
};

export type PhysicsPredictionIsland = {
  queue(command: PhysicsPredictionIslandCommand): PhysicsPredictionIslandQueueResult;
  advanceTo(targetTick: number): PhysicsPredictionIslandAdvanceResult;
  reconcile(snapshot: PhysicsPredictionIslandStateSnapshot): PhysicsPredictionIslandReconcileResult;
  state(): PhysicsPredictionIslandStateSnapshot;
  body(memberId: string): PhysicsBodyState | undefined;
  tick(): number;
  reset(generation: PhysicsPredictionIslandGeneration, tick?: number): void;
  diagnostics(): PhysicsPredictionIslandDiagnostics;
  dispose(): void;
};

type StoredIslandCheckpoint = {
  tick: number;
  scene: PhysicsSceneCheckpoint;
  members: PhysicsPredictionIslandMemberDefinition[];
};

const DEFAULT_FIXED_DELTA_MS = 1000 / 60;
const DEFAULT_MAX_HISTORY_TICKS = 128;
const DEFAULT_MAX_MEMBERS = 64;
const DEFAULT_MAX_COMMANDS = 256;

export function createPhysicsPredictionIsland(
  options: CreatePhysicsPredictionIslandOptions
): PhysicsPredictionIsland {
  const capabilities = options.backend.capabilities().checkpoints;
  if (
    capabilities?.captureRestore !== true ||
    capabilities.fullScene !== true ||
    capabilities.deterministicReplay !== true
  ) {
    throw new GameError(
      "physics.prediction_island_checkpoint_unsupported",
      `Physics backend does not support deterministic full-scene checkpoints: ${options.backend.kind}`,
      { backend: options.backend.kind, capabilities }
    );
  }
  const fixedDeltaMs = positiveNumber(options.fixedDeltaMs, DEFAULT_FIXED_DELTA_MS);
  const maxHistoryTicks = positiveInteger(options.maxHistoryTicks, DEFAULT_MAX_HISTORY_TICKS);
  const maxMembers = positiveInteger(options.maxMembers, DEFAULT_MAX_MEMBERS);
  const maxCommands = positiveInteger(options.maxCommands, DEFAULT_MAX_COMMANDS);
  const initialTick = nonNegativeInteger(options.initialTick, 0);
  const scene = options.backend.createScene({
    ...options.scene,
    fixedDeltaMs
  });
  if (scene.captureCheckpoint === undefined || scene.restoreCheckpoint === undefined) {
    scene.dispose();
    throw new GameError(
      "physics.prediction_island_checkpoint_missing",
      `Physics backend advertised checkpoints without scene methods: ${options.backend.kind}`,
      { backend: options.backend.kind }
    );
  }
  const captureScene = scene.captureCheckpoint.bind(scene);
  const restoreScene = scene.restoreCheckpoint.bind(scene);

  const members = new Map<string, PhysicsPredictionIslandMemberDefinition>();
  const history = new Map<number, StoredIslandCheckpoint>();
  const historyOrder: number[] = [];
  const commandsByTick = new Map<number, PhysicsPredictionIslandCommand[]>();
  const commandBySequence = new Map<
    number,
    { command: PhysicsPredictionIslandCommand; signature: string }
  >();
  let generation = options.generation;
  let currentTick = initialTick;
  let commandCount = 0;
  let disposed = false;
  const metrics: Omit<
    PhysicsPredictionIslandDiagnostics,
    | "backend"
    | "generation"
    | "tick"
    | "members"
    | "historyEntries"
    | "historyBytes"
    | "commands"
    | "disposed"
  > = {
    spawned: 0,
    patched: 0,
    despawned: 0,
    steps: 0,
    checkpointCaptures: 0,
    checkpointRestores: 0,
    resimulations: 0,
    resimulatedTicks: 0,
    reconciliations: 0,
    corrections: 0,
    membershipMismatches: 0,
    historyOverflows: 0,
    duplicateCommands: 0,
    conflictingCommands: 0,
    rejectedCommands: 0,
    maxCorrectionMagnitude: 0
  };

  try {
    materializeEnvironment(scene, options.environment);
    for (const member of options.initialMembers ?? []) {
      spawnMember(member, false);
    }
  } catch (error) {
    scene.dispose();
    throw error;
  }
  const initialCheckpoint = captureCheckpoint(initialTick);
  storeCheckpoint(initialCheckpoint);

  return {
    queue(command) {
      assertActive();
      validateCommand(command);
      const existing = commandBySequence.get(command.sequence);
      const signature = commandSignature(command);
      if (existing !== undefined) {
        if (existing.signature === signature) {
          metrics.duplicateCommands += 1;
          return { status: "duplicate", replayedTicks: 0, contacts: [] };
        }
        metrics.conflictingCommands += 1;
        return { status: "conflict", replayedTicks: 0, contacts: [] };
      }
      if (commandCount >= maxCommands) {
        metrics.rejectedCommands += 1;
        return { status: "capacity", replayedTicks: 0, contacts: [] };
      }
      if (command.tick <= currentTick && !history.has(command.tick - 1)) {
        metrics.historyOverflows += 1;
        metrics.rejectedCommands += 1;
        return { status: "history-overflow", replayedTicks: 0, contacts: [] };
      }
      const stored = cloneCommand(command);
      const commands = commandsByTick.get(command.tick) ?? [];
      commands.push(stored);
      commands.sort(compareCommands);
      commandsByTick.set(command.tick, commands);
      commandBySequence.set(command.sequence, { command: stored, signature });
      commandCount += 1;
      if (command.tick > currentTick) {
        return { status: "queued", replayedTicks: 0, contacts: [] };
      }
      const replayed = replayFrom(command.tick);
      return {
        status: "replayed",
        replayedTicks: replayed.steps,
        contacts: replayed.contacts
      };
    },
    advanceTo(targetTick) {
      assertActive();
      return advance(targetTick, false);
    },
    reconcile(snapshot) {
      assertActive();
      if (snapshot.generation !== generation) {
        return { status: "stale-generation", correctionMagnitude: 0, replayedTicks: 0 };
      }
      const checkpoint = history.get(snapshot.tick);
      if (checkpoint === undefined || snapshot.tick > currentTick) {
        metrics.historyOverflows += 1;
        return { status: "history-overflow", correctionMagnitude: 0, replayedTicks: 0 };
      }
      const localMemberIds = [...checkpoint.members.map((member) => member.id)].sort();
      const authorityMemberIds = [...snapshot.members.map((member) => member.id)].sort();
      if (!sameStrings(localMemberIds, authorityMemberIds)) {
        metrics.membershipMismatches += 1;
        return { status: "membership-mismatch", correctionMagnitude: 0, replayedTicks: 0 };
      }
      const targetTick = currentTick;
      restoreCheckpoint(checkpoint);
      let correctionMagnitude = 0;
      for (const authorityMember of snapshot.members) {
        const definition = members.get(authorityMember.id);
        if (definition === undefined) {
          metrics.membershipMismatches += 1;
          return { status: "membership-mismatch", correctionMagnitude: 0, replayedTicks: 0 };
        }
        const localBody = scene.getBodyState(definition.body.id);
        if (localBody === undefined) {
          throw missingMemberBody(authorityMember.id, definition.body.id);
        }
        correctionMagnitude = Math.max(
          correctionMagnitude,
          vectorDistance(localBody.position, authorityMember.body.position)
        );
        scene.updateBody(definition.body.id, bodyStatePatch(authorityMember.body));
      }
      dropHistoryAfter(snapshot.tick - 1);
      storeCheckpoint(captureCheckpoint(snapshot.tick));
      metrics.resimulations += 1;
      const replayed = advance(targetTick, true);
      metrics.resimulatedTicks += replayed.steps;
      metrics.reconciliations += 1;
      metrics.maxCorrectionMagnitude = Math.max(
        metrics.maxCorrectionMagnitude,
        correctionMagnitude
      );
      if (correctionMagnitude > 0.000_001) {
        metrics.corrections += 1;
      }
      return {
        status: correctionMagnitude > 0.000_001 ? "corrected" : "confirmed",
        correctionMagnitude,
        replayedTicks: replayed.steps
      };
    },
    state() {
      assertActive();
      return capturePublicState();
    },
    body(memberId) {
      assertActive();
      const member = members.get(memberId);
      if (member === undefined) {
        return undefined;
      }
      const body = scene.getBodyState(member.body.id);
      return body === undefined ? undefined : cloneBodyState(body);
    },
    tick() {
      return currentTick;
    },
    reset(nextGeneration, nextTick = initialTick) {
      assertActive();
      if (!Number.isSafeInteger(nextTick) || nextTick < 0) {
        throw new GameError(
          "physics.prediction_island_reset_tick_invalid",
          "Physics prediction island reset tick must be a non-negative safe integer",
          { nextTick }
        );
      }
      generation = nextGeneration;
      restoreCheckpoint(initialCheckpoint);
      currentTick = nextTick;
      commandsByTick.clear();
      commandBySequence.clear();
      commandCount = 0;
      history.clear();
      historyOrder.length = 0;
      storeCheckpoint(captureCheckpoint(nextTick));
    },
    diagnostics() {
      return {
        backend: options.backend.kind,
        generation,
        tick: currentTick,
        members: members.size,
        historyEntries: history.size,
        historyBytes: historyOrder.reduce(
          (total, historyTick) => total + (history.get(historyTick)?.scene.byteLength ?? 0),
          0
        ),
        commands: commandCount,
        ...metrics,
        disposed
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      members.clear();
      history.clear();
      historyOrder.length = 0;
      commandsByTick.clear();
      commandBySequence.clear();
      commandCount = 0;
      scene.dispose();
    }
  };

  function advance(targetTick: number, replay: boolean): PhysicsPredictionIslandAdvanceResult {
    if (!Number.isSafeInteger(targetTick) || targetTick < currentTick) {
      throw new GameError(
        "physics.prediction_island_invalid_target_tick",
        `Prediction island target tick must be an integer at or after ${currentTick}`,
        { currentTick, targetTick }
      );
    }
    const contacts: PhysicsPredictionIslandContact[] = [];
    let appliedCommands = 0;
    const startedAt = currentTick;
    while (currentTick < targetTick) {
      const nextTick = currentTick + 1;
      for (const command of commandsByTick.get(nextTick) ?? []) {
        applyCommand(command, replay);
        appliedCommands += 1;
      }
      const step = scene.step(fixedDeltaMs, { tick: nextTick });
      for (const contact of step.contacts) {
        contacts.push({ ...contact, tick: nextTick });
      }
      currentTick = nextTick;
      metrics.steps += 1;
      storeCheckpoint(captureCheckpoint(currentTick));
    }
    return {
      tick: currentTick,
      steps: currentTick - startedAt,
      appliedCommands,
      contacts
    };
  }

  function replayFrom(fromTick: number): PhysicsPredictionIslandAdvanceResult {
    const checkpoint = history.get(fromTick - 1);
    if (checkpoint === undefined) {
      throw new GameError(
        "physics.prediction_island_history_overflow",
        `Missing prediction island checkpoint before tick ${fromTick}`,
        { fromTick, currentTick }
      );
    }
    const targetTick = currentTick;
    restoreCheckpoint(checkpoint);
    dropHistoryAfter(fromTick - 1);
    metrics.resimulations += 1;
    const replayed = advance(targetTick, true);
    metrics.resimulatedTicks += replayed.steps;
    return replayed;
  }

  function applyCommand(command: PhysicsPredictionIslandCommand, replay: boolean): void {
    switch (command.type) {
      case "spawn":
        spawnMember(command.member, true);
        return;
      case "patch": {
        const member = members.get(command.memberId);
        if (member === undefined) {
          throw new GameError(
            "physics.prediction_island_member_missing",
            `Prediction island member is missing: ${command.memberId}`,
            { command, replay }
          );
        }
        scene.updateBody(member.body.id, structuredClone(command.patch));
        metrics.patched += 1;
        return;
      }
      case "despawn": {
        const member = members.get(command.memberId);
        if (member === undefined) {
          return;
        }
        scene.destroyBody(member.body.id);
        members.delete(command.memberId);
        metrics.despawned += 1;
      }
    }
  }

  function spawnMember(
    member: PhysicsPredictionIslandMemberDefinition,
    countMetric: boolean
  ): void {
    const normalized = normalizeMember(member);
    if (members.has(normalized.id)) {
      throw new GameError(
        "physics.prediction_island_member_duplicate",
        `Duplicate prediction island member: ${normalized.id}`,
        { memberId: normalized.id }
      );
    }
    if (members.size >= maxMembers) {
      throw new GameError(
        "physics.prediction_island_member_capacity",
        `Prediction island member capacity exceeded: ${maxMembers}`,
        { maxMembers, memberId: normalized.id }
      );
    }
    scene.createBody(normalized.body);
    for (const collider of normalized.colliders ?? []) {
      scene.createCollider({ ...collider, bodyId: collider.bodyId ?? normalized.body.id });
    }
    members.set(normalized.id, normalized);
    if (countMetric) {
      metrics.spawned += 1;
    }
  }

  function captureCheckpoint(tick: number): StoredIslandCheckpoint {
    const checkpoint = captureScene();
    metrics.checkpointCaptures += 1;
    return {
      tick,
      scene: checkpoint,
      members: [...members.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneMember)
    };
  }

  function storeCheckpoint(checkpoint: StoredIslandCheckpoint): void {
    if (!history.has(checkpoint.tick)) {
      historyOrder.push(checkpoint.tick);
    }
    history.set(checkpoint.tick, checkpoint);
    while (historyOrder.length > maxHistoryTicks + 1) {
      const expiredTick = historyOrder.shift();
      if (expiredTick !== undefined) {
        history.delete(expiredTick);
      }
    }
    const earliestTick = historyOrder[0];
    if (earliestTick !== undefined) {
      trimCommandsThrough(earliestTick);
    }
  }

  function restoreCheckpoint(checkpoint: StoredIslandCheckpoint): void {
    restoreScene(checkpoint.scene);
    metrics.checkpointRestores += 1;
    currentTick = checkpoint.tick;
    members.clear();
    for (const member of checkpoint.members) {
      members.set(member.id, cloneMember(member));
    }
  }

  function dropHistoryAfter(tick: number): void {
    for (let index = historyOrder.length - 1; index >= 0; index -= 1) {
      const historyTick = historyOrder[index];
      if (historyTick === undefined || historyTick <= tick) {
        continue;
      }
      historyOrder.splice(index, 1);
      history.delete(historyTick);
    }
  }

  function trimCommandsThrough(tick: number): void {
    for (const [commandTick, commands] of commandsByTick) {
      if (commandTick > tick) {
        continue;
      }
      commandsByTick.delete(commandTick);
      commandCount -= commands.length;
      for (const command of commands) {
        commandBySequence.delete(command.sequence);
      }
    }
  }

  function capturePublicState(): PhysicsPredictionIslandStateSnapshot {
    return {
      generation,
      tick: currentTick,
      members: [...members.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((member) => {
          const body = scene.getBodyState(member.body.id);
          if (body === undefined) {
            throw missingMemberBody(member.id, member.body.id);
          }
          return { id: member.id, body: cloneBodyState(body) };
        })
    };
  }

  function assertActive(): void {
    if (disposed) {
      throw new GameError(
        "physics.prediction_island_disposed",
        "Physics prediction island has been disposed"
      );
    }
  }
}

function materializeEnvironment(
  scene: PhysicsScene,
  environment: PhysicsPredictionIslandEnvironment | undefined
): void {
  for (const body of environment?.bodies ?? []) {
    scene.createBody(structuredClone(body));
  }
  for (const collider of environment?.colliders ?? []) {
    scene.createCollider(structuredClone(collider));
  }
}

function normalizeMember(
  member: PhysicsPredictionIslandMemberDefinition
): PhysicsPredictionIslandMemberDefinition {
  if (member.id.length === 0 || member.body.id.length === 0) {
    throw new GameError(
      "physics.prediction_island_member_invalid",
      "Prediction island member and body ids must be non-empty"
    );
  }
  const colliderIds = new Set<string>();
  for (const collider of member.colliders ?? []) {
    if (collider.id === undefined || collider.id.length === 0) {
      throw new GameError(
        "physics.prediction_island_collider_id_required",
        `Prediction island member collider requires a stable id: ${member.id}`,
        { memberId: member.id }
      );
    }
    if (colliderIds.has(collider.id)) {
      throw new GameError(
        "physics.prediction_island_collider_duplicate",
        `Duplicate prediction island collider: ${collider.id}`,
        { memberId: member.id, colliderId: collider.id }
      );
    }
    if (collider.bodyId !== undefined && collider.bodyId !== member.body.id) {
      throw new GameError(
        "physics.prediction_island_collider_owner_invalid",
        `Prediction island collider belongs to another body: ${collider.id}`,
        { memberId: member.id, colliderId: collider.id, bodyId: collider.bodyId }
      );
    }
    colliderIds.add(collider.id);
  }
  return cloneMember(member);
}

function cloneMember(
  member: PhysicsPredictionIslandMemberDefinition
): PhysicsPredictionIslandMemberDefinition {
  return {
    id: member.id,
    body: structuredClone(member.body),
    ...(member.colliders === undefined
      ? {}
      : { colliders: member.colliders.map((collider) => structuredClone(collider)) })
  };
}

function validateCommand(command: PhysicsPredictionIslandCommand): void {
  if (!Number.isSafeInteger(command.tick) || command.tick < 1) {
    throw new GameError(
      "physics.prediction_island_command_tick_invalid",
      "Prediction island command tick must be a positive safe integer",
      { command }
    );
  }
  if (!Number.isSafeInteger(command.sequence) || command.sequence < 1) {
    throw new GameError(
      "physics.prediction_island_command_sequence_invalid",
      "Prediction island command sequence must be a positive safe integer",
      { command }
    );
  }
}

function commandSignature(command: PhysicsPredictionIslandCommand): string {
  return JSON.stringify(command);
}

function cloneCommand(command: PhysicsPredictionIslandCommand): PhysicsPredictionIslandCommand {
  return structuredClone(command);
}

function compareCommands(
  left: PhysicsPredictionIslandCommand,
  right: PhysicsPredictionIslandCommand
): number {
  return left.sequence - right.sequence || left.type.localeCompare(right.type);
}

function bodyStatePatch(state: PhysicsBodyState): PhysicsBodyPatch {
  return {
    position: structuredClone(state.position),
    linearVelocity: structuredClone(state.linearVelocity),
    sleeping: state.sleeping,
    ...(state.rotation === undefined ? {} : { rotation: structuredClone(state.rotation) }),
    ...(state.angularVelocity === undefined
      ? {}
      : { angularVelocity: structuredClone(state.angularVelocity) }),
    ...(state.userData === undefined ? {} : { userData: structuredClone(state.userData) })
  };
}

function cloneBodyState(state: PhysicsBodyState): PhysicsBodyState {
  return {
    ...state,
    position: structuredClone(state.position),
    linearVelocity: structuredClone(state.linearVelocity),
    ...(state.rotation === undefined ? {} : { rotation: structuredClone(state.rotation) }),
    ...(state.angularVelocity === undefined
      ? {}
      : { angularVelocity: structuredClone(state.angularVelocity) }),
    ...(state.userData === undefined ? {} : { userData: structuredClone(state.userData) })
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function vectorDistance(
  left: { x: number; y: number; z?: number },
  right: { x: number; y: number; z?: number }
): number {
  return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function missingMemberBody(memberId: string, bodyId: string): GameError {
  return new GameError(
    "physics.prediction_island_member_body_missing",
    `Prediction island member body is missing: ${memberId}`,
    { memberId, bodyId }
  );
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : value;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isSafeInteger(value) || value <= 0 ? fallback : value;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isSafeInteger(value) || value < 0 ? fallback : value;
}
