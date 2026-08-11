import { createStandardMultiplayerPhysicsArenaAuthorityProjection } from "@gamekit/app-host";
import {
  createMultiplayerAuthorityBindingStore,
  createMultiplayerAuthorityHostLoop,
  type MultiplayerAuthorityHostLoop,
  type MultiplayerAuthorityLoopDiagnostics,
  type MultiplayerRuntime
} from "@gamekit/multiplayer-core";
import {
  createPhysicsPredictionIsland,
  type PhysicsBackendAdapter,
  type PhysicsPredictionIsland,
  type PhysicsPredictionIslandCommand,
  type PhysicsPredictionIslandContact,
  type PhysicsPredictionIslandMemberDefinition,
  type PhysicsVector
} from "@gamekit/physics-core";

import {
  ARENA_ENVIRONMENT,
  createArenaMemberDefinitions,
  isArenaActor
} from "../shared/arena-definition";
import { resetArenaRoundPhysics, resolveArenaActorAuthorityStep } from "./arena-actor-lifecycle";
import {
  ARENA_DEFINITION_VERSION,
  ARENA_FIXED_STEP_MS,
  ARENA_INPUT_KIND,
  ARENA_ISLAND_ID,
  ARENA_MAX_HUMANS,
  ARENA_SCHEMA_VERSION,
  ARENA_SNAPSHOT_INTERVAL_TICKS,
  ARENA_SNAPSHOT_KIND,
  arenaPlayerMemberId,
  type ArenaActorControl,
  type ArenaMatchPhase,
  type ArenaMoveInput
} from "../shared/config";
import {
  readArenaMoveInput,
  type ArenaAuthorityEffectCue,
  type ArenaSnapshot
} from "../shared/protocol";

export type ArenaAuthorityRuntimeSnapshot = {
  phase: ArenaMatchPhase;
  round: number;
  tick: number;
  activePeers: number;
  frameMembers: number;
  input: MultiplayerAuthorityLoopDiagnostics;
  physics: ReturnType<PhysicsPredictionIsland["diagnostics"]>;
};

export type ArenaAuthorityRuntime = {
  tick(deltaMs?: number): void;
  snapshot(): ArenaAuthorityRuntimeSnapshot;
  latestSnapshot(): ArenaSnapshot;
  dispose(): void;
};

export type CreateArenaAuthorityRuntimeOptions = {
  runtime: MultiplayerRuntime;
  backend: PhysicsBackendAdapter;
  sessionId: string;
  authorityPeerId: string;
  now?: () => number;
};

const COUNTDOWN_MS = 3_000;
const ROUND_DURATION_MS = 120_000;
const RESULTS_DURATION_MS = 5_000;
const AUTHORITY_EFFECT_RETENTION_TICKS = 60;
const MAX_AUTHORITY_EFFECTS = 128;

