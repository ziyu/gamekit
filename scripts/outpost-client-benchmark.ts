import { performance } from "node:perf_hooks";

import { createOutpostDataRegistry } from "../apps/multiplayer-outpost-siege-demo/src/content";
import {
  createOutpostClientShadowRuntime,
  type OutpostClientAuthoritySnapshot
} from "../apps/multiplayer-outpost-siege-demo/src/gameplay";
import {
  createOutpostColyseusState,
  projectOutpostMatchToColyseusState,
  readOutpostColyseusStateUpdate,
  type OutpostMatchAuthoritySnapshot
} from "../apps/multiplayer-outpost-siege-demo/src/realtime";
import {
  createMultiplayerRuntime,
  type MultiplayerBackendAdapter,
  type MultiplayerBackendListener,
  type MultiplayerMessageEnvelope,
  type MultiplayerRuntime,
  type MultiplayerSession
} from "../packages/multiplayer-core/src";
import type { PhysicsBackendAdapter, PhysicsScene } from "../packages/physics-core/src";
import { initRapier2dPhysicsBackend } from "../packages/physics-rapier2d/src";
import { createKootaWorld } from "../packages/world-koota/src";
import {
  checkOutpostClientBudgets,
  outpostClientBudgetCount,
  type OutpostClientBenchmarkResult
} from "./outpost-client-benchmark-budget";

const WARMUP_SNAPSHOTS = 500;
const FOUR_PLAYER_SNAPSHOTS = 10_000;
const CHURN_SNAPSHOTS = 2_000;
const COMBAT_WARMUP_SNAPSHOTS = 40;
const COMBAT_SNAPSHOTS = 500;
const COMBAT_ENEMIES = 200;
const COMBAT_PROJECTILES = 256;
const COMBAT_CUES = 64;
const FIXED_DELTA_MS = 1000 / 60;

