import { performance } from "node:perf_hooks";
import { createStandardMultiplayerPhysicsArenaAuthorityProjection } from "../packages/app-host/src";
import {
  createMultiplayerFixedStepInputBundle,
  createMultiplayerRuntime,
  type MultiplayerRuntime
} from "../packages/multiplayer-core/src";
import { createMemoryMultiplayerBackend } from "../packages/multiplayer-memory/src";
import {
  createPhysicsPredictionIsland,
  type PhysicsBackendAdapter,
  type PhysicsPredictionIslandCommand,
  type PhysicsPredictionIslandMemberDefinition,
  type PhysicsPredictionIslandStateSnapshot
} from "../packages/physics-core/src";
import { initRapier3dPhysicsBackend } from "../packages/physics-rapier3d/src";
import { prepareArenaBotNavigationRuntime } from "../apps/multiplayer-physics-arena-demo/src/ai/navigation";
import { ARENA_COMPILED_CONTENT } from "../apps/multiplayer-physics-arena-demo/src/content/default-content";
import { compileArenaStageItemManifest } from "../apps/multiplayer-physics-arena-demo/src/items/item-definition";
import { createArenaItemAuthorityRuntime } from "../apps/multiplayer-physics-arena-demo/src/items/item-authority-runtime";
import { createArenaImpactLedger } from "../apps/multiplayer-physics-arena-demo/src/match/impact-ledger";
import { createArenaParticipantRegistry } from "../apps/multiplayer-physics-arena-demo/src/match/participant-registry";
import { createArenaCombatAuthorityCoordinator } from "../apps/multiplayer-physics-arena-demo/src/server/arena-combat-authority";
import { createArenaAuthorityRuntime } from "../apps/multiplayer-physics-arena-demo/src/server/arena-authority";
import {
  ARENA_ENVIRONMENT,
  createArenaMemberDefinitions
} from "../apps/multiplayer-physics-arena-demo/src/shared/arena-definition";
import { arenaParticipantCommandEpoch } from "../apps/multiplayer-physics-arena-demo/src/shared/arena-identity";
import { createArenaPhysicsMaterialDefinitions } from "../apps/multiplayer-physics-arena-demo/src/shared/arena-physics-materials";
import {
  ARENA_ACTION_KIND,
  ARENA_DEFINITION_VERSION,
  ARENA_FIXED_STEP_MS,
  ARENA_INPUT_KIND,
  ARENA_ISLAND_ID,
  ARENA_SNAPSHOT_INTERVAL_TICKS,
  ARENA_SNAPSHOT_KIND
} from "../apps/multiplayer-physics-arena-demo/src/shared/config";

const checkEnabled = process.argv.includes("--check");
const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
const threadCpuUsage = (
  process as typeof process & {
    threadCpuUsage(previousValue?: NodeJS.CpuUsage): NodeJS.CpuUsage;
  }
).threadCpuUsage.bind(process);
const backend = await initRapier3dPhysicsBackend({
  id: "benchmark.arena-gameplay.rapier3d",
  groups: { "arena-item": 0b001, "arena-actor": 0b010, "arena-world": 0b100 }
});
const gameplayAuthority = await runGameplayAuthorityCase(backend);
const gameplayContracts = runGameplayContractCase();
const replay12 = runPersistentReplayCase(backend, 12);
const replay30 = runPersistentReplayCase(backend, 30);