export function createArenaAuthorityRuntime(
  options: CreateArenaAuthorityRuntimeOptions
): ArenaAuthorityRuntime {
  const now = options.now ?? (() => Date.now());
  const definitions = createArenaMemberDefinitions();
  const island = createPhysicsPredictionIsland({
    backend: options.backend,
    generation: `round.1`,
    initialMembers: definitions,
    environment: ARENA_ENVIRONMENT,
    fixedDeltaMs: ARENA_FIXED_STEP_MS,
    maxHistoryTicks: 180,
    maxCheckpointBytes: 8 * 1024 * 1024,
    maxHistoryBytes: 96 * 1024 * 1024,
    maxReplayTicksPerOperation: 120,
    maxMembers: 32,
    maxCommands: 2_048,
    scene: {
      dimension: "3d",
      gravity: { x: 0, y: -18, z: 0 },
      materialDefinitions: [
        { id: "course", friction: 0.85, restitution: 0.05 },
        { id: "actor", friction: 0.55, restitution: 0.08, density: 1 },
        { id: "prop", friction: 0.65, restitution: 0.45, density: 0.7 },
        { id: "hazard", friction: 0.45, restitution: 0.3 }
      ]
    }
  });
  const projection = createStandardMultiplayerPhysicsArenaAuthorityProjection({
    maxMembers: 32,
    maxPayloadBytes: 128 * 1024
  });
  const peerSlots = new Map<string, number>();
  const inputsByPeerId = new Map<string, ArenaMoveInput>();
  const inputAcksByPeerId = new Map<string, number>();
  const actorControlsByMemberId = new Map<string, ArenaActorControl>();
  const eliminatedMemberIds = new Set<string>();
  const authorityEffects = new Map<string, ArenaAuthorityEffectCue>();
  let membershipRevision = 1;
  let phase: ArenaMatchPhase = "lobby";
  let round = 1;
  let countdownMs = COUNTDOWN_MS;
  let roundTimeMs = 0;
  let resultsMs = 0;
  let winnerId: string | undefined;
  let latestPayloadBytes = 0;
  let disposed = false;
  const binding = createMultiplayerAuthorityBindingStore({
    sessionId: options.sessionId,
    mode: "server-authoritative",
    authorityPeerId: options.authorityPeerId,
    authorityEndpoint: {
      kind: "server",
      id: options.authorityPeerId,
      peerId: options.authorityPeerId
    },
    snapshotVersion: ARENA_SCHEMA_VERSION
  });

  const authorityLoop: MultiplayerAuthorityHostLoop = createMultiplayerAuthorityHostLoop<
    never,
    ArenaMoveInput,
    ArenaSnapshot
  >({
    runtime: options.runtime,
    binding,
    inputKind: ARENA_INPUT_KIND,
    snapshotKind: ARENA_SNAPSHOT_KIND,
    snapshotVersion: ARENA_SCHEMA_VERSION,
    readInput: readArenaMoveInput,
    inputSequence: (input) => input.sequence,
    inputDelivery: {
      mode: "redundant-bundle",
      maxSources: ARENA_MAX_HUMANS,
      maxBufferedFramesPerSource: 24,
      maxGapTicks: 2,
      gapPolicy: "hold-last"
    },
    maxInputsPerSourcePerTick: 1,
    maxQueuedInputsPerSource: 24,
    maxQueuedInputs: ARENA_MAX_HUMANS * 24,
    handleInput({ message, payload }) {
      if (!peerSlots.has(message.sourcePeerId)) {
        return {
          allowed: false,
          code: "arena-participant-unbound",
          reason: "Arena input requires an active player slot."
        };
      }
      inputsByPeerId.set(message.sourcePeerId, payload);
      inputAcksByPeerId.set(message.sourcePeerId, message.sequence ?? payload.sequence);
      return { allowed: true };
    },
    tick({ tick, deltaMs }) {
      reconcilePeers();
      advanceMatch(deltaMs);
      advancePhysics(tick);
    },
    captureSnapshot() {
      return captureSnapshot();
    },
    async publishSnapshot(snapshot, context) {
      if (context.tick % ARENA_SNAPSHOT_INTERVAL_TICKS !== 0) {
        return;
      }
      await options.runtime.send({
        channel: "reliable",
        kind: ARENA_SNAPSHOT_KIND,
        tick: context.tick,
        schemaVersion: ARENA_SCHEMA_VERSION,
        payload: snapshot
      });
    }
  });

  let latest = captureSnapshot();

  return {
    tick(deltaMs = ARENA_FIXED_STEP_MS) {
      if (disposed) return;
      authorityLoop.tick(deltaMs);
      latest = captureSnapshot();
    },
    snapshot() {
      const diagnostics = authorityLoop.diagnostics();
      return {
        phase,
        round,
        tick: diagnostics.tick,
        activePeers: peerSlots.size,
        frameMembers: island.state().members.length,
        input: diagnostics,
        physics: island.diagnostics()
      };
    },
    latestSnapshot() {
      return structuredClone(latest);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      authorityLoop.dispose();
      binding.close("Knockout arena authority disposed");
      island.dispose();
      peerSlots.clear();
      inputsByPeerId.clear();
      inputAcksByPeerId.clear();
      actorControlsByMemberId.clear();
      eliminatedMemberIds.clear();
      authorityEffects.clear();
    }
  };

  function reconcilePeers(): void {
    const peers = options.runtime
      .peers()
      .filter(
        (peer) =>
          peer.id !== options.authorityPeerId &&
          peer.role !== "server" &&
          peer.status === "connected"
      );
    const activeIds = new Set(peers.map((peer) => peer.id));
    for (const peerId of peerSlots.keys()) {
      if (!activeIds.has(peerId)) {
        authorityLoop.releasePeer(peerId);
        peerSlots.delete(peerId);
        inputsByPeerId.delete(peerId);
        inputAcksByPeerId.delete(peerId);
      }
    }
    const occupied = new Set(peerSlots.values());
    for (const peer of peers) {
      if (peerSlots.has(peer.id)) continue;
      const slot = Array.from({ length: ARENA_MAX_HUMANS }, (_, index) => index).find(
        (candidate) => !occupied.has(candidate)
      );
      if (slot === undefined) continue;
      occupied.add(slot);
      peerSlots.set(peer.id, slot);
      inputsByPeerId.set(peer.id, neutralInput());
      inputAcksByPeerId.set(peer.id, 0);
    }
    if (peerSlots.size === 0) {
      phase = "lobby";
      countdownMs = COUNTDOWN_MS;
      return;
    }
    if (phase === "lobby") {
      phase = "countdown";
      countdownMs = COUNTDOWN_MS;
    }
  }

  function advanceMatch(deltaMs: number): void {
    if (phase === "countdown") {
      countdownMs = Math.max(0, countdownMs - deltaMs);
      if (countdownMs === 0) {
        phase = "running";
        roundTimeMs = 0;
      }
      return;
    }
    if (phase === "running") {
      roundTimeMs += deltaMs;
      detectEliminations();
      const humanMembers = [...peerSlots.values()].map(arenaPlayerMemberId);
      const survivors = humanMembers.filter((id) => !eliminatedMemberIds.has(id));
      if (
        roundTimeMs >= ROUND_DURATION_MS ||
        (humanMembers.length > 0 && survivors.length === 0) ||
        (humanMembers.length > 1 && survivors.length === 1 && roundTimeMs > 5_000)
      ) {
        phase = "results";
        resultsMs = RESULTS_DURATION_MS;
        winnerId = survivors[0];
      }
      return;
    }
    if (phase === "results") {
      resultsMs = Math.max(0, resultsMs - deltaMs);
      if (resultsMs === 0 && peerSlots.size > 0) {
        round += 1;
        resetRound();
      }
    }
  }

  function detectEliminations(): void {
    let membershipChanged = false;
    for (const member of island.state().members) {
      if (
        isArenaActor(member.id) &&
        member.body.position.y < -4 &&
        !eliminatedMemberIds.has(member.id)
      ) {
        eliminatedMemberIds.add(member.id);
        membershipChanged = true;
      }
    }
    if (membershipChanged) membershipRevision += 1;
  }

  function resetRound(): void {
    resetArenaRoundPhysics(island, round);
    membershipRevision += 1;
    eliminatedMemberIds.clear();
    authorityEffects.clear();
    winnerId = undefined;
    countdownMs = COUNTDOWN_MS;
    roundTimeMs = 0;
    phase = "countdown";
  }

  function advancePhysics(authorityTick: number): void {
    const targetTick = island.tick() + 1;
    const commands: PhysicsPredictionIslandCommand[] = [];
    let commandIndex = 0;
    const queuePatch = (
      memberId: string,
      patch: Extract<PhysicsPredictionIslandCommand, { type: "patch" }>["patch"]
    ) => {
      commands.push({
        type: "patch",
        tick: targetTick,
        sequence: authorityTick * 64 + commandIndex,
        memberId,
        patch
      });
      commandIndex += 1;
    };
    const queueDespawn = (memberId: string) => {
      commands.push({
        type: "despawn",
        tick: targetTick,
        sequence: authorityTick * 64 + commandIndex,
        memberId
      });
      commandIndex += 1;
    };

    actorControlsByMemberId.clear();
    for (let slot = 0; slot < ARENA_MAX_HUMANS; slot += 1) {
      const memberId = arenaPlayerMemberId(slot);
      const peerId = [...peerSlots.entries()].find((entry) => entry[1] === slot)?.[0];
      const input =
        peerId === undefined ? botInput(authorityTick, slot) : inputsByPeerId.get(peerId);
      actorControlsByMemberId.set(
        memberId,
        queueActorMotion(queuePatch, queueDespawn, memberId, input ?? neutralInput())
      );
    }
    for (let slot = 0; slot < 6; slot += 1) {
      const memberId = `bot.${slot}`;
      actorControlsByMemberId.set(
        memberId,
        queueActorMotion(queuePatch, queueDespawn, memberId, botInput(authorityTick, slot + 2))
      );
    }

    const angle = authorityTick * 0.028;
    queuePatch("hazard.sweeper", {
      rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
    });
    queuePatch("platform.left", {
      position: { x: -5.8, y: 1.2 + Math.sin(authorityTick * 0.025) * 1.15, z: -8.7 }
    });
    queuePatch("platform.right", {
      position: { x: 5.8, y: 1.2 + Math.sin(authorityTick * 0.025 + Math.PI) * 1.15, z: -8.7 }
    });

    for (const command of commands) island.queue(command);
    const advanced = island.advanceTo(targetTick);
    recordAuthorityContacts(advanced.contacts, targetTick);
  }

  function recordAuthorityContacts(
    contacts: readonly PhysicsPredictionIslandContact[],
    currentTick: number
  ): void {
    for (const contact of contacts) {
      if (contact.phase !== "enter") continue;
      const [colliderA, colliderB] = [contact.colliderA, contact.colliderB].sort();
      if (colliderA === undefined || colliderB === undefined) continue;
      const id = `round.${round}:${contact.tick}:${contact.kind}:${colliderA}|${colliderB}`;
      authorityEffects.set(id, {
        id,
        kind: "contact",
        contactKind: contact.kind,
        tick: contact.tick,
        colliderA,
        colliderB
      });
    }
    for (const [id, effect] of authorityEffects) {
      if (effect.tick < currentTick - AUTHORITY_EFFECT_RETENTION_TICKS) {
        authorityEffects.delete(id);
      }
    }
    while (authorityEffects.size > MAX_AUTHORITY_EFFECTS) {
      const oldest = authorityEffects.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      authorityEffects.delete(oldest);
    }
  }

  function queueActorMotion(
    queuePatch: (
      memberId: string,
      patch: Extract<PhysicsPredictionIslandCommand, { type: "patch" }>["patch"]
    ) => void,
    queueDespawn: (memberId: string) => void,
    memberId: string,
    input: ArenaMoveInput
  ): ArenaActorControl {
    const body = island.body(memberId);
    const step = resolveArenaActorAuthorityStep({
      phase,
      eliminated: eliminatedMemberIds.has(memberId),
      input,
      currentVelocity: body?.linearVelocity
    });
    if (step.action.type === "patch") {
      queuePatch(memberId, step.action.patch);
    } else if (step.action.type === "despawn") {
      queueDespawn(memberId);
    }
    return step.control;
  }

  function captureSnapshot(): ArenaSnapshot {
    const state = island.state();
    const result = projection.capture({
      islandId: ARENA_ISLAND_ID,
      generation: state.generation,
      tick: state.tick,
      membershipRevision,
      definitionVersion: ARENA_DEFINITION_VERSION,
      members: state.members
    });
    if (result.status !== "captured") {
      throw new Error(`Arena authority frame projection failed: ${result.status}`);
    }
    latestPayloadBytes = result.payloadBytes;
    const diagnostics = authorityLoop?.diagnostics();
    return {
      schemaVersion: ARENA_SCHEMA_VERSION,
      phase,
      round,
      countdownMs,
      roundTimeMs,
      ...(winnerId === undefined ? {} : { winnerId }),
      frame: result.frame,
      playerIdsByPeerId: Object.fromEntries(
        [...peerSlots.entries()].map(([peerId, slot]) => [peerId, arenaPlayerMemberId(slot)])
      ),
      inputAcksByPeerId: Object.fromEntries(inputAcksByPeerId),
      actorControlsByMemberId: Object.fromEntries(
        [...actorControlsByMemberId.entries()].sort(([left], [right]) => left.localeCompare(right))
      ),
      eliminatedMemberIds: [...eliminatedMemberIds].sort(),
      effects: [...authorityEffects.values()].sort(
        (left, right) => left.tick - right.tick || left.id.localeCompare(right.id)
      ),
      serverTime: now(),
      authority: {
        receivedInputBundles: diagnostics?.receivedInputs ?? 0,
        acceptedInputs: diagnostics?.acceptedInputs ?? 0,
        rejectedInputs: diagnostics?.rejectedInputs ?? 0,
        queuedInputs: diagnostics?.queuedInputs ?? 0,
        payloadBytes: latestPayloadBytes,
        activePeers: peerSlots.size
      }
    };
  }
}

function neutralInput(): ArenaMoveInput {
  return { sequence: 0, moveX: 0, moveZ: 0, jump: false };
}

function botInput(tick: number, slot: number): ArenaMoveInput {
  const weave = Math.sin(tick * 0.024 + slot * 1.7);
  return {
    sequence: tick,
    moveX: weave * 0.55,
    moveZ: -0.9,
    jump: tick % (110 + slot * 7) === 0
  };
}

export function arenaMemberDefinitionsById(
  definitions: readonly PhysicsPredictionIslandMemberDefinition[] = createArenaMemberDefinitions()
): ReadonlyMap<string, PhysicsPredictionIslandMemberDefinition> {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}

export function arenaVector(x: number, y: number, z: number): PhysicsVector {
  return { x, y, z };
}
