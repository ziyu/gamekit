import { performance } from "node:perf_hooks";

import { createOutpostDataRegistry } from "../apps/multiplayer-outpost-siege-demo/src/content";
import {
  createOutpostClientShadowRuntime,
  type OutpostClientAuthoritySnapshot
} from "../apps/multiplayer-outpost-siege-demo/src/gameplay";
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
  advanceSnapshot(snapshot, WARMUP_SNAPSHOTS + FOUR_PLAYER_SNAPSHOTS + CHURN_SNAPSHOTS + 1, 4);
  applySnapshot(client, multiplayer.emit, snapshot);

  if (world.count() !== 4 || client.identity.snapshot().length !== 4) {
    throw new Error("Outpost client benchmark expected four materialized player shadows.");
  }
  const diagnostics = client.snapshot();
  const predictionDiagnostics = diagnostics.replication?.prediction;
  const transitionDiagnostics = predictionDiagnostics?.transition as
    | { cachedFrames?: number }
    | undefined;
  client.runtime.dispose();
  await multiplayer.runtime.dispose();

  const result: OutpostClientBenchmarkResult = {
    microsecondsPerFourPlayerSnapshot: round(
      (fourPlayerDurationMs * 1_000) / FOUR_PLAYER_SNAPSHOTS
    ),
    microsecondsPerPlayerChurnSnapshot: round((churnDurationMs * 1_000) / CHURN_SNAPSHOTS),
    rejectedSnapshots: diagnostics.rejectedSnapshots,
    predictionPendingInputs: predictionDiagnostics?.pendingInputs ?? 0,
    predictionCachedFrames: transitionDiagnostics?.cachedFrames ?? 0,
    retainedEntitiesAfterDispose: world.count(),
    retainedPhysicsScenesAfterDispose: physics.activeScenes()
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
          playersPerSnapshot: 4
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

function createSnapshot(): OutpostClientAuthoritySnapshot {
  return {
    phase: "running",
    tick: 0,
    countdownMsRemaining: 0,
    participants: [],
    players: [],
    inputAcksByPeerId: {}
  };
}

function advanceSnapshot(
  snapshot: OutpostClientAuthoritySnapshot,
  tick: number,
  playerCount: number
): void {
  snapshot.tick = tick;
  snapshot.participants = Array.from({ length: playerCount }, (_, slot) => ({
    peerId: `benchmark.peer.${slot + 1}`,
    playerId: `benchmark.player.${slot + 1}`,
    status: "active" as const,
    ready: true,
    slot
  }));
  snapshot.players = Array.from({ length: playerCount }, (_, slot) => ({
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