async function runGameplayAuthorityCase(physicsBackend: PhysicsBackendAdapter) {
  const multiplayer = createMemoryMultiplayerBackend({ id: "arena-gameplay-benchmark" });
  const sessionId = "arena-gameplay-benchmark.session";
  const authorityPeerId = `${sessionId}.server`;
  const host = createMultiplayerRuntime({
    id: "arena-gameplay-benchmark.host",
    backend: multiplayer,
    connectContext: { localPeer: { id: authorityPeerId, role: "server" } }
  });
  const peers = [
    createBenchmarkClient(multiplayer, "arena-gameplay-benchmark.client-a", "peer.benchmark.a"),
    createBenchmarkClient(multiplayer, "arena-gameplay-benchmark.client-b", "peer.benchmark.b")
  ];
  await host.createSession({
    id: sessionId,
    kind: "private",
    authority: "server-authoritative",
    localPeer: { id: authorityPeerId, role: "server" }
  });
  await Promise.all(
    peers.map(({ runtime, peerId }) =>
      runtime.joinSession({ sessionId, localPeer: { id: peerId, role: "client" } })
    )
  );
  const navigation = await prepareArenaBotNavigationRuntime(ARENA_COMPILED_CONTENT);
  const authority = createArenaAuthorityRuntime({
    runtime: host,
    backend: physicsBackend,
    navigation,
    sessionId,
    authorityPeerId,
    now: () => 1_000
  });
  let observedSnapshots = 0;
  const payloadSamples: number[] = [];
  const confirmedItemActionIds = new Set<string>();
  const combatHitIds = new Set<string>();
  const unsubscribe = peers.map(({ runtime }, peerIndex) =>
    runtime.subscribe((message) => {
      if (message.kind !== ARENA_SNAPSHOT_KIND) return;
      observedSnapshots += 1;
      for (const action of message.payload.itemActions) {
        if (action.status === "confirmed") confirmedItemActionIds.add(action.id);
      }
      for (const hit of message.payload.combat.hits) combatHitIds.add(hit.id);
      if (peerIndex === 0) {
        payloadSamples.push(Buffer.byteLength(JSON.stringify(message.payload), "utf8"));
      }
    })
  );
  for (let installTick = 0; installTick < ARENA_SNAPSHOT_INTERVAL_TICKS; installTick += 1) {
    authority.tick();
  }
  const initialSnapshot = authority.latestSnapshot();
  for (const { peerId } of peers) commandEpoch(initialSnapshot, peerId);
  const authoritySamples: number[] = [];
  const authorityWallSamples: number[] = [];
  const authoritySimulationSamples: number[] = [];
  const authoritySnapshotSamples: number[] = [];
  let coldAuthorityMaxMs = 0;
  let maxMembers = 0;
  let maxCheckpointBytes = 0;
  let maxHistoryBytes = 0;
  let maxHistoryEntries = 0;
  let maxNavigationPending = 0;
  let maxNavigationRoutes = 0;
  const warmupTicks = 180;
  const measuredTicks = 720;
  let firstStageGameplayTicks = 0;

  try {
    for (let tick = 1; tick <= warmupTicks + measuredTicks; tick += 1) {
      const beforeTick = authority.latestSnapshot();
      if (beforeTick.phase === "running" && beforeTick.match.stageIndex === 0) {
        firstStageGameplayTicks += 1;
      }
      await sendGameplayInputs(authority, peers, tick, firstStageGameplayTicks);
      if (
        firstStageGameplayTicks > 0 &&
        firstStageGameplayTicks <= 120 &&
        shouldAttemptItemAction(authority.latestSnapshot(), peers)
      ) {
        await sendGameplayActions(authority, peers, tick);
      }
      if (tick === warmupTicks + 1) forceGc?.();
      const startedAt = performance.now();
      const cpuStartedAt = threadCpuUsage();
      authority.tick();
      const wallElapsedMs = performance.now() - startedAt;
      const elapsedMs = elapsedCpuMs(cpuStartedAt);
      if (tick <= warmupTicks) {
        coldAuthorityMaxMs = Math.max(coldAuthorityMaxMs, wallElapsedMs);
      } else {
        authoritySamples.push(elapsedMs);
        authorityWallSamples.push(wallElapsedMs);
        (tick % ARENA_SNAPSHOT_INTERVAL_TICKS === 0
          ? authoritySnapshotSamples
          : authoritySimulationSamples
        ).push(elapsedMs);
      }
      if (tick % 30 === 0 || tick === warmupTicks + measuredTicks) {
        const runtimeSnapshot = authority.snapshot();
        maxMembers = Math.max(maxMembers, runtimeSnapshot.physics.members);
        maxCheckpointBytes = Math.max(
          maxCheckpointBytes,
          runtimeSnapshot.physics.maxCheckpointBytesObserved
        );
        maxHistoryBytes = Math.max(maxHistoryBytes, runtimeSnapshot.physics.historyBytes);
        maxHistoryEntries = Math.max(maxHistoryEntries, runtimeSnapshot.physics.historyEntries);
        maxNavigationPending = Math.max(
          maxNavigationPending,
          runtimeSnapshot.navigation?.pendingRequests ?? 0
        );
        maxNavigationRoutes = Math.max(
          maxNavigationRoutes,
          runtimeSnapshot.navigation?.retainedRoutes ?? 0
        );
      }
    }
    await Promise.resolve();
    const beforeDispose = authority.snapshot();
    const gameplaySnapshot = authority.latestSnapshot();
    const authorityStats = summarize(authoritySamples);
    const authorityWallStats = summarize(authorityWallSamples);
    const authoritySimulationStats = summarize(authoritySimulationSamples);
    const authoritySnapshotStats = summarize(authoritySnapshotSamples);
    const payloadStats = summarize(payloadSamples);
    authority.dispose();
    const retained = authority.retainedState();
    return {
      profile: "full-authority-2h6b",
      humanPeers: 2,
      bots: beforeDispose.ai.agents,
      warmupTicks,
      measuredTicks,
      authorityStepP50Ms: authorityStats.p50,
      authorityStepP95Ms: authorityStats.p95,
      authorityStepP99Ms: authorityStats.p99,
      authorityStepMaxMs: authorityStats.max,
      authorityWallP95Ms: authorityWallStats.p95,
      authorityWallMaxMs: authorityWallStats.max,
      simulationStepP50Ms: authoritySimulationStats.p50,
      simulationStepP95Ms: authoritySimulationStats.p95,
      simulationStepMaxMs: authoritySimulationStats.max,
      snapshotStepP50Ms: authoritySnapshotStats.p50,
      snapshotStepP95Ms: authoritySnapshotStats.p95,
      snapshotStepMaxMs: authoritySnapshotStats.max,
      coldAuthorityMaxMs: round(coldAuthorityMaxMs),
      snapshotPayloadP50Bytes: payloadStats.p50,
      snapshotPayloadP95Bytes: payloadStats.p95,
      snapshotPayloadMaxBytes: payloadStats.max,
      maxMembers,
      maxCheckpointBytes,
      maxHistoryBytes,
      maxHistoryEntries,
      observedSnapshots,
      acceptedInputs: beforeDispose.input.fixedStepInput.acceptedFrames,
      rejectedInputs: beforeDispose.input.fixedStepInput.rejectedFrames,
      inputCapacityRejections:
        beforeDispose.input.fixedStepInput.frameCapacityRejections +
        beforeDispose.input.fixedStepInput.sourceCapacityRejections,
      itemCommandsApplied: beforeDispose.items.appliedCommands,
      confirmedItemActions: confirmedItemActionIds.size,
      itemActionStatuses: countBy(gameplaySnapshot.itemActions, (action) => action.status),
      itemActionCodes: countBy(gameplaySnapshot.itemActions, (action) => action.code),
      participantPositions: Object.fromEntries(
        gameplaySnapshot.participants.flatMap((participant) => {
          const member = gameplaySnapshot.frame.members.find(
            (candidate) => candidate.id === participant.actorMemberId
          );
          return member === undefined ? [] : [[participant.id, member.body.position] as const];
        })
      ),
      combatHits: combatHitIds.size,
      aiAgents: beforeDispose.ai.agents,
      aiDelayedDecisions: beforeDispose.ai.delayedDecisions,
      aiGoalSelections: beforeDispose.ai.behavior.goalSelections,
      aiMovementIntents: beforeDispose.ai.behavior.movementIntents,
      aiActionIntents: beforeDispose.ai.behavior.actionIntents,
      maxNavigationPending,
      maxNavigationRoutes,
      replayBudgetOverflows: beforeDispose.physics.replayBudgetOverflows,
      checkpointByteOverflows: beforeDispose.physics.checkpointByteOverflows,
      retainedAfterDispose: retainedCount(retained)
    };
  } finally {
    for (const stop of unsubscribe) stop();
    authority.dispose();
    await Promise.all(peers.map(({ runtime }) => runtime.dispose()));
    await host.dispose();
  }
}

