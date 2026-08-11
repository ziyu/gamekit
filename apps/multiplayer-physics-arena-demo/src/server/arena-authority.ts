import { createStandardMultiplayerPhysicsArenaAuthorityProjection } from "@gamekit/app-host";
import type { CharacterMotorPredictionCommand } from "@gamekit/character-controller";
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

import { compileArenaContent, createArenaDataRegistry } from "../content/registry";
import { createArenaMatchDirector, type ArenaMatchDirectorSnapshot } from "../match/match-director";
import {
  createArenaParticipantRegistry,
  type ArenaParticipantRegistry,
  type ArenaParticipantRegistryDiagnostics
} from "../match/participant-registry";
import { createArenaStageRule } from "../match/stage-rule";
import {
  ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID,
  createArenaCharacterIntent,
  createArenaCharacterMotorContributor
} from "../shared/arena-control";
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
  type ArenaActorControlFrame,
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
  match: ArenaMatchDirectorSnapshot;
  participants: ArenaParticipantRegistryDiagnostics;
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
const RESULTS_DURATION_MS = 5_000;
const AUTHORITY_EFFECT_RETENTION_TICKS = 60;
const MAX_AUTHORITY_EFFECTS = 128;

export function createArenaAuthorityRuntime(
  options: CreateArenaAuthorityRuntimeOptions
): ArenaAuthorityRuntime {
  const now = options.now ?? (() => Date.now());
  const definitions = createArenaMemberDefinitions();
  const content = compileArenaContent(createArenaDataRegistry());
  const participants = createArenaParticipantRegistry({
    capacity: content.matchRule.participantCount,
    traceCapacity: 256
  });
  installInitialParticipants(participants, definitions);
  const director = createArenaMatchDirector({
    stageRule: createArenaStageRule(content.stages[0]!.definition),
    countdownTicks: Math.ceil(COUNTDOWN_MS / ARENA_FIXED_STEP_MS),
    resultsTicks: Math.ceil(RESULTS_DURATION_MS / ARENA_FIXED_STEP_MS),
    traceCapacity: 128
  });
  const characterMotor = createArenaCharacterMotorContributor();
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
    auxiliaryContributors: [characterMotor],
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
  const inputsByPeerId = new Map<string, ArenaMoveInput>();
  const inputAcksByPeerId = new Map<string, number>();
  const actorControlsByMemberId = new Map<string, ArenaActorControlFrame>();
  const authorityEffects = new Map<string, ArenaAuthorityEffectCue>();
  let membershipRevision = 1;
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
      const participant = participants.byPeerId(message.sourcePeerId);
      if (
        participant === undefined ||
        !participant.connected ||
        participant.actorMemberId === undefined
      ) {
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
    tick({ tick }) {
      reconcilePeers(tick);
      advanceMatch(tick);
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
      const match = director.snapshot();
      return {
        phase: match.phase,
        round: match.round,
        tick: diagnostics.tick,
        activePeers: participants.connectedBindings().length,
        frameMembers: island.state().members.length,
        input: diagnostics,
        physics: island.diagnostics(),
        match,
        participants: participants.diagnostics()
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
      director.dispose();
      participants.dispose();
      inputsByPeerId.clear();
      inputAcksByPeerId.clear();
      actorControlsByMemberId.clear();
      authorityEffects.clear();
    }
  };

  function reconcilePeers(authorityTick: number): void {
    const peers = options.runtime
      .peers()
      .filter(
        (peer) =>
          peer.id !== options.authorityPeerId &&
          peer.role !== "server" &&
          peer.status === "connected"
      );
    const activeIds = new Set(peers.map((peer) => peer.id));
    for (const binding of participants.connectedBindings()) {
      if (!activeIds.has(binding.peerId)) {
        authorityLoop.releasePeer(binding.peerId);
        participants.disconnectPeer(binding.peerId, authorityTick);
        inputsByPeerId.delete(binding.peerId);
        inputAcksByPeerId.delete(binding.peerId);
      }
    }
    for (const peer of peers) {
      const existing = participants.byPeerId(peer.id);
      if (existing !== undefined) {
        if (!existing.connected) participants.reconnectPeer(peer.id, authorityTick);
        if (!inputsByPeerId.has(peer.id)) inputsByPeerId.set(peer.id, neutralInput());
        if (!inputAcksByPeerId.has(peer.id)) inputAcksByPeerId.set(peer.id, 0);
        continue;
      }
      if (director.snapshot().phase === "running" || director.snapshot().phase === "results") {
        continue;
      }
      const slot = participants
        .list()
        .filter((participant) => participant.kind === "human-slot")
        .find((participant) => participant.peerId === undefined);
      if (slot === undefined) continue;
      const bound = participants.bindPeer(slot.id, peer.id, authorityTick);
      if (bound.status !== "applied" && bound.status !== "unchanged") {
        continue;
      }
      inputsByPeerId.set(peer.id, neutralInput());
      inputAcksByPeerId.set(peer.id, 0);
    }
  }

  function advanceMatch(authorityTick: number): void {
    if (director.snapshot().phase === "running") detectEliminations(authorityTick);
    const entrantParticipantIds = participants
      .list()
      .filter((participant) => participant.actorMemberId !== undefined)
      .map((participant) => participant.id);
    const result = director.advance({
      tick: authorityTick,
      connectedHumans: participants.connectedBindings().length,
      entrantParticipantIds,
      activeParticipantIds: participants.competitiveParticipantIds()
    });
    for (const action of result.actions) {
      if (action.type === "stage-started") {
        activateStageParticipants(authorityTick, action.stageInstanceId);
      } else if (action.type === "stage-completed") {
        settleStageParticipants(authorityTick, action.winnerParticipantId);
      } else {
        resetArenaRoundPhysics(island, action.round);
        participants.resetForMatch(authorityTick);
        membershipRevision += 1;
        authorityEffects.clear();
      }
    }
  }

  function activateStageParticipants(authorityTick: number, stageInstanceId: string): void {
    for (const participant of participants.list()) {
      if (participant.actorMemberId === undefined) continue;
      if (participant.status === "lobby") {
        participants.transition(participant.id, "active", {
          reason: "match-started",
          tick: authorityTick,
          stageInstanceId
        });
      } else if (participant.status === "disconnected") {
        participants.transition(participant.id, "active", {
          reason: "match-started",
          tick: authorityTick,
          stageInstanceId
        });
        if (participant.peerId !== undefined) {
          participants.disconnectPeer(participant.peerId, authorityTick);
        }
      }
    }
  }

  function settleStageParticipants(
    authorityTick: number,
    winnerParticipantId: string | undefined
  ): void {
    if (winnerParticipantId === undefined) return;
    const stageInstanceId = director.snapshot().stageInstanceId;
    for (const participant of participants.list()) {
      if (participant.status !== "active" && participant.status !== "qualified") continue;
      participants.transition(
        participant.id,
        participant.id === winnerParticipantId ? "finished" : "eliminated",
        {
          reason: participant.id === winnerParticipantId ? "stage-finished" : "stage-eliminated",
          tick: authorityTick,
          stageInstanceId
        }
      );
    }
  }

  function detectEliminations(authorityTick: number): void {
    let membershipChanged = false;
    for (const member of island.state().members) {
      if (!isArenaActor(member.id) || member.body.position.y >= -4) continue;
      const participant = participants.byActorMemberId(member.id);
      if (participant === undefined || participant.status === "eliminated") continue;
      const result = participants.transition(participant.id, "eliminated", {
        reason: "stage-eliminated",
        tick: authorityTick,
        stageInstanceId: director.snapshot().stageInstanceId
      });
      if (result.status === "applied") membershipChanged = true;
    }
    if (membershipChanged) membershipRevision += 1;
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
    const queueCharacterControl = (command: CharacterMotorPredictionCommand) => {
      commands.push({
        type: "auxiliary",
        tick: targetTick,
        sequence: authorityTick * 64 + commandIndex,
        contributorId: ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID,
        payload: command
      });
      commandIndex += 1;
    };

    actorControlsByMemberId.clear();
    for (let slot = 0; slot < ARENA_MAX_HUMANS; slot += 1) {
      const memberId = arenaPlayerMemberId(slot);
      const participant = participants.byActorMemberId(memberId);
      const peerId = participant?.connected ? participant.peerId : undefined;
      const input =
        peerId === undefined ? botInput(authorityTick, slot) : inputsByPeerId.get(peerId);
      actorControlsByMemberId.set(
        memberId,
        queueActorMotion(queueCharacterControl, queueDespawn, memberId, input ?? neutralInput())
      );
    }
    for (let slot = 0; slot < 6; slot += 1) {
      const memberId = `bot.${slot}`;
      actorControlsByMemberId.set(
        memberId,
        queueActorMotion(
          queueCharacterControl,
          queueDespawn,
          memberId,
          botInput(authorityTick, slot + 2)
        )
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
      const id = `round.${director.snapshot().round}:${contact.tick}:${contact.kind}:${colliderA}|${colliderB}`;
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
    queueControl: (command: CharacterMotorPredictionCommand) => void,
    queueDespawn: (memberId: string) => void,
    memberId: string,
    input: ArenaMoveInput
  ): ArenaActorControlFrame {
    const body = island.body(memberId);
    const participant = participants.byActorMemberId(memberId);
    const step = resolveArenaActorAuthorityStep({
      phase: director.snapshot().phase,
      eliminated: participant?.status === "eliminated",
      input,
      memberAvailable: body !== undefined
    });
    if (step.action.type === "control") {
      queueControl({
        type: "control",
        memberId,
        intent: createArenaCharacterIntent(step.control, step.control.sequence)
      });
    } else if (step.action.type === "despawn") {
      queueDespawn(memberId);
      queueControl({ type: "remove", memberId });
    }
    return step.control;
  }

  function captureSnapshot(): ArenaSnapshot {
    const state = island.state();
    const match = director.snapshot();
    const result = projection.capture({
      islandId: ARENA_ISLAND_ID,
      generation: state.generation,
      tick: state.tick,
      membershipRevision,
      definitionVersion: ARENA_DEFINITION_VERSION,
      members: state.members,
      auxiliary: state.auxiliary
    });
    if (result.status !== "captured") {
      throw new Error(`Arena authority frame projection failed: ${result.status}`);
    }
    latestPayloadBytes = result.payloadBytes;
    const diagnostics = authorityLoop?.diagnostics();
    return {
      schemaVersion: ARENA_SCHEMA_VERSION,
      phase: match.phase,
      round: match.round,
      countdownMs: director.countdownMs(
        ARENA_FIXED_STEP_MS,
        authorityLoop?.diagnostics().tick ?? 0
      ),
      roundTimeMs: director.runningTimeMs(
        ARENA_FIXED_STEP_MS,
        authorityLoop?.diagnostics().tick ?? 0
      ),
      ...(match.winnerParticipantId === undefined ? {} : { winnerId: match.winnerParticipantId }),
      frame: result.frame,
      playerIdsByPeerId: Object.fromEntries(
        participants
          .connectedBindings()
          .flatMap((binding) =>
            binding.actorMemberId === undefined ? [] : [[binding.peerId, binding.actorMemberId]]
          )
      ),
      inputAcksByPeerId: Object.fromEntries(inputAcksByPeerId),
      actorControlsByMemberId: Object.fromEntries(
        [...actorControlsByMemberId.entries()].sort(([left], [right]) => left.localeCompare(right))
      ),
      eliminatedMemberIds: participants.eliminatedActorMemberIds(),
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
        activePeers: participants.connectedBindings().length
      }
    };
  }
}

function installInitialParticipants(
  registry: ArenaParticipantRegistry,
  definitions: readonly PhysicsPredictionIslandMemberDefinition[]
): void {
  const actors = definitions.filter((definition) => isArenaActor(definition.id));
  for (const [slot, actor] of actors.entries()) {
    const result = registry.register({
      id: actor.id,
      kind: actor.id.startsWith("player.") ? "human-slot" : "bot",
      slot,
      actorMemberId: actor.id,
      tick: 0
    });
    if (result.status !== "applied") {
      throw new Error(`Arena participant registration failed: ${actor.id}:${result.status}`);
    }
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
