import { performance } from "node:perf_hooks";
import { createStandardMultiplayerPhysicsArenaAuthorityProjection } from "../packages/app-host/src";
import {
  createPhysicsPredictionIsland,
  type PhysicsPredictionIslandCommand,
  type PhysicsPredictionIslandMemberDefinition,
  type PhysicsPredictionIslandStateSnapshot
} from "../packages/physics-core/src";
import { initRapier3dPhysicsBackend } from "../packages/physics-rapier3d/src";
import {
  ARENA_ENVIRONMENT,
  createArenaMemberDefinitions
} from "../apps/multiplayer-physics-arena-demo/src/shared/arena-definition";
import {
  ARENA_DEFINITION_VERSION,
  ARENA_FIXED_STEP_MS,
  ARENA_ISLAND_ID
} from "../apps/multiplayer-physics-arena-demo/src/shared/config";
import {
  arenaPredictionBenchmarkBudgetCount,
  checkArenaPredictionBenchmarkBudgets,
  type ArenaPredictionBenchmarkCase,
  type ArenaPredictionBenchmarkSuite
} from "./arena-prediction-benchmark-budget";

const checkEnabled = process.argv.includes("--check");
const backend = await initRapier3dPhysicsBackend({ id: "benchmark.arena.rapier3d" });
const suite: ArenaPredictionBenchmarkSuite = {
  suite: "rapier3d-arena-rollback",
  cases: [
    runArenaCase({ members: 16, simulatedTicks: 128, rollbackTicks: 12, rounds: 24 }),
    runArenaCase({ members: 32, simulatedTicks: 128, rollbackTicks: 30, rounds: 24 }),
    runArenaCase({ members: 64, simulatedTicks: 32, rollbackTicks: 0, rounds: 6 })
  ]
};
const suites = [suite];
const failures = checkEnabled ? checkArenaPredictionBenchmarkBudgets(suites) : [];