function runGameplayContractCase() {
  const manifest = compileArenaStageItemManifest(ARENA_COMPILED_CONTENT.stages[1]!);
  const items = createArenaItemAuthorityRuntime({ definitions: manifest.definitions });
  const installed = items.installStage({
    stageInstanceId: "benchmark.contracts.stage",
    generation: { match: 1, stage: 2, membershipRevision: 1 },
    manifest,
    tick: 0
  });
  const item = installed.find((candidate) => candidate.definitionId === "item.foam-ball")!;
  const claim = items.dispatch({
    type: "claim",
    id: "benchmark.claim",
    itemId: item.id,
    itemGeneration: item.instanceGeneration,
    participantId: "player.0",
    tick: 1
  });
  const carried = items.dispatch({
    type: "resolve-claim",
    id: "benchmark.claim.resolve",
    claimId: "benchmark.claim",
    accepted: true,
    tick: 2
  });
  const windup = items.dispatch({
    type: "begin-action",
    id: "benchmark.action.begin",
    itemId: item.id,
    itemGeneration: item.instanceGeneration,
    participantId: "player.0",
    executionId: "benchmark.execution",
    tick: 3
  });
  const committed = items.dispatch({
    type: "commit-action",
    id: "benchmark.action.commit",
    executionId: "benchmark.execution",
    tick: windup.item?.deadlineTick ?? 11
  });

  const participants = createArenaParticipantRegistry();
  participants.register({
    id: "player.0",
    kind: "human-slot",
    slot: 0,
    actorMemberId: "player.0",
    tick: 0
  });
  participants.register({
    id: "bot.0",
    kind: "bot",
    slot: 1,
    actorMemberId: "bot.0",
    tick: 0
  });
  const impacts = createArenaImpactLedger({ impulseThreshold: 1 });
  const combat = createArenaCombatAuthorityCoordinator({
    participants,
    impactLedger: impacts,
    definitions: manifest.definitions,
    fixedDeltaMs: ARENA_FIXED_STEP_MS
  });
  combat.advance(12);
  combat.resolve({
    id: "benchmark.execution:hit:bot.0",
    executionId: "benchmark.execution",
    itemId: item.id,
    itemGeneration: committed.item?.instanceGeneration ?? 2,
    definitionId: item.definitionId,
    sourceParticipantId: "player.0",
    targetParticipantId: "bot.0",
    tick: 12,
    charge: 1,
    direction: { x: 1, y: 0, z: 0 }
  });
  const itemDiagnostics = items.diagnostics();
  const combatDiagnostics = combat.diagnostics();
  const result = {
    profile: "deterministic-item-combat-gas-contracts",
    claimApplied: Number(claim.status === "applied"),
    carryApplied: Number(carried.status === "applied"),
    actionApplied: Number(committed.status === "applied"),
    itemAppliedCommands: itemDiagnostics.appliedCommands,
    itemTransitions: itemDiagnostics.transitions,
    combatHits: combat.publicHits().length,
    gasTraces: combatDiagnostics.gasTraces,
    combatTraces: combatDiagnostics.combatTraces,
    retainedAfterDispose: 0
  };
  combat.dispose();
  impacts.dispose();
  participants.dispose();
  items.dispose();
  const disposedItems = items.diagnostics();
  const disposedCombat = combat.diagnostics();
  result.retainedAfterDispose =
    disposedItems.instances +
    disposedItems.commands +
    disposedItems.traceEntries +
    disposedCombat.actors +
    disposedCombat.pendingKnockbacks;
  return result;
}

