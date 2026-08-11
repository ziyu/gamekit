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
import { createArenaImpactLedger, type ArenaImpactLedgerDiagnostics } from "../match/impact-ledger";
import {
  createArenaParticipantRegistry,
  type ArenaParticipantRegistry,
  type ArenaParticipantRegistryDiagnostics
} from "../match/participant-registry";
import { createArenaStageRule } from "../match/stage-rule";
import {
  settleArenaStageRanking,
  type ArenaStageRankingFact,
  type ArenaStageSettlement
} from "../match/ranking-policy";
import { readArenaItemAction, type ArenaItemAction } from "../items/item-action";
import {
  ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID,
  createArenaCharacterIntent,
  createArenaCharacterMotorContributor
} from "../shared/arena-control";
import { arenaGenerationKey } from "../shared/arena-identity";
import {
  ARENA_ENVIRONMENT,
  createArenaMemberDefinitions,
  isArenaActor
} from "../shared/arena-definition";
import { resetArenaRoundPhysics, resolveArenaActorAuthorityStep } from "./arena-actor-lifecycle";
import {
  ARENA_DEFINITION_VERSION,
  ARENA_FIXED_STEP_MS,
  ARENA_ACTION_KIND,
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
import {
  createArenaItemAuthorityCoordinator,
  type ArenaItemAuthorityCoordinatorDiagnostics
} from "./arena-item-authority";

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
  impacts: ArenaImpactLedgerDiagnostics;
  items: ArenaItemAuthorityCoordinatorDiagnostics["runtime"];
  settlement?: ArenaStageSettlement | undefined;
};

export type ArenaAuthorityRuntime = {
  tick(deltaMs?: number): void;
  snapshot(): ArenaAuthorityRuntimeSnapshot;
  latestSnapshot(): ArenaSnapshot;
  retainedState(): ArenaAuthorityRetainedState;
  dispose(): void;
};