async function main(): Promise<void> {
  const multiplayer = createBenchmarkMultiplayer();
  const physics = trackPhysicsScenes(
    await initRapier2dPhysicsBackend({ id: "outpost-client-benchmark.rapier2d" })
  );
  await multiplayer.runtime.createSession({
    id: "benchmark.session",
    authority: "server-authoritative",
    localPeer: {
      id: "benchmark.peer.1",
      role: "client",
      playerId: "benchmark.player.1"
    }
  });
  const world = createKootaWorld();
  const client = createOutpostClientShadowRuntime({
    dataRegistry: createOutpostDataRegistry(),
    world,
    multiplayer: multiplayer.runtime,
    physicsBackend: physics.backend,
    localPlayerId: "benchmark.player.1"
  });
  client.runtime.start();
  const snapshot = createSnapshot();

  for (let tick = 0; tick < WARMUP_SNAPSHOTS; tick += 1) {
    advanceSnapshot(snapshot, tick + 1, 4);
    applySnapshot(client, multiplayer.emit, snapshot);
  }

  const fourPlayerStartedAt = performance.now();
  for (let tick = 0; tick < FOUR_PLAYER_SNAPSHOTS; tick += 1) {
    advanceSnapshot(snapshot, WARMUP_SNAPSHOTS + tick + 1, 4);
    applySnapshot(client, multiplayer.emit, snapshot);
  }
  const fourPlayerDurationMs = performance.now() - fourPlayerStartedAt;

  const churnStartedAt = performance.now();
  for (let tick = 0; tick < CHURN_SNAPSHOTS; tick += 1) {
    advanceSnapshot(
      snapshot,
      WARMUP_SNAPSHOTS + FOUR_PLAYER_SNAPSHOTS + tick + 1,
      tick % 2 === 0 ? 3 : 4
    );
    applySnapshot(client, multiplayer.emit, snapshot);
  }
  const churnDurationMs = performance.now() - churnStartedAt;

  const combatTickOffset = WARMUP_SNAPSHOTS + FOUR_PLAYER_SNAPSHOTS + CHURN_SNAPSHOTS;
  for (let tick = 0; tick < COMBAT_WARMUP_SNAPSHOTS; tick += 1) {
    advanceCombatSnapshot(snapshot, combatTickOffset + tick + 1);
    applySnapshot(client, multiplayer.emit, snapshot);
  }
  const expectedCombatEntities = 4 + COMBAT_ENEMIES + COMBAT_PROJECTILES;
  if (world.count() !== expectedCombatEntities) {
    throw new Error(
      `Outpost combat benchmark expected ${expectedCombatEntities} materialized entities, received ${world.count()}.`
    );
  }
  const combatStartedAt = performance.now();
  for (let tick = 0; tick < COMBAT_SNAPSHOTS; tick += 1) {
    advanceCombatSnapshot(snapshot, combatTickOffset + COMBAT_WARMUP_SNAPSHOTS + tick + 1);
    applySnapshot(client, multiplayer.emit, snapshot);
  }
  const combatDurationMs = performance.now() - combatStartedAt;
  const maximumCombatEntities = world.count();

  snapshot.combat.cueWatermark = 0;
  snapshot.combat.cues = [];
  const schemaState = createOutpostColyseusState("benchmark.session", "benchmark.session.server");
  let maximumEstimatedSchemaStateBytes = 0;
  for (let tick = 0; tick < WARMUP_SNAPSHOTS; tick += 1) {
    advanceSnapshot(snapshot, tick + 1, 4);
    projectOutpostMatchToColyseusState(schemaState, snapshot, tick * 50);
    readOutpostColyseusStateUpdate(schemaState);
  }
  const schemaStartedAt = performance.now();
  for (let tick = 0; tick < FOUR_PLAYER_SNAPSHOTS; tick += 1) {
    advanceSnapshot(snapshot, tick + 1, 4);
    projectOutpostMatchToColyseusState(schemaState, snapshot, tick * 50);
    const update = readOutpostColyseusStateUpdate(schemaState);
    if (update === undefined) {
      throw new Error("Outpost client benchmark could not decode projected Schema state.");
    }
    maximumEstimatedSchemaStateBytes = Math.max(
      maximumEstimatedSchemaStateBytes,
      update.stateBytes ?? 0
    );
  }
  const schemaDurationMs = performance.now() - schemaStartedAt;
  let maximumCombatEstimatedSchemaStateBytes = 0;
  for (let tick = 0; tick < COMBAT_WARMUP_SNAPSHOTS; tick += 1) {
    advanceCombatSnapshot(snapshot, combatTickOffset + tick + 1);
    projectOutpostMatchToColyseusState(schemaState, snapshot, tick * 50);
    readOutpostColyseusStateUpdate(schemaState);
  }
  const combatSchemaStartedAt = performance.now();
  for (let tick = 0; tick < COMBAT_SNAPSHOTS; tick += 1) {
    advanceCombatSnapshot(snapshot, combatTickOffset + COMBAT_WARMUP_SNAPSHOTS + tick + 1);
    projectOutpostMatchToColyseusState(schemaState, snapshot, tick * 50);
    const update = readOutpostColyseusStateUpdate(schemaState);
    if (update === undefined) {
      throw new Error("Outpost combat benchmark could not decode projected Schema state.");
    }
    maximumCombatEstimatedSchemaStateBytes = Math.max(
      maximumCombatEstimatedSchemaStateBytes,
      update.stateBytes ?? 0
    );
  }
  const combatSchemaDurationMs = performance.now() - combatSchemaStartedAt;
  advanceSnapshot(snapshot, combatTickOffset + COMBAT_WARMUP_SNAPSHOTS + COMBAT_SNAPSHOTS + 1, 4);
  applySnapshot(client, multiplayer.emit, snapshot);

  if (world.count() !== 4 || client.identity.snapshot().length !== 4) {
    throw new Error("Outpost client benchmark expected four materialized player shadows.");
  }
  const diagnostics = client.snapshot();
  const predictionDiagnostics = diagnostics.replication?.prediction;
  const transitionDiagnostics = predictionDiagnostics?.transition as
    | { cachedFrames?: number }
    | undefined;
  const combatPresentationDiagnostics = diagnostics.combatPresentation;
  if (
    combatPresentationDiagnostics.retainedCues !== COMBAT_CUES ||
    combatPresentationDiagnostics.droppedCues !== 0
  ) {
    throw new Error(
      `Outpost client benchmark expected ${COMBAT_CUES} retained combat cues without drops, received ${combatPresentationDiagnostics.retainedCues} retained and ${combatPresentationDiagnostics.droppedCues} dropped.`
    );
  }
  client.runtime.dispose();
  const retainedCombatCuesAfterDispose = client.combatPresentation.snapshot().retainedCues;
  await multiplayer.runtime.dispose();

  const result: OutpostClientBenchmarkResult = {
    microsecondsPerFourPlayerSnapshot: round(
      (fourPlayerDurationMs * 1_000) / FOUR_PLAYER_SNAPSHOTS
    ),
    microsecondsPerPlayerChurnSnapshot: round((churnDurationMs * 1_000) / CHURN_SNAPSHOTS),
    microsecondsPerFourPlayerSchemaProjectionAndDecode: round(
      (schemaDurationMs * 1_000) / FOUR_PLAYER_SNAPSHOTS
    ),
    microsecondsPerCombatSnapshot: round((combatDurationMs * 1_000) / COMBAT_SNAPSHOTS),
    microsecondsPerCombatSchemaProjectionAndDecode: round(
      (combatSchemaDurationMs * 1_000) / COMBAT_SNAPSHOTS
    ),
    maximumEstimatedSchemaStateBytes,
    maximumCombatEstimatedSchemaStateBytes,
    maximumCombatEntities,
    maximumCombatCueHistory: combatPresentationDiagnostics.retainedCues,
    combatCueDropped: combatPresentationDiagnostics.droppedCues,
    rejectedSnapshots: diagnostics.rejectedSnapshots,
    predictionPendingInputs: predictionDiagnostics?.pendingInputs ?? 0,
    predictionCachedFrames: transitionDiagnostics?.cachedFrames ?? 0,
    retainedEntitiesAfterDispose: world.count(),
    retainedPhysicsScenesAfterDispose: physics.activeScenes(),
    retainedCombatCuesAfterDispose
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkOutpostClientBudgets(result) : [];
  console.log(
    JSON.stringify(
      {
        benchmark: "outpost-browser-authority-shadow",
        profile: {
          warmupSnapshots: WARMUP_SNAPSHOTS,
          fourPlayerSnapshots: FOUR_PLAYER_SNAPSHOTS,
          churnSnapshots: CHURN_SNAPSHOTS,
          playersPerSnapshot: 4,
          combatSnapshots: COMBAT_SNAPSHOTS,
          combatEnemies: COMBAT_ENEMIES,
          combatProjectiles: COMBAT_PROJECTILES,
          combatCuesPerSnapshot: COMBAT_CUES
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: outpostClientBudgetCount(),
                passed: failures.length === 0,
                failures
              }
            }
          : {})
      },
      null,
      2
    )
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function createSnapshot(): OutpostMatchAuthoritySnapshot {
  return {
    phase: "running",
    tick: 0,
    elapsedMs: 0,
    countdownMsRemaining: 0,
    participants: [],
    players: [],
    combat: {
      actors: [],
      projectiles: [],
      cueWatermark: 0,
      cues: [],
      acceptedCommands: 0,
      rejectedCommands: 0,
      projectileHits: 0,
      enemyAttacks: 0,
      kills: 0,
      drops: 0,
      objectiveProgress: 0
    },
    inputAcksByPeerId: {},
    authorityInput: {
      acceptedActions: 0,
      rejectedActions: 0,
      acceptedInputs: 0,
      rejectedInputs: 0,
      coalescedInputs: 0,
      queuedInputs: 0
    }
  };
}

function advanceSnapshot(
  snapshot: OutpostMatchAuthoritySnapshot,
  tick: number,
  playerCount: number
): void {
  snapshot.tick = tick;
  snapshot.elapsedMs = tick * 50;
  snapshot.combat.actors = [];
  snapshot.combat.projectiles = [];
  snapshot.participants = Array.from({ length: playerCount }, (_, slot) => ({
    peerId: `benchmark.peer.${slot + 1}`,
    playerId: `benchmark.player.${slot + 1}`,
    status: "active" as const,
    ready: true,
    slot
  }));
  snapshot.players = Array.from({ length: playerCount }, (_, slot) => ({
    entityId: `authority.benchmark.player.${slot + 1}`,
    networkEntityId: `benchmark.player.${slot + 1}`,
    generation: 0,
    archetypeId: "player.outpost.ranger",
    playerId: `benchmark.player.${slot + 1}`,
    slot,
    x: 820 + slot * 48 + (tick % 120) * 0.25,
    y: 470 + slot * 20,
    velocityX: 15,
    velocityY: 0,
    facing: 0
  }));
  snapshot.inputAcksByPeerId = Object.fromEntries(
    snapshot.participants.map((participant) => [participant.peerId, tick])
  );
}

function advanceCombatSnapshot(snapshot: OutpostMatchAuthoritySnapshot, tick: number): void {
  advanceSnapshot(snapshot, tick, 4);
  const playerActors = snapshot.players.map((player) => ({
    objectId: player.playerId,
    networkEntityId: player.networkEntityId,
    generation: player.generation,
    kind: "player" as const,
    definitionId: player.archetypeId,
    renderKey: "render.outpost.player",
    x: player.x,
    y: player.y,
    velocityX: player.velocityX,
    velocityY: player.velocityY,
    facing: player.facing,
    health: 100,
    shield: 50,
    stamina: 100,
    resource: 100,
    tags: ["team.players"],
    cooldowns: {}
  }));
  const enemyActors = Array.from({ length: COMBAT_ENEMIES }, (_, index) => {
    const lane = index % 4;
    const row = Math.floor(index / 4);
    return {
      objectId: `benchmark.enemy.${index}`,
      networkEntityId: `benchmark.enemy.${index}`,
      generation: 0,
      kind: "enemy" as const,
      definitionId: "enemy.outpost.raider",
      renderKey: "render.outpost.raider",
      x: 280 + lane * 400 + ((tick + index) % 30) * 0.35,
      y: 120 + (row % 18) * 42,
      velocityX: lane % 2 === 0 ? 35 : -35,
      velocityY: 12,
      facing: lane % 2 === 0 ? 0 : Math.PI,
      health: 45,
      shield: 0,
      stamina: 0,
      resource: 0,
      tags: index % 10 === 0 ? ["team.enemies", "status.shocked"] : ["team.enemies"],
      cooldowns: { "ability.outpost.enemy_attack": snapshot.elapsedMs + (index % 9) * 100 }
    };
  });
  snapshot.combat.actors = [...playerActors, ...enemyActors];
  snapshot.combat.projectiles = Array.from({ length: COMBAT_PROJECTILES }, (_, index) => ({
    objectId: `benchmark.projectile.${index}`,
    networkEntityId: `benchmark.projectile.${index}`,
    generation: 0,
    renderKey: "render.outpost.projectile",
    x: 180 + ((index * 37 + tick * 5) % 1440),
    y: 100 + ((index * 53 + tick * 3) % 800),
    velocityX: index % 2 === 0 ? 760 : -760,
    velocityY: 0,
    facing: index % 2 === 0 ? 0 : Math.PI
  }));
  const firstCueSequence = snapshot.combat.cueWatermark + 1;
  snapshot.combat.cueWatermark += COMBAT_CUES;
  snapshot.combat.cues = Array.from({ length: COMBAT_CUES }, (_, index) => ({
    sequence: firstCueSequence + index,
    kind: "health-hit" as const,
    at: snapshot.elapsedMs,
    correlationId: `benchmark.combat.${tick}.${index}`,
    sourceObjectId: `benchmark.player.${(index % 4) + 1}`,
    targetObjectId: `benchmark.enemy.${index % COMBAT_ENEMIES}`,
    projectileId: `benchmark.projectile.${index % COMBAT_PROJECTILES}`,
    position: {
      x: 180 + ((index * 37 + tick * 5) % 1440),
      y: 100 + ((index * 53 + tick * 3) % 800)
    },
    normal: { x: index % 2 === 0 ? -1 : 1, y: 0 },
    amount: 12
  }));
}

function applySnapshot(
  client: ReturnType<typeof createOutpostClientShadowRuntime>,
  emit: (message: MultiplayerMessageEnvelope) => void,
  snapshot: OutpostClientAuthoritySnapshot
): void {
  emit({
    id: `benchmark.snapshot.${snapshot.tick}`,
    sessionId: "benchmark.session",
    channel: "reliable",
    kind: "game.snapshot",
    sourcePeerId: "benchmark.session.server",
    tick: snapshot.tick,
    timestamp: snapshot.tick * 50,
    payload: snapshot
  });
  client.runtime.tick(FIXED_DELTA_MS);
}

function createBenchmarkMultiplayer(): {
  runtime: MultiplayerRuntime;
  emit(message: MultiplayerMessageEnvelope): void;
} {
  const listeners = new Set<MultiplayerBackendListener>();
  let session: MultiplayerSession | undefined;
  const backend: MultiplayerBackendAdapter = {
    id: "outpost-client-benchmark",
    kind: "benchmark",
    capabilities: {
      channels: [
        { id: "reliable", reliability: "reliable", ordering: "ordered" },
        { id: "unreliable", reliability: "unreliable", ordering: "unordered" }
      ]
    },
    async connect() {
      return {
        async createSession(request) {
          const localPeer = {
            id: request.localPeer?.id ?? "benchmark.peer.1",
            playerId: request.localPeer?.playerId ?? "benchmark.player.1",
            role: request.localPeer?.role ?? "client",
            status: "connected" as const
          };
          session = {
            id: request.id ?? "benchmark.session",
            kind: request.kind ?? "private",
            authority: request.authority ?? "server-authoritative",
            status: "running",
            peers: [
              localPeer,
              {
                id: "benchmark.session.server",
                role: "server",
                status: "connected"
              }
            ]
          };
          return session;
        },
        async joinSession() {
          throw new Error("Outpost client benchmark does not join sessions.");
        },
        async leaveSession() {
          session = undefined;
        },
        async send() {},
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close() {
          listeners.clear();
        },
        snapshot() {
          return {
            phase: session ? ("in-session" as const) : ("connected" as const),
            ...(session === undefined ? {} : { localPeer: session.peers[0], session }),
            peers: session?.peers ?? [],
            sent: 0,
            received: 0
          };
        }
      };
    },
    snapshot() {
      return {
        id: this.id,
        kind: this.kind,
        capabilities: this.capabilities
      };
    }
  };
  return {
    runtime: createMultiplayerRuntime({ id: "outpost-client-benchmark", backend }),
    emit(message) {
      for (const listener of listeners) {
        listener(message);
      }
    }
  };
}

function trackPhysicsScenes(backend: PhysicsBackendAdapter): {
  backend: PhysicsBackendAdapter;
  activeScenes(): number;
} {
  let activeScenes = 0;
  return {
    backend: {
      id: `${backend.id}.tracked`,
      kind: backend.kind,
      dimension: backend.dimension,
      createScene(config) {
        const scene = backend.createScene(config);
        activeScenes += 1;
        return trackScene(scene, () => {
          activeScenes -= 1;
        });
      },
      capabilities() {
        return backend.capabilities();
      }
    },
    activeScenes() {
      return activeScenes;
    }
  };
}

function trackScene(scene: PhysicsScene, onDispose: () => void): PhysicsScene {
  let disposed = false;
  return {
    ...scene,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      scene.dispose();
      onDispose();
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

await main();