function runPersistentReplayCase(physicsBackend: PhysicsBackendAdapter, rollbackTicks: 12 | 30) {
  const profile = { actors: 8, dynamicMembers: 16, kinematicMembers: 12 };
  const definitions = createStressDefinitions(profile);
  const island = createPhysicsPredictionIsland({
    backend: physicsBackend,
    generation: `arena-gameplay-replay-${rollbackTicks}`,
    initialMembers: definitions,
    environment: ARENA_ENVIRONMENT,
    fixedDeltaMs: ARENA_FIXED_STEP_MS,
    maxHistoryTicks: 140,
    maxCheckpointBytes: 2 * 1024 * 1024,
    maxHistoryBytes: 96 * 1024 * 1024,
    maxReplayTicksPerOperation: 64,
    maxMembers: 64,
    maxCommands: 8_192,
    scene: arenaScene()
  });
  const projection = createStandardMultiplayerPhysicsArenaAuthorityProjection({
    maxMembers: 64,
    maxPayloadBytes: 128 * 1024
  });
  const simulatedTicks = 132;
  const authoritySamples: number[] = [];
  const replaySamples: number[] = [];
  const replayWallSamples: number[] = [];
  const payloadSamples: number[] = [];
  let authoritySnapshot: PhysicsPredictionIslandStateSnapshot | undefined;
  let coldReplayMs = 0;
  let replayedTicks = 0;
  let checksum = 0;

  for (let tick = 1; tick <= simulatedTicks; tick += 1) {
    const startedAt = performance.now();
    queueGameplayCommands(island, definitions, tick);
    island.advanceTo(tick);
    if (tick > 16) authoritySamples.push(performance.now() - startedAt);
    if (tick % ARENA_SNAPSHOT_INTERVAL_TICKS === 0) {
      const state = island.state();
      const captured = projection.capture({
        islandId: ARENA_ISLAND_ID,
        generation: state.generation,
        tick,
        membershipRevision: 1,
        definitionVersion: ARENA_DEFINITION_VERSION,
        members: state.members
      });
      if (captured.status !== "captured") throw new Error(`Replay projection: ${captured.status}`);
      payloadSamples.push(captured.payloadBytes);
      if (tick === simulatedTicks - rollbackTicks) {
        authoritySnapshot = {
          generation: captured.frame.generation,
          tick: captured.frame.tick,
          members: captured.frame.members
        };
      }
    }
  }
  if (authoritySnapshot === undefined) throw new Error("Missing persistent replay checkpoint");
  const originalX = authoritySnapshot.members[0]!.body.position.x;
  for (let sample = 0; sample < 80; sample += 1) {
    authoritySnapshot.members[0]!.body.position.x = originalX + (sample % 2 === 0 ? 0.02 : -0.02);
    if (sample === 16) forceGc?.();
    const startedAt = performance.now();
    const cpuStartedAt = threadCpuUsage();
    const reconciliation = island.reconcile(authoritySnapshot);
    const wallElapsedMs = performance.now() - startedAt;
    const elapsedMs = elapsedCpuMs(cpuStartedAt);
    if (reconciliation.status !== "corrected" && reconciliation.status !== "confirmed") {
      throw new Error(`Persistent replay failed: ${reconciliation.status}`);
    }
    replayedTicks += reconciliation.replayedTicks;
    if (sample < 16) coldReplayMs = Math.max(coldReplayMs, wallElapsedMs);
    else {
      replaySamples.push(elapsedMs);
      replayWallSamples.push(wallElapsedMs);
    }
    checksum += island.body(definitions[sample % definitions.length]!.id)?.position.x ?? 0;
  }
  const diagnostics = island.diagnostics();
  const authorityStats = summarize(authoritySamples);
  const replayStats = summarize(replaySamples);
  const replayWallStats = summarize(replayWallSamples);
  const payloadStats = summarize(payloadSamples);
  island.dispose();
  const disposed = island.diagnostics();
  return {
    profile: `target-36-replay-${rollbackTicks}`,
    members: definitions.length,
    actors: profile.actors,
    dynamicMembers: profile.dynamicMembers,
    kinematicMembers: profile.kinematicMembers,
    simulatedTicks,
    rollbackTicks,
    measuredReplays: replaySamples.length,
    authorityStepP50Ms: authorityStats.p50,
    authorityStepP95Ms: authorityStats.p95,
    authorityStepMaxMs: authorityStats.max,
    replayP50Ms: replayStats.p50,
    replayP95Ms: replayStats.p95,
    replayMaxMs: replayStats.max,
    replayWallP95Ms: replayWallStats.p95,
    replayWallMaxMs: replayWallStats.max,
    coldReplayMaxMs: round(coldReplayMs),
    snapshotPayloadP50Bytes: payloadStats.p50,
    snapshotPayloadP95Bytes: payloadStats.p95,
    snapshotPayloadMaxBytes: payloadStats.max,
    maxCheckpointBytes: diagnostics.maxCheckpointBytesObserved,
    maxHistoryBytes: diagnostics.historyBytes,
    maxHistoryEntries: diagnostics.historyEntries,
    replayedTicks,
    replayBudgetOverflows: diagnostics.replayBudgetOverflows,
    hardCorrectionFailures: diagnostics.hardCorrectionFailures,
    retainedAfterDispose: disposed.members + disposed.historyEntries + disposed.commands,
    checksum: round(checksum)
  };
}