console.log(
  JSON.stringify(
    {
      benchmark: "arena-prediction",
      packages: ["@gamekit/app-host", "@gamekit/physics-core", "@gamekit/physics-rapier3d"],
      methodology: {
        backend: "real Rapier3D compat WASM",
        timing: "wall-clock performance.now",
        fixtureConstruction: "excluded from each measured round",
        measuredWork:
          "authoritative rewind, pending command replay, and authority frame projection after a prebuilt history",
        reports: [
          "p50/p95/max",
          "payload bytes",
          "history/checkpoint bytes",
          "hard correction failures",
          "dispose retained state"
        ]
      },
      suites,
      ...(checkEnabled
        ? {
            budgetCheck: {
              budgets: arenaPredictionBenchmarkBudgetCount(),
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

if (failures.length > 0) process.exitCode = 1;

function runArenaCase(input: {
  members: number;
  simulatedTicks: number;
  rollbackTicks: number;
  rounds: number;
}): ArenaPredictionBenchmarkCase {
  const definitions = createStressDefinitions(input.members);
  const projection = createStandardMultiplayerPhysicsArenaAuthorityProjection({
    maxMembers: 64,
    maxPayloadBytes: 128 * 1024
  });
  const samples: number[] = [];
  let payloadBytes = 0;
  let maxHistoryBytes = 0;
  let maxHistoryEntries = 0;
  let maxCheckpointBytes = 0;
  let hardCorrectionFailures = 0;
  let replayBudgetOverflows = 0;
  let retainedAfterDispose = 0;
  let totalReplayedTicks = 0;
  let checksum = 0;

  for (let round = 0; round < input.rounds; round += 1) {
    const island = createPhysicsPredictionIsland({
      backend,
      generation: round + 1,
      initialMembers: definitions,
      environment: ARENA_ENVIRONMENT,
      fixedDeltaMs: ARENA_FIXED_STEP_MS,
      maxHistoryTicks: input.simulatedTicks + 8,
      maxCheckpointBytes: 2 * 1024 * 1024,
      maxHistoryBytes: 64 * 1024 * 1024,
      maxReplayTicksPerOperation: input.simulatedTicks,
      maxMembers: 64,
      maxCommands: input.members * (input.simulatedTicks + 8),
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
    const rollbackAt = input.simulatedTicks - input.rollbackTicks;
    let authoritySnapshot: PhysicsPredictionIslandStateSnapshot | undefined;
    for (let tick = 1; tick <= input.simulatedTicks; tick += 1) {
      queueArenaCommands(island, definitions, tick, round);
      island.advanceTo(tick);
      if (tick === rollbackAt) authoritySnapshot = island.state();
    }
    if (authoritySnapshot === undefined) throw new Error("Missing Arena rollback snapshot.");
    const beforeReconcile = island.diagnostics();
    maxHistoryBytes = Math.max(maxHistoryBytes, beforeReconcile.historyBytes);
    maxHistoryEntries = Math.max(maxHistoryEntries, beforeReconcile.historyEntries);
    maxCheckpointBytes = Math.max(maxCheckpointBytes, beforeReconcile.maxCheckpointBytesObserved);
    authoritySnapshot.members[0]!.body.position.x += 0.02;
    const startedAt = performance.now();
    const reconciliation = island.reconcile(authoritySnapshot);
    totalReplayedTicks += reconciliation.replayedTicks;
    const projected = projection.capture({
      islandId: ARENA_ISLAND_ID,
      generation: round + 1,
      tick: island.tick(),
      membershipRevision: round + 1,
      definitionVersion: ARENA_DEFINITION_VERSION,
      members: island.state().members
    });
    if (projected.status !== "captured") {
      throw new Error(`Arena benchmark projection failed: ${projected.status}`);
    }
    payloadBytes = Math.max(payloadBytes, projected.payloadBytes);
    samples.push(performance.now() - startedAt);
    const diagnostics = island.diagnostics();
    maxHistoryBytes = Math.max(maxHistoryBytes, diagnostics.historyBytes);
    maxHistoryEntries = Math.max(maxHistoryEntries, diagnostics.historyEntries);
    maxCheckpointBytes = Math.max(maxCheckpointBytes, diagnostics.maxCheckpointBytesObserved);
    replayBudgetOverflows += diagnostics.replayBudgetOverflows;
    checksum += island
      .state()
      .members.reduce(
        (total, member) => total + member.body.position.x + member.body.position.y,
        0
      );
    const hardCorrection = island.hardCorrect(island.state(), definitions);
    if (hardCorrection.status !== "corrected") hardCorrectionFailures += 1;
    island.dispose();
    const disposed = island.diagnostics();
    retainedAfterDispose += disposed.members + disposed.historyEntries + disposed.commands;
  }

  const stats = summarize(samples);
  return {
    members: input.members,
    simulatedTicks: input.simulatedTicks,
    rollbackTicks: input.rollbackTicks,
    rounds: input.rounds,
    p50MsPerRound: stats.p50,
    p95MsPerRound: stats.p95,
    maxMsPerRound: stats.max,
    payloadBytes,
    maxHistoryBytes,
    maxHistoryEntries,
    maxCheckpointBytes,
    totalReplayedTicks,
    hardCorrectionFailures,
    replayBudgetOverflows,
    retainedAfterDispose,
    checksum: round(checksum)
  };
}

function queueArenaCommands(
  island: ReturnType<typeof createPhysicsPredictionIsland>,
  definitions: readonly PhysicsPredictionIslandMemberDefinition[],
  tick: number,
  round: number
): void {
  for (const [index, definition] of definitions.entries()) {
    const body = island.body(definition.id);
    if (!body) continue;
    const phase = tick * 0.023 + index * 0.37 + round * 0.11;
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
        : {
            type: "patch",
            tick,
            sequence: tick * 128 + index,
            memberId: definition.id,
            patch: {
              linearVelocity: {
                x: Math.sin(phase) * 2.8,
                y: body.linearVelocity.y,
                z: -2.4 + Math.cos(phase) * 0.5
              }
            }
          };
    island.queue(command);
  }
}

function createStressDefinitions(count: number): PhysicsPredictionIslandMemberDefinition[] {
  const definitions = createArenaMemberDefinitions();
  const template = definitions.find((definition) => definition.id === "bot.0");
  if (!template) throw new Error("Arena benchmark requires bot.0 definition.");
  for (let index = definitions.length; index < count; index += 1) {
    const id = `stress.${index}`;
    definitions.push({
      ...structuredClone(template),
      id,
      body: {
        ...structuredClone(template.body),
        id,
        position: {
          x: ((index % 8) - 3.5) * 1.4,
          y: 1.4 + Math.floor(index / 16) * 1.2,
          z: 4 - Math.floor(index / 8) * 1.7
        }
      },
      colliders: template.colliders?.map((collider, colliderIndex) => ({
        ...structuredClone(collider),
        id: `${id}.collider.${colliderIndex}`
      }))
    });
  }
  return definitions.slice(0, count);
}

function summarize(samples: readonly number[]): { p50: number; p95: number; max: number } {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
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