export type ArenaAuthorityRetainedState = {
  disposed: boolean;
  participants: number;
  physicsMembers: number;
  physicsHistoryEntries: number;
  physicsCommands: number;
  impactEntries: number;
  impactAttributions: number;
  inputs: number;
  inputAcks: number;
  actorControls: number;
  authorityEffects: number;
  rankingFacts: number;
  stageEntrants: number;
  stageResults: number;
  latestSnapshots: number;
  itemInstances: number;
  itemCommands: number;
  itemActions: number;
  itemExecutions: number;
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
    capacity: 64,
    traceCapacity: 256
  });
  installInitialParticipants(participants, definitions);
  const director = createArenaMatchDirector({
    stageRules: content.stages.map((stage) => createArenaStageRule(stage.definition)),
    countdownTicks: Math.ceil(COUNTDOWN_MS / ARENA_FIXED_STEP_MS),
    resultsTicks: Math.ceil(RESULTS_DURATION_MS / ARENA_FIXED_STEP_MS),
    traceCapacity: 128
  });
  const impactLedger = createArenaImpactLedger({
    entryCapacity: 256,
    attributionCapacity: 64,
    retentionTicks: 600,
    knockoutWindowTicks: 240,
    assistWindowTicks: 360,
    impulseThreshold: 1,
    maxAssists: 3
  });
  const characterMotor = createArenaCharacterMotorContributor();
  const initialGeneration = { match: 1, stage: 1, membershipRevision: 1 };
  const itemAuthority = createArenaItemAuthorityCoordinator({
    stages: content.stages,
    participants,
    initialStageInstanceId: director.snapshot().stageInstanceId,
    initialGeneration,
    initialTick: 0
  });
  const island = createPhysicsPredictionIsland({
    backend: options.backend,
    generation: arenaGenerationKey(initialGeneration),
    initialMembers: [...definitions, ...itemAuthority.initialMembers()],
    environment: ARENA_ENVIRONMENT,
    fixedDeltaMs: ARENA_FIXED_STEP_MS,
    maxHistoryTicks: 180,
    maxCheckpointBytes: 8 * 1024 * 1024,
    maxHistoryBytes: 96 * 1024 * 1024,
    maxReplayTicksPerOperation: 120,
    maxMembers: 32,
    maxCommands: 2_048,
    auxiliaryContributors: [characterMotor, itemAuthority.auxiliaryContributor],
    scene: {
      dimension: "3d",
      gravity: { x: 0, y: -18, z: 0 },
      materialDefinitions: [
        { id: "course", friction: 0.85, restitution: 0.05 },
        { id: "actor", friction: 0.55, restitution: 0.08, density: 1 },
        { id: "prop", friction: 0.65, restitution: 0.45, density: 0.7 },
        { id: "hazard", friction: 0.45, restitution: 0.3 },
        ...itemAuthority.materialDefinitions()
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
  const rankingSpatialFacts = new Map<
    string,
    { progress: number; progressTick: number; centerDistance: number }
  >();
  let stageEntrantParticipantIds = new Set(
    participants
      .list()
      .filter((participant) => participant.actorMemberId !== undefined)
      .map((participant) => participant.id)
  );
  let membershipRevision = 1;
  let latestSettlement: ArenaStageSettlement | undefined;
  const stageResults: ArenaStageSettlement[] = [];
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
    ArenaItemAction,
    ArenaMoveInput,
    ArenaSnapshot
  >({
    runtime: options.runtime,
    binding,
    actionKind: ARENA_ACTION_KIND,
    inputKind: ARENA_INPUT_KIND,
    snapshotKind: ARENA_SNAPSHOT_KIND,
    snapshotVersion: ARENA_SCHEMA_VERSION,
    readAction: readArenaItemAction,
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
    maxActionsPerSourcePerTick: 4,
    maxQueuedActionsPerSource: 16,
    maxQueuedActions: ARENA_MAX_HUMANS * 16,
    handleAction({ message, payload }) {
      const participant = participants.byPeerId(message.sourcePeerId);
      if (
        participant === undefined ||
        !participant.connected ||
        participant.actorMemberId === undefined ||
        participant.status !== "active" ||
        director.snapshot().phase !== "running"
      ) {
        return {
          allowed: false,
          code: "arena-item-action-unbound",
          reason: "Arena item actions require an active running participant."
        };
      }
      if (itemAuthority.hasAction(payload.commandId)) return { allowed: true };
      if (itemAuthority.pendingActionCount() >= ARENA_MAX_HUMANS * 4) {
        return {
          allowed: false,
          code: "arena-item-action-queue-full",
          reason: "Arena item action queue is full for this tick."
        };
      }
      itemAuthority.queueAction(participant.id, payload);
      return { allowed: true };
    },
    handleInput({ message, payload }) {
      const participant = participants.byPeerId(message.sourcePeerId);
      if (
        participant === undefined ||
        !participant.connected ||
        participant.actorMemberId === undefined ||
        participant.status === "spectator" ||
        participant.status === "next-match" ||
        participant.status === "eliminated" ||
        participant.status === "finished"
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

  let latest: ArenaSnapshot | undefined = captureSnapshot();

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
        participants: participants.diagnostics(),
        impacts: impactLedger.diagnostics(),
        items: itemAuthority.diagnostics().runtime,
        ...(latestSettlement === undefined ? {} : { settlement: structuredClone(latestSettlement) })
      };
    },
    latestSnapshot() {
      if (latest === undefined) throw new Error("Knockout arena authority is disposed");
      return structuredClone(latest);
    },
    retainedState() {
      const physics = island.diagnostics();
      const participantDiagnostics = participants.diagnostics();
      const impacts = impactLedger.diagnostics();
      return {
        disposed,
        participants: participantDiagnostics.participants,
        physicsMembers: physics.members,
        physicsHistoryEntries: physics.historyEntries,
        physicsCommands: physics.commands,
        impactEntries: impacts.entries,
        impactAttributions: impacts.attributions,
        inputs: inputsByPeerId.size,
        inputAcks: inputAcksByPeerId.size,
        actorControls: actorControlsByMemberId.size,
        authorityEffects: authorityEffects.size,
        rankingFacts: rankingSpatialFacts.size,
        stageEntrants: stageEntrantParticipantIds.size,
        stageResults: stageResults.length,
        latestSnapshots: latest === undefined ? 0 : 1,
        itemInstances: itemAuthority.diagnostics().runtime.instances,
        itemCommands: itemAuthority.diagnostics().runtime.commands,
        itemActions:
          itemAuthority.diagnostics().publicActions + itemAuthority.diagnostics().pendingActions,
        itemExecutions: itemAuthority.diagnostics().pendingExecutions
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      authorityLoop.dispose();
      binding.close("Knockout arena authority disposed");
      island.dispose();
      director.dispose();
      participants.dispose();
      impactLedger.dispose();
      itemAuthority.dispose();
      inputsByPeerId.clear();
      inputAcksByPeerId.clear();
      actorControlsByMemberId.clear();
      authorityEffects.clear();
      rankingSpatialFacts.clear();
      stageEntrantParticipantIds.clear();
      stageResults.length = 0;
      latestSettlement = undefined;
      latest = undefined;
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
        if (existing.actorMemberId !== undefined) {
          if (!inputsByPeerId.has(peer.id)) inputsByPeerId.set(peer.id, neutralInput());
          if (!inputAcksByPeerId.has(peer.id)) inputAcksByPeerId.set(peer.id, 0);
        }
        continue;
      }
      const match = director.snapshot();
      const canClaimInitialSeat =
        match.stageIndex === 0 && (match.phase === "lobby" || match.phase === "countdown");
      const slot = canClaimInitialSeat
        ? participants
            .list()
            .filter((participant) => participant.kind === "human-slot")
            .find((participant) => participant.peerId === undefined)
        : undefined;
      if (slot !== undefined) {
        const bound = participants.bindPeer(slot.id, peer.id, authorityTick);
        if (bound.status !== "applied" && bound.status !== "unchanged") continue;
        inputsByPeerId.set(peer.id, neutralInput());
        inputAcksByPeerId.set(peer.id, 0);
      } else {
        registerLateSpectator(peer.id, authorityTick);
      }
    }
  }

  function registerLateSpectator(peerId: string, authorityTick: number): void {
    const records = participants.list();
    const participantId = `spectator.${peerId}`;
    const registered = participants.register({
      id: participantId,
      kind: "spectator",
      slot: records.reduce((highest, participant) => Math.max(highest, participant.slot), -1) + 1,
      status: "next-match",
      tick: authorityTick
    });
    if (registered.status !== "applied" && registered.status !== "conflict") return;
    participants.bindPeer(participantId, peerId, authorityTick);
  }

  function advanceMatch(authorityTick: number): void {
    if (director.snapshot().phase === "running") {
      updateRankingSpatialFacts(authorityTick);
      detectEliminations(authorityTick);
    }
    const entrantParticipantIds = participants
      .list()
      .filter((participant) => stageEntrantParticipantIds.has(participant.id))
      .map((participant) => participant.id);
    const activeParticipantIds = participants
      .competitiveParticipantIds()
      .filter((participantId) => stageEntrantParticipantIds.has(participantId));
    const result = director.advance({
      tick: authorityTick,
      connectedHumans: participants
        .list()
        .filter((participant) => participant.kind === "human-slot" && participant.connected).length,
      entrantParticipantIds,
      activeParticipantIds
    });
    for (const action of result.actions) {
      if (action.type === "stage-started") {
        activateStageParticipants(authorityTick, action.stageInstanceId);
      } else if (action.type === "stage-completed") {
        settleStageParticipants(authorityTick, action.reason, action.winnerParticipantId);
      } else if (action.type === "stage-prepared") {
        prepareStageParticipants(authorityTick, action.stageInstanceId, action.stageIndex);
      } else {
        participants.resetForMatch(authorityTick);
        membershipRevision += 1;
        stageEntrantParticipantIds = new Set(
          participants
            .list()
            .filter((participant) => participant.actorMemberId !== undefined)
            .map((participant) => participant.id)
        );
        const generation = {
          match: action.round,
          stage: action.stageIndex + 1,
          membershipRevision
        };
        resetArenaRoundPhysics(island, arenaGenerationKey(generation));
        installStageItems(action.stageIndex, action.stageInstanceId, authorityTick, generation);
        authorityEffects.clear();
        rankingSpatialFacts.clear();
        impactLedger.reset();
        latestSettlement = undefined;
        stageResults.length = 0;
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
      } else if (participant.status === "qualified") {
        participants.transition(participant.id, "active", {
          reason: "next-stage",
          tick: authorityTick,
          stageInstanceId
        });
      } else if (
        participant.status === "disconnected" &&
        (participant.resumeStatus === "lobby" || participant.resumeStatus === "qualified")
      ) {
        participants.transition(participant.id, "active", {
          reason: participant.resumeStatus === "qualified" ? "next-stage" : "match-started",
          tick: authorityTick,
          stageInstanceId
        });
        if (participant.peerId !== undefined) {
          participants.disconnectPeer(participant.peerId, authorityTick);
        }
      }
    }
  }

  function prepareStageParticipants(
    authorityTick: number,
    stageInstanceId: string,
    stageIndex: number
  ): void {
    const nextEntrants = new Set<string>();
    for (const participant of participants.list()) {
      if (participant.actorMemberId === undefined) continue;
      const qualified =
        participant.status === "qualified" ||
        (participant.status === "disconnected" && participant.resumeStatus === "qualified");
      if (qualified) {
        nextEntrants.add(participant.id);
        continue;
      }
      if (
        participant.status === "eliminated" ||
        participant.status === "finished" ||
        participant.status === "disconnected"
      ) {
        const wasDisconnected = participant.status === "disconnected";
        participants.transition(participant.id, "spectator", {
          reason: "spectating",
          tick: authorityTick,
          stageInstanceId
        });
        if (wasDisconnected && participant.peerId !== undefined) {
          participants.disconnectPeer(participant.peerId, authorityTick);
        }
      }
    }
    stageEntrantParticipantIds = nextEntrants;
    membershipRevision += 1;
    const generation = {
      match: director.snapshot().round,
      stage: stageIndex + 1,
      membershipRevision
    };
    resetArenaRoundPhysics(island, arenaGenerationKey(generation));
    installStageItems(stageIndex, stageInstanceId, authorityTick, generation);
    authorityEffects.clear();
    rankingSpatialFacts.clear();
    impactLedger.reset();
    latestSettlement = undefined;
  }

  function installStageItems(
    stageIndex: number,
    stageInstanceId: string,
    authorityTick: number,
    generation: { match: number; stage: number; membershipRevision: number }
  ): void {
    itemAuthority.installStage({
      stageIndex,
      stageInstanceId,
      generation,
      tick: authorityTick
    });
  }

  function settleStageParticipants(
    authorityTick: number,
    completionReason: string,
    winnerParticipantId: string | undefined
  ): void {
    const match = director.snapshot();
    const stage = content.stages[match.stageIndex]!.definition;
    const stageInstanceId = match.stageInstanceId;
    const settlement = settleArenaStageRanking({
      stageInstanceId,
      stageKind: stage.kind,
      qualificationCount: stage.qualificationCount,
      completionReason,
      facts: createRankingFacts(authorityTick)
    });
    if (
      winnerParticipantId !== undefined &&
      settlement.winnerParticipantId !== winnerParticipantId
    ) {
      throw new Error("Arena director winner disagrees with deterministic ranking");
    }
    let eliminated = 0;
    for (const placement of settlement.placements) {
      const participant = participants.participant(placement.participantId);
      if (participant === undefined) continue;
      const to = placement.outcome === "winner" ? "finished" : placement.outcome;
      const result = participants.transition(participant.id, to, {
        reason:
          placement.outcome === "winner"
            ? "stage-finished"
            : placement.outcome === "qualified"
              ? "stage-qualified"
              : "stage-eliminated",
        tick: authorityTick,
        stageInstanceId
      });
      if (to === "eliminated" && result.status === "applied") eliminated += 1;
    }
    if (eliminated > 0) membershipRevision += 1;
    latestSettlement = settlement;
    stageResults.push(settlement);
    while (stageResults.length > content.stages.length) stageResults.shift();
  }

  function createRankingFacts(authorityTick: number): ArenaStageRankingFact[] {
    const attributions = impactLedger.attributions();
    const activeIds = new Set(participants.competitiveParticipantIds());
    return participants
      .list()
      .filter((participant) => stageEntrantParticipantIds.has(participant.id))
      .map((participant) => {
        const spatial = rankingSpatialFacts.get(participant.id) ?? {
          progress: -1_000_000,
          progressTick: authorityTick,
          centerDistance: 1_000_000
        };
        return {
          participantId: participant.id,
          eligible: participant.status !== "eliminated",
          active: activeIds.has(participant.id),
          finished: participant.status === "finished",
          checkpointCount: 0,
          progress: spatial.progress,
          progressTick: spatial.progressTick,
          objectiveScore: 0,
          knockoutCredits: attributions.filter(
            (entry) => entry.knockoutParticipantId === participant.id
          ).length,
          assistCredits: attributions.filter((entry) =>
            entry.assistParticipantIds.includes(participant.id)
          ).length,
          instability: 0,
          centerDistance: spatial.centerDistance,
          ...(participant.status === "eliminated"
            ? { eliminationTick: participant.statusChangedAtTick }
            : {})
        };
      });
  }

  function updateRankingSpatialFacts(authorityTick: number): void {
    for (const member of island.state().members) {
      if (!isArenaActor(member.id)) continue;
      const participant = participants.byActorMemberId(member.id);
      if (participant === undefined) continue;
      rankingSpatialFacts.set(participant.id, {
        progress: -(member.body.position.z ?? 0),
        progressTick: authorityTick,
        centerDistance: Math.hypot(member.body.position.x, member.body.position.z ?? 0)
      });
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
      if (result.status === "applied") {
        membershipChanged = true;
        impactLedger.attribute({
          eliminationId: `${director.snapshot().stageInstanceId}:elimination:${participant.id}`,
          targetParticipantId: participant.id,
          tick: authorityTick
        });
      }
    }
    if (membershipChanged) membershipRevision += 1;
  }

  function advancePhysics(authorityTick: number): void {
    const targetTick = island.tick() + 1;
    const commands: PhysicsPredictionIslandCommand[] = [];
    let commandIndex = 0;
    const nextSequence = () => authorityTick * 64 + commandIndex++;
    const queuePatch = (
      memberId: string,
      patch: Extract<PhysicsPredictionIslandCommand, { type: "patch" }>["patch"]
    ) => {
      commands.push({
        type: "patch",
        tick: targetTick,
        sequence: nextSequence(),
        memberId,
        patch
      });
    };
    const queueDespawn = (memberId: string) => {
      commands.push({
        type: "despawn",
        tick: targetTick,
        sequence: nextSequence(),
        memberId
      });
    };
    const queueCharacterControl = (command: CharacterMotorPredictionCommand) => {
      commands.push({
        type: "auxiliary",
        tick: targetTick,
        sequence: nextSequence(),
        contributorId: ARENA_CHARACTER_MOTOR_CONTRIBUTOR_ID,
        payload: command
      });
    };

    itemAuthority.advancePhysics({
      authorityTick,
      targetTick,
      island,
      controlsByMemberId: actorControlsByMemberId,
      nextSequence,
      commands
    });

    actorControlsByMemberId.clear();
    for (let slot = 0; slot < ARENA_MAX_HUMANS; slot += 1) {
      const memberId = arenaPlayerMemberId(slot);
      const participant = participants.byActorMemberId(memberId);
      const peerId = participant?.connected ? participant.peerId : undefined;
      const input =
        peerId === undefined ? botInput(authorityTick, slot) : inputsByPeerId.get(peerId);
      const control = queueActorMotion(
        queueCharacterControl,
        queueDespawn,
        memberId,
        input ?? neutralInput()
      );
      actorControlsByMemberId.set(memberId, control);
      itemAuthority.queueCarryModifier({
        memberId,
        control,
        tick: targetTick,
        nextSequence,
        commands
      });
    }
    for (let slot = 0; slot < 6; slot += 1) {
      const memberId = `bot.${slot}`;
      const control = queueActorMotion(
        queueCharacterControl,
        queueDespawn,
        memberId,
        botInput(authorityTick, slot + 2)
      );
      actorControlsByMemberId.set(memberId, control);
      itemAuthority.queueCarryModifier({
        memberId,
        control,
        tick: targetTick,
        nextSequence,
        commands
      });
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
      eliminated:
        participant === undefined ||
        !stageEntrantParticipantIds.has(participant.id) ||
        participant.status === "eliminated" ||
        participant.status === "spectator" ||
        participant.status === "next-match",
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
    const winnerId =
      match.winnerParticipantId ??
      (match.phase === "results" && match.stageKind === "final"
        ? latestSettlement?.winnerParticipantId
        : undefined);
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
      ...(winnerId === undefined ? {} : { winnerId }),
      match: {
        matchId: match.matchId,
        phaseInstanceId: match.phaseInstanceId,
        stageIndex: match.stageIndex,
        stageCount: match.stageCount,
        stageId: match.stageId,
        stageKind: match.stageKind,
        stageInstanceId: match.stageInstanceId,
        startedAtTick: match.startedAtTick,
        ...(match.stageStartedAtTick === undefined
          ? {}
          : { stageStartedAtTick: match.stageStartedAtTick }),
        ...(match.deadlineTick === undefined ? {} : { deadlineTick: match.deadlineTick }),
        membershipRevision
      },
      participants: participants.list().map((participant) => ({
        id: participant.id,
        kind: participant.kind,
        slot: participant.slot,
        ...(participant.actorMemberId === undefined
          ? {}
          : { actorMemberId: participant.actorMemberId }),
        ...(participant.peerId === undefined ? {} : { peerId: participant.peerId }),
        connected: participant.connected,
        status: participant.status,
        ...(participant.resumeStatus === undefined
          ? {}
          : { resumeStatus: participant.resumeStatus }),
        ...(participant.stageInstanceId === undefined
          ? {}
          : { stageInstanceId: participant.stageInstanceId }),
        revision: participant.revision
      })),
      stageResults: structuredClone(stageResults),
      items: itemAuthority.publicItems(state.members),
      itemActions: itemAuthority.publicActions(),
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
      eliminatedMemberIds: definitions.flatMap((definition) => {
        if (!isArenaActor(definition.id)) return [];
        const participant = participants.byActorMemberId(definition.id);
        return participant === undefined ||
          !stageEntrantParticipantIds.has(participant.id) ||
          participant.status === "eliminated" ||
          participant.status === "spectator"
          ? [definition.id]
          : [];
      }),
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