function createBenchmarkClient(
  backend: ReturnType<typeof createMemoryMultiplayerBackend>,
  id: string,
  peerId: string
): { runtime: MultiplayerRuntime; peerId: string } {
  return {
    peerId,
    runtime: createMultiplayerRuntime({
      id,
      backend,
      connectContext: { localPeer: { id: peerId, role: "client" } }
    })
  };
}

async function sendGameplayInputs(
  authority: ReturnType<typeof createArenaAuthorityRuntime>,
  peers: Array<{ runtime: MultiplayerRuntime; peerId: string }>,
  tick: number,
  gameplayTick: number
): Promise<void> {
  await Promise.all(
    peers.map(({ runtime, peerId }, index) => {
      const snapshot = authority.latestSnapshot();
      const movement = movementTowardItem(snapshot, peerId, index, gameplayTick);
      return runtime.send({
        channel: "reliable",
        kind: ARENA_INPUT_KIND,
        payload: createMultiplayerFixedStepInputBundle([
          {
            sequence: tick,
            payload: {
              sequence: tick,
              moveX: movement.x,
              moveZ: movement.z,
              jump: tick % (90 + index * 15) === 0,
              authorityEpoch: commandEpoch(snapshot, peerId)
            }
          }
        ])
      });
    })
  );
}

async function sendGameplayActions(
  authority: ReturnType<typeof createArenaAuthorityRuntime>,
  peers: Array<{ runtime: MultiplayerRuntime; peerId: string }>,
  tick: number
): Promise<void> {
  const snapshot = authority.latestSnapshot();
  await Promise.all(
    peers.map(({ runtime, peerId }, index) => {
      const participant = snapshot.participants.find((candidate) => candidate.peerId === peerId);
      const held = snapshot.items.find(
        (item) => item.ownerParticipantId === participant?.id && item.state === "carried"
      );
      const target = snapshot.items.find((item) => item.state === "world");
      const commandId = `${peerId}.benchmark-action.${tick}`;
      const type = held === undefined ? "interact" : "use";
      const aim = aimAtOtherParticipant(snapshot, participant?.actorMemberId, peerId, index);
      return runtime.send({
        id: commandId,
        correlationId: commandId,
        channel: "reliable",
        kind: ARENA_ACTION_KIND,
        payload: {
          type,
          commandId,
          inputSequence: tick,
          aimX: aim.x,
          aimZ: aim.z,
          charge: type === "use" ? 1 : 0,
          authorityEpoch: commandEpoch(snapshot, peerId),
          ...(type !== "interact" || target === undefined
            ? {}
            : { targetItemId: target.id, targetItemGeneration: target.instanceGeneration })
        }
      });
    })
  );
}

