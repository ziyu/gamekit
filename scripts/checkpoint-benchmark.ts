import { performance } from "node:perf_hooks";
import { createDataRegistry, type DataPack } from "../packages/data/src";
import { createEventBus } from "../packages/event-bus/src";
import { createGasDataTypes, createGasRuntime, createGasTraceStore } from "../packages/gas/src";
import { createGame } from "../packages/game-runtime/src";
import {
  PhysicsBodyComponent,
  PhysicsTransformComponent,
  PhysicsVelocityComponent,
  createMemoryPhysicsBackend,
  createPhysicsHandle,
  createPhysicsModule
} from "../packages/physics-core/src";
import { createTcaRuntime, createTcaTraceStore, type TcaRule } from "../packages/tca/src";
import { createKootaWorld } from "../packages/world-koota/src";
import {
  checkCheckpointBudgets,
  checkpointBudgetCount,
  type CheckpointBenchmarkSuite
} from "./checkpoint-benchmark-budget";

function main(): void {
  const suites = [
    runTcaCheckpointBenchmark(),
    runGasCheckpointBenchmark(),
    runPhysicsCheckpointBenchmark()
  ];
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkCheckpointBudgets(suites) : [];
  console.log(
    JSON.stringify(
      {
        benchmark: "gameplay-checkpoint",
        packages: ["@gamekit/tca", "@gamekit/gas", "@gamekit/physics-core"],
        suites,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: checkpointBudgetCount(),
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

function runTcaCheckpointBenchmark(): CheckpointBenchmarkSuite {
  const onceRules = 1_000;
  const cycles = 1_000;
  const eventBus = createEventBus({ clock: () => 1 });
  const rules: TcaRule[] = Array.from({ length: onceRules }, (_, index) => ({
    id: `once-${index}`,
    once: true,
    trigger: { type: "event.type", args: { eventType: "checkpoint.trigger" } },
    actions: [{ type: "benchmark.noop" }]
  }));
  const runtime = createTcaRuntime({
    eventBus,
    rules,
    definitions: {
      actions: [{ type: "benchmark.noop", execute() {} }]
    },
    traceStore: createTcaTraceStore({ limit: 32 })
  });
  runtime.handleEvent({ type: "checkpoint.trigger", payload: {}, timestamp: 1 });

  let checkpoint = runtime.captureCheckpoint();
  let checksum = 0;
  const captureStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    checkpoint = runtime.captureCheckpoint();
    checksum += checkpoint.executedOnceRuleIds.length;
  }
  const captureMs = performance.now() - captureStart;
  const restoreStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    runtime.restoreCheckpoint(checkpoint);
  }
  const restoreMs = performance.now() - restoreStart;
  runtime.dispose();

  return {
    suite: "tca-checkpoint",
    cases: [
      {
        onceRules,
        cycles,
        checksum,
        captureMs: round(captureMs),
        restoreMs: round(restoreMs),
        msPerCapture: round(captureMs / cycles),
        msPerRestore: round(restoreMs / cycles)
      }
    ]
  };
}

function runGasCheckpointBenchmark(): CheckpointBenchmarkSuite {
  const actors = 1_000;
  const activeEffects = 500;
  const cycles = 20;
  const world = createKootaWorld();
  const runtime = createGasRuntime({
    world,
    dataRegistry: createGasRegistry(),
    traceStore: createGasTraceStore({ limit: 32 })
  });
  for (let index = 0; index < actors; index += 1) {
    const entityId = world.spawn();
    const actorId = `actor-${index}`;
    runtime.createActor({ actorId, definitionId: "actor.benchmark", entityId });
    if (index < activeEffects) {
      runtime.applyEffect({ effectId: "effect.duration", targetActorId: actorId });
    }
  }
  runtime.update(50, 50);

  let checkpoint = runtime.captureCheckpoint();
  let checksum = 0;
  const captureStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    checkpoint = runtime.captureCheckpoint();
    checksum += checkpoint.actors.length;
  }
  const captureMs = performance.now() - captureStart;
  const restoreStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    runtime.restoreCheckpoint(checkpoint);
  }
  const restoreMs = performance.now() - restoreStart;
  runtime.dispose();

  return {
    suite: "gas-checkpoint",
    cases: [
      {
        actors,
        activeEffects,
        cycles,
        checksum,
        captureMs: round(captureMs),
        restoreMs: round(restoreMs),
        msPerCapture: round(captureMs / cycles),
        msPerRestore: round(restoreMs / cycles)
      }
    ]
  };
}

function runPhysicsCheckpointBenchmark(): CheckpointBenchmarkSuite {
  const entities = 1_000;
  const cycles = 20;
  const world = createKootaWorld();
  for (let index = 0; index < entities; index += 1) {
    const entityId = world.spawn();
    world.add(entityId, PhysicsBodyComponent, {
      definition: { kind: "dynamic" }
    });
    world.add(entityId, PhysicsTransformComponent, {
      position: { x: index, y: 0 }
    });
    world.add(entityId, PhysicsVelocityComponent, {
      linear: { x: 1, y: 0 }
    });
  }
  const handle = createPhysicsHandle();
  const game = createGame({
    modules: [
      createPhysicsModule({
        backend: createMemoryPhysicsBackend(),
        fixedDeltaMs: 50,
        scene: { gravity: { x: 0, y: 0 } },
        eventPolicy: { emitContacts: false },
        handle
      })
    ],
    world,
    eventBus: createEventBus({ clock: () => 1 }),
    seed: "physics-checkpoint-benchmark"
  });
  game.start();
  game.tick(50);

  let checkpoint = handle.captureCheckpoint();
  let checksum = 0;
  const captureStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    checkpoint = handle.captureCheckpoint();
    checksum += checkpoint.entities.length;
  }
  const captureMs = performance.now() - captureStart;
  const restoreStart = performance.now();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    handle.restoreCheckpoint(checkpoint);
    game.tick(50);
  }
  const restoreMs = performance.now() - restoreStart;
  game.dispose();

  return {
    suite: "physics-checkpoint",
    cases: [
      {
        entities,
        cycles,
        checksum,
        captureMs: round(captureMs),
        restoreAndTickMs: round(restoreMs),
        msPerCapture: round(captureMs / cycles),
        msPerRestoreAndTick: round(restoreMs / cycles)
      }
    ]
  };
}

function createGasRegistry() {
  const registry = createDataRegistry();
  for (const type of createGasDataTypes()) {
    registry.registerType(type);
  }
  registry.registerPack(GAS_PACK);
  return registry;
}

const GAS_PACK: DataPack = {
  id: "checkpoint.benchmark",
  version: "1",
  entries: [
    {
      type: "gas.effect",
      id: "effect.duration",
      data: { id: "effect.duration", durationMs: 60_000 }
    },
    {
      type: "gas.actor",
      id: "actor.benchmark",
      data: { id: "actor.benchmark", attributes: { health: 100 } }
    }
  ]
};

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

main();
