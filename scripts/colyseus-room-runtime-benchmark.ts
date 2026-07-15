import { performance } from "node:perf_hooks";
import type { MultiplayerMessageEnvelope } from "../packages/multiplayer-core/src";
import {
  createColyseusRoomRuntimeBridge,
  type ColyseusRoomRuntimeClient,
  type ColyseusRoomRuntimeHost
} from "../packages/multiplayer-colyseus/src/server";
import {
  checkColyseusRoomRuntimeBudgets,
  colyseusRoomRuntimeBudgetCount,
  type ColyseusRoomRuntimeBenchmarkResult
} from "./colyseus-room-runtime-benchmark-budget";

const WARMUP_TICKS = 10_000;
const TICK_ITERATIONS = 500_000;
const INGRESS_ITERATIONS = 100_000;
const PEER_CHURN_ITERATIONS = 10_000;
const LIFECYCLE_ITERATIONS = 1_000;

class BenchmarkRoom implements ColyseusRoomRuntimeHost {
  simulation?: (deltaTime: number) => void;
  broadcasts = 0;

  constructor(readonly roomId: string) {}

  setSimulationInterval(onTickCallback?: ((deltaTime: number) => void) | undefined): void {
    this.simulation = onTickCallback;
  }

  broadcast(): void {
    this.broadcasts += 1;
  }
}

class BenchmarkClient implements ColyseusRoomRuntimeClient {
  sent = 0;

  constructor(readonly sessionId: string) {}

  send(): void {
    this.sent += 1;
  }
}

async function main(): Promise<void> {
  const room = new BenchmarkRoom("benchmark-room");
  let appliedTicks = 0;
  const bridge = createBridge(room, () => {
    appliedTicks += 1;
  });
  await bridge.create(room, {});
  const client = new BenchmarkClient("transport-client");
  bridge.join(client, { id: "benchmark-client" });
  const envelope: MultiplayerMessageEnvelope = {
    id: "benchmark-message",
    sessionId: "benchmark-room",
    channel: "reliable",
    kind: "game.input",
    sourcePeerId: "benchmark-client",
    targetPeerIds: ["benchmark-room.server"],
    sequence: 1,
    timestamp: 0,
    payload: { moveX: 1, moveY: 0 }
  };
  const unsubscribe = bridge.multiplayer.subscribe(() => {});

  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    room.simulation?.(1000 / 60);
  }

  const tickStartedAt = performance.now();
  for (let index = 0; index < TICK_ITERATIONS; index += 1) {
    room.simulation?.(1000 / 60);
  }
  const tickDurationMs = performance.now() - tickStartedAt;

  const ingressStartedAt = performance.now();
  for (let index = 0; index < INGRESS_ITERATIONS; index += 1) {
    bridge.receive(client, envelope);
  }
  const ingressDurationMs = performance.now() - ingressStartedAt;

  const churnStartedAt = performance.now();
  for (let index = 0; index < PEER_CHURN_ITERATIONS; index += 1) {
    const churnClient = new BenchmarkClient(`transport-churn-${index}`);
    bridge.join(churnClient, { id: `peer-churn-${index}` });
    bridge.leave(churnClient, 1000);
  }
  const churnDurationMs = performance.now() - churnStartedAt;

  unsubscribe();
  bridge.leave(client, 1000);
  await bridge.dispose();

  const lifecycleStartedAt = performance.now();
  for (let index = 0; index < LIFECYCLE_ITERATIONS; index += 1) {
    const lifecycleRoom = new BenchmarkRoom(`lifecycle-${index}`);
    const lifecycleBridge = createBridge(lifecycleRoom, () => {});
    await lifecycleBridge.create(lifecycleRoom, {});
    await lifecycleBridge.dispose();
  }
  const lifecycleDurationMs = performance.now() - lifecycleStartedAt;

  const snapshot = bridge.snapshot();
  const result: ColyseusRoomRuntimeBenchmarkResult = {
    nanosecondsPerTick: round((tickDurationMs * 1_000_000) / TICK_ITERATIONS),
    microsecondsPerIngress: round((ingressDurationMs * 1_000) / INGRESS_ITERATIONS),
    microsecondsPerPeerChurn: round((churnDurationMs * 1_000) / PEER_CHURN_ITERATIONS),
    millisecondsPerLifecycle: round(lifecycleDurationMs / LIFECYCLE_ITERATIONS),
    retainedPeersAfterDispose: snapshot.activePeers,
    activeTimersAfterDispose: room.simulation === undefined ? 0 : 1
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkColyseusRoomRuntimeBudgets(result) : [];

  console.log(
    JSON.stringify(
      {
        benchmark: "colyseus-room-runtime-bridge",
        profile: {
          warmupTicks: WARMUP_TICKS,
          tickIterations: TICK_ITERATIONS,
          ingressIterations: INGRESS_ITERATIONS,
          peerChurnIterations: PEER_CHURN_ITERATIONS,
          lifecycleIterations: LIFECYCLE_ITERATIONS,
          appliedTicks
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: colyseusRoomRuntimeBudgetCount(),
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

function createBridge(room: BenchmarkRoom, onTick: () => void) {
  return createColyseusRoomRuntimeBridge<BenchmarkRoom, BenchmarkClient, Record<string, never>>({
    id: `benchmark.${room.roomId}`,
    clock: () => 0,
    createRuntime() {
      return {
        tick() {
          onTick();
        },
        dispose() {}
      };
    }
  });
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

await main();