function shouldAttemptItemAction(
  snapshot: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["latestSnapshot"]>,
  peers: Array<{ peerId: string }>
): boolean {
  const peerIds = new Set(peers.map(({ peerId }) => peerId));
  const participants = snapshot.participants.filter(
    (participant) => participant.peerId !== undefined && peerIds.has(participant.peerId)
  );
  if (
    snapshot.items.some(
      (item) =>
        item.state === "carried" &&
        participants.some((participant) => participant.id === item.ownerParticipantId)
    )
  ) {
    return true;
  }
  const item = snapshot.items.find((candidate) => candidate.state === "world");
  const itemBody = snapshot.frame.members.find((member) => member.id === item?.bodyMemberId);
  if (itemBody === undefined) return false;
  return participants.some((participant) => {
    const actor = snapshot.frame.members.find((member) => member.id === participant.actorMemberId);
    return (
      actor !== undefined &&
      Math.hypot(
        actor.body.position.x - itemBody.body.position.x,
        (actor.body.position.z ?? 0) - (itemBody.body.position.z ?? 0)
      ) <= 2.7
    );
  });
}

function movementTowardItem(
  snapshot: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["latestSnapshot"]>,
  peerId: string,
  fallbackIndex: number,
  gameplayTick: number
): { x: number; z: number } {
  if (gameplayTick === 0) return { x: 0, z: 0 };
  if (gameplayTick <= 90) {
    return { x: fallbackIndex === 0 ? 0.58 : -0.58, z: -0.82 };
  }
  const participant = snapshot.participants.find((candidate) => candidate.peerId === peerId);
  const actor = snapshot.frame.members.find(
    (candidate) => candidate.id === participant?.actorMemberId
  );
  const targetItem = snapshot.items.find((item) => item.state === "world");
  const target = snapshot.frame.members.find(
    (candidate) => candidate.id === targetItem?.bodyMemberId
  );
  if (actor === undefined || target === undefined) {
    return { x: Math.sin(gameplayTick * 0.031 + fallbackIndex), z: -1 };
  }
  const x = target.body.position.x - actor.body.position.x;
  const z = (target.body.position.z ?? 0) - (actor.body.position.z ?? 0);
  const length = Math.hypot(x, z);
  return length <= 0.15 ? { x: 0, z: 0 } : { x: x / length, z: z / length };
}

function aimAtOtherParticipant(
  snapshot: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["latestSnapshot"]>,
  actorMemberId: string | undefined,
  peerId: string,
  fallbackIndex: number
): { x: number; z: number } {
  const actor = snapshot.frame.members.find((member) => member.id === actorMemberId);
  const targetParticipant = snapshot.participants.find(
    (candidate) =>
      candidate.peerId !== peerId &&
      candidate.actorMemberId !== undefined &&
      candidate.status === "active"
  );
  const target = snapshot.frame.members.find(
    (member) => member.id === targetParticipant?.actorMemberId
  );
  if (actor === undefined || target === undefined) {
    return { x: fallbackIndex === 0 ? 0.35 : -0.35, z: -1 };
  }
  const x = target.body.position.x - actor.body.position.x;
  const z = (target.body.position.z ?? 0) - (actor.body.position.z ?? 0);
  const length = Math.hypot(x, z);
  return length <= 0.001 ? { x: 0, z: -1 } : { x: x / length, z: z / length };
}

function commandEpoch(
  snapshot: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["latestSnapshot"]>,
  peerId: string
): string {
  const participant = snapshot.participants.find((candidate) => candidate.peerId === peerId);
  if (participant === undefined) throw new Error(`Missing benchmark participant: ${peerId}`);
  return arenaParticipantCommandEpoch(snapshot.frame.generation, participant.revision);
}

function createStressDefinitions(profile: {
  actors: number;
  dynamicMembers: number;
  kinematicMembers: number;
}): PhysicsPredictionIslandMemberDefinition[] {
  const base = createArenaMemberDefinitions();
  const actors = base.filter(
    (definition) => definition.id.startsWith("player.") || definition.id.startsWith("bot.")
  );
  const dynamicMembers = base.filter(
    (definition) => definition.body.kind === "dynamic" && !actors.includes(definition)
  );
  const kinematicMembers = base.filter((definition) => definition.body.kind === "kinematic");
  return [
    ...structuredClone(actors.slice(0, profile.actors)),
    ...createProfileMembers("dynamic", dynamicMembers, profile.dynamicMembers),
    ...createProfileMembers("kinematic", kinematicMembers, profile.kinematicMembers)
  ];
}

function createProfileMembers(
  kind: "dynamic" | "kinematic",
  templates: readonly PhysicsPredictionIslandMemberDefinition[],
  count: number
): PhysicsPredictionIslandMemberDefinition[] {
  if (templates.length === 0) throw new Error(`Missing Arena ${kind} benchmark templates`);
  const result = structuredClone(templates.slice(0, count));
  for (let index = result.length; index < count; index += 1) {
    const template = templates[index % templates.length]!;
    const id = `benchmark.${kind}.${index}`;
    result.push({
      ...structuredClone(template),
      id,
      body: {
        ...structuredClone(template.body),
        id,
        position: {
          x: ((index % 8) - 3.5) * 2.2,
          y: kind === "dynamic" ? 1.4 + (Math.floor(index / 8) % 2) * 1.1 : 0.8,
          z: 3.5 - Math.floor(index / 8) * 3
        }
      },
      colliders: template.colliders?.map((collider, colliderIndex) => ({
        ...structuredClone(collider),
        id: `${id}.collider.${colliderIndex}`
      }))
    });
  }
  return result;
}

function queueGameplayCommands(
  island: ReturnType<typeof createPhysicsPredictionIsland>,
  definitions: readonly PhysicsPredictionIslandMemberDefinition[],
  tick: number
): void {
  for (const [index, definition] of definitions.entries()) {
    const actor = definition.id.startsWith("player.") || definition.id.startsWith("bot.");
    const phase = tick * 0.023 + index * 0.37;
    if (definition.body.kind === "dynamic" && !actor && tick % 30 !== 0) continue;
    const body = actor ? island.body(definition.id) : undefined;
    if (actor && body === undefined) continue;
    const command: PhysicsPredictionIslandCommand =
      definition.body.kind === "kinematic"
        ? {
            type: "patch",
            tick,
            sequence: tick * 128 + index,
            memberId: definition.id,
            patch: {
              position: {
                x: definition.body.position?.x ?? 0,
                y: (definition.body.position?.y ?? 0) + Math.sin(phase) * 0.3,
                z: definition.body.position?.z ?? 0
              }
            }
          }
        : !actor
          ? {
              type: "body-command",
              tick,
              sequence: tick * 128 + index,
              memberId: definition.id,
              command: {
                type: "linear-impulse",
                impulse: { x: Math.sin(phase) * 0.4, y: 0.15, z: Math.cos(phase) * 0.4 },
                wake: "wake"
              }
            }
          : {
              type: "patch",
              tick,
              sequence: tick * 128 + index,
              memberId: definition.id,
              patch: {
                linearVelocity: {
                  x: Math.sin(phase) * 2.8,
                  y: body!.linearVelocity.y,
                  z: -2.4 + Math.cos(phase) * 0.5
                }
              }
            };
    const queued = island.queue(command);
    if (queued.status !== "queued") throw new Error(`Benchmark command: ${queued.status}`);
  }
}

function arenaScene() {
  return {
    dimension: "3d" as const,
    gravity: { x: 0, y: -18, z: 0 },
    materialDefinitions: createArenaPhysicsMaterialDefinitions({ content: ARENA_COMPILED_CONTENT })
  };
}

function retainedCount(
  retained: ReturnType<ReturnType<typeof createArenaAuthorityRuntime>["retainedState"]>
) {
  return Object.entries(retained).reduce(
    (total, [key, value]) =>
      key === "disposed" || typeof value !== "number" ? total : total + value,
    0
  );
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const id = key(value);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

function summarize(samples: readonly number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    max: round(sorted.at(-1) ?? 0)
  };
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function elapsedCpuMs(startedAt: NodeJS.CpuUsage): number {
  const elapsed = threadCpuUsage(startedAt);
  return (elapsed.user + elapsed.system) / 1_000;
}

type BenchmarkCases = {
  gameplayAuthority: typeof gameplayAuthority;
  gameplayContracts: typeof gameplayContracts;
  replay12: typeof replay12;
  replay30: typeof replay30;
};
type Budget = {
  caseId: keyof BenchmarkCases;
  metric: string;
  kind: "maximum" | "minimum";
  value: number;
};

const BUDGETS: Budget[] = [
  { caseId: "gameplayAuthority", metric: "authorityStepP95Ms", kind: "maximum", value: 4 },
  { caseId: "gameplayAuthority", metric: "authorityStepP99Ms", kind: "maximum", value: 8 },
  {
    caseId: "gameplayAuthority",
    metric: "snapshotPayloadP95Bytes",
    kind: "maximum",
    value: 32 * 1024
  },
  {
    caseId: "gameplayAuthority",
    metric: "snapshotPayloadMaxBytes",
    kind: "maximum",
    value: 64 * 1024
  },
  {
    caseId: "gameplayAuthority",
    metric: "maxCheckpointBytes",
    kind: "maximum",
    value: 512 * 1024
  },
  {
    caseId: "gameplayAuthority",
    metric: "maxHistoryBytes",
    kind: "maximum",
    value: 96 * 1024 * 1024
  },
  { caseId: "gameplayAuthority", metric: "observedSnapshots", kind: "minimum", value: 1 },
  { caseId: "gameplayAuthority", metric: "acceptedInputs", kind: "minimum", value: 1 },
  { caseId: "gameplayAuthority", metric: "inputCapacityRejections", kind: "maximum", value: 0 },
  { caseId: "gameplayAuthority", metric: "aiAgents", kind: "minimum", value: 6 },
  { caseId: "gameplayAuthority", metric: "aiGoalSelections", kind: "minimum", value: 1 },
  { caseId: "gameplayAuthority", metric: "aiMovementIntents", kind: "minimum", value: 1 },
  { caseId: "gameplayAuthority", metric: "replayBudgetOverflows", kind: "maximum", value: 0 },
  { caseId: "gameplayAuthority", metric: "checkpointByteOverflows", kind: "maximum", value: 0 },
  { caseId: "gameplayAuthority", metric: "retainedAfterDispose", kind: "maximum", value: 0 },
  { caseId: "gameplayContracts", metric: "claimApplied", kind: "minimum", value: 1 },
  { caseId: "gameplayContracts", metric: "carryApplied", kind: "minimum", value: 1 },
  { caseId: "gameplayContracts", metric: "actionApplied", kind: "minimum", value: 1 },
  { caseId: "gameplayContracts", metric: "itemAppliedCommands", kind: "minimum", value: 4 },
  { caseId: "gameplayContracts", metric: "combatHits", kind: "minimum", value: 1 },
  { caseId: "gameplayContracts", metric: "gasTraces", kind: "minimum", value: 1 },
  { caseId: "gameplayContracts", metric: "retainedAfterDispose", kind: "maximum", value: 0 },
  { caseId: "replay12", metric: "members", kind: "minimum", value: 36 },
  { caseId: "replay12", metric: "authorityStepP95Ms", kind: "maximum", value: 4 },
  { caseId: "replay12", metric: "authorityStepMaxMs", kind: "maximum", value: 8 },
  { caseId: "replay12", metric: "replayP95Ms", kind: "maximum", value: 5 },
  { caseId: "replay12", metric: "snapshotPayloadP95Bytes", kind: "maximum", value: 32 * 1024 },
  { caseId: "replay12", metric: "snapshotPayloadMaxBytes", kind: "maximum", value: 64 * 1024 },
  { caseId: "replay12", metric: "maxCheckpointBytes", kind: "maximum", value: 512 * 1024 },
  { caseId: "replay12", metric: "maxHistoryBytes", kind: "maximum", value: 96 * 1024 * 1024 },
  { caseId: "replay12", metric: "replayBudgetOverflows", kind: "maximum", value: 0 },
  { caseId: "replay12", metric: "hardCorrectionFailures", kind: "maximum", value: 0 },
  { caseId: "replay12", metric: "retainedAfterDispose", kind: "maximum", value: 0 },
  { caseId: "replay30", metric: "members", kind: "minimum", value: 36 },
  { caseId: "replay30", metric: "replayP95Ms", kind: "maximum", value: 12 },
  { caseId: "replay30", metric: "replayBudgetOverflows", kind: "maximum", value: 0 },
  { caseId: "replay30", metric: "hardCorrectionFailures", kind: "maximum", value: 0 },
  { caseId: "replay30", metric: "retainedAfterDispose", kind: "maximum", value: 0 }
];

function checkBudgets(cases: BenchmarkCases): string[] {
  const failures: string[] = [];
  for (const budget of BUDGETS) {
    const value = (cases[budget.caseId] as Record<string, unknown>)[budget.metric];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      failures.push(`${budget.caseId}.${budget.metric}: missing numeric metric`);
    } else if (budget.kind === "maximum" && value > budget.value) {
      failures.push(`${budget.caseId}.${budget.metric}: ${value} > ${budget.value}`);
    } else if (budget.kind === "minimum" && value < budget.value) {
      failures.push(`${budget.caseId}.${budget.metric}: ${value} < ${budget.value}`);
    }
  }
  return failures;
}

const result = {
  benchmark: "arena-gameplay",
  methodology: {
    backend: "real Rapier3D compat WASM + Recast WASM + in-memory multiplayer transport",
    fixtureConstruction:
      "Rapier/Recast initialization, navmesh baking, connection setup and warmup excluded",
    authority:
      "two connected human peers, six authority bots, character motor, stage hazards, items, Combat/GAS, AI/Nav and full Arena snapshot projection",
    replay:
      "persistent 36-member full-scene island; eight actor controls, twelve kinematic hazards and intermittent impulses for sixteen dynamic item/prop bodies",
    timing:
      "current-thread CPU time drives deterministic budgets; wall-clock p95/max remain visible diagnostics; one explicit pre-sample GC when available and no work removed inside samples",
    reports: [
      "authority fixed-step CPU p50/p95/p99/max, wall p95/max and cold wall max",
      "12/30-tick reconcile CPU p50/p95/max, wall p95/max and cold wall max",
      "full gameplay and physics projection payload",
      "checkpoint/history/capacity diagnostics",
      "AI/Nav activity and dispose retained state"
    ]
  },
  cases: { gameplayAuthority, gameplayContracts, replay12, replay30 }
};
const failures = checkEnabled ? checkBudgets(result.cases) : [];

console.log(
  JSON.stringify(
    {
      ...result,
      ...(checkEnabled
        ? { budgetCheck: { budgets: BUDGETS.length, passed: failures.length === 0, failures } }
        : {})
    },
    null,
    2
  )
);

if (failures.length > 0) process.exitCode = 1;
