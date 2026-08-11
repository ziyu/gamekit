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

const SIMULATED_MINUTES = 10;
const TICKS_PER_SECOND = 60;
const AUTHORITY_TICKS_PER_SECOND = 20;
const WARMUP_TICKS = TICKS_PER_SECOND * 10;
const SIMULATED_TICKS = SIMULATED_MINUTES * 60 * TICKS_PER_SECOND;
const AUTHORITY_INTERVAL_TICKS = TICKS_PER_SECOND / AUTHORITY_TICKS_PER_SECOND;
const AUTHORITY_DELAY_TICKS = 3;
const SAMPLE_INTERVAL_TICKS = TICKS_PER_SECOND * 60;
const MAX_RETAINED_HEAP_GROWTH_BYTES = 2 * 1024 * 1024;
const MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES = 4 * 1024 * 1024;
const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;

if (forceGc === undefined) {
  throw new Error("Arena prediction stability requires Node.js --expose-gc.");
}

const backend = await initRapier3dPhysicsBackend({ id: "stability.arena.rapier3d" });
const definitions = createArenaMemberDefinitions();
const island = createPhysicsPredictionIsland({
  backend,
  generation: "stability.1",
  initialMembers: definitions,
  environment: ARENA_ENVIRONMENT,
  fixedDeltaMs: ARENA_FIXED_STEP_MS,
  maxHistoryTicks: 180,
  maxCheckpointBytes: 8 * 1024 * 1024,
  maxHistoryBytes: 96 * 1024 * 1024,
  maxReplayTicksPerOperation: 120,
  maxMembers: 32,
  maxCommands: 4_096,
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
const snapshots = new Map<number, PhysicsPredictionIslandStateSnapshot>();
let queueFailures = 0;
let reconciliationFailures = 0;
let projectedPayloadBytes = 0;
let checksum = 0;

for (let tick = 1; tick <= WARMUP_TICKS; tick += 1) runTick(tick);
forceGc();
const baselineHeapBytes = process.memoryUsage().heapUsed;
let maxRetainedHeapBytes = baselineHeapBytes;
const startedAt = performance.now();

for (let offset = 1; offset <= SIMULATED_TICKS; offset += 1) {
  const tick = WARMUP_TICKS + offset;
  runTick(tick);
  if (offset % SAMPLE_INTERVAL_TICKS === 0) {
    forceGc();
    maxRetainedHeapBytes = Math.max(maxRetainedHeapBytes, process.memoryUsage().heapUsed);
  }
}

forceGc();
const durationMs = performance.now() - startedAt;
const finalHeapBytes = process.memoryUsage().heapUsed;
const retainedHeapGrowthBytes = Math.max(0, finalHeapBytes - baselineHeapBytes);
const peakRetainedHeapGrowthBytes = Math.max(0, maxRetainedHeapBytes - baselineHeapBytes);
const diagnostics = island.diagnostics();
island.dispose();
snapshots.clear();
forceGc();
const disposedDiagnostics = island.diagnostics();
const retainedAfterDispose =
  disposedDiagnostics.members + disposedDiagnostics.historyEntries + disposedDiagnostics.commands;
const failures: string[] = [];

checkAtMost("final retained heap growth", retainedHeapGrowthBytes, MAX_RETAINED_HEAP_GROWTH_BYTES);
checkAtMost(
  "peak retained heap growth",
  peakRetainedHeapGrowthBytes,
  MAX_PEAK_RETAINED_HEAP_GROWTH_BYTES
);
checkAtMost("history entries", diagnostics.historyEntries, 181);
checkAtMost("history bytes", diagnostics.historyBytes, 32 * 1024 * 1024);
checkAtMost("checkpoint bytes", diagnostics.maxCheckpointBytesObserved, 512 * 1024);
checkAtMost("commands", diagnostics.commands, 3_000);
checkAtMost("projected payload bytes", projectedPayloadBytes, 32 * 1024);
checkAtMost("queue failures", queueFailures, 0);
checkAtMost("reconciliation failures", reconciliationFailures, 0);
checkAtMost("replay budget overflows", diagnostics.replayBudgetOverflows, 0);
checkAtMost("hard correction failures", diagnostics.hardCorrectionFailures, 0);
checkAtMost("retained state after dispose", retainedAfterDispose, 0);
if (diagnostics.corrections < SIMULATED_MINUTES * 50) {
  failures.push("controlled correction count was below 50 per simulated minute");
}
if (diagnostics.resimulatedTicks < SIMULATED_TICKS * 0.9) {
  failures.push("authority reconciliation did not replay enough delayed ticks");
}

console.log(
  JSON.stringify(
    {
      benchmark: "arena-prediction-stability",
      backend: "real Rapier3D compat WASM",
      simulatedMinutes: SIMULATED_MINUTES,
      simulationHz: TICKS_PER_SECOND,
      authorityHz: AUTHORITY_TICKS_PER_SECOND,
      authorityDelayTicks: AUTHORITY_DELAY_TICKS,
      members: definitions.length,
      ticks: SIMULATED_TICKS,
      durationMs: round(durationMs),
      baselineHeapMiB: toMiB(baselineHeapBytes),
      finalHeapMiB: toMiB(finalHeapBytes),
      retainedHeapGrowthMiB: toMiB(retainedHeapGrowthBytes),
      peakRetainedHeapGrowthMiB: toMiB(peakRetainedHeapGrowthBytes),
      historyEntries: diagnostics.historyEntries,
      historyMiB: toMiB(diagnostics.historyBytes),
      maxCheckpointKiB: round(diagnostics.maxCheckpointBytesObserved / 1024),
      commands: diagnostics.commands,
      reconciliations: diagnostics.reconciliations,
      corrections: diagnostics.corrections,
      resimulatedTicks: diagnostics.resimulatedTicks,
      projectedPayloadKiB: round(projectedPayloadBytes / 1024),
      queueFailures,
      reconciliationFailures,
      replayBudgetOverflows: diagnostics.replayBudgetOverflows,
      hardCorrectionFailures: diagnostics.hardCorrectionFailures,
      retainedAfterDispose,
      checksum: round(checksum),
      passed: failures.length === 0,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) process.exitCode = 1;

function runTick(tick: number): void {
  for (const [index, definition] of definitions.entries()) {
    const command = commandFor(definition, index, tick);
    const queued = island.queue(command);
    if (queued.status !== "queued") queueFailures += 1;
  }
  island.advanceTo(tick);
  snapshots.set(tick, island.state());
  if (tick > AUTHORITY_DELAY_TICKS && tick % AUTHORITY_INTERVAL_TICKS === 0) {
    const authorityTick = tick - AUTHORITY_DELAY_TICKS;
    const snapshot = snapshots.get(authorityTick);
    if (snapshot === undefined) {
      reconciliationFailures += 1;
    } else {
      if (tick % TICKS_PER_SECOND === 0) snapshot.members[0]!.body.position.x += 0.005;
      const reconciliation = island.reconcile(snapshot);
      if (reconciliation.status !== "confirmed" && reconciliation.status !== "corrected") {
        reconciliationFailures += 1;
      }
      const projected = projection.capture({
        islandId: ARENA_ISLAND_ID,
        generation: snapshot.generation,
        tick: snapshot.tick,
        membershipRevision: 1,
        definitionVersion: ARENA_DEFINITION_VERSION,
        members: snapshot.members
      });
      if (projected.status === "captured") {
        projectedPayloadBytes = Math.max(projectedPayloadBytes, projected.payloadBytes);
      } else {
        reconciliationFailures += 1;
      }
    }
  }
  for (const storedTick of snapshots.keys()) {
    if (storedTick < tick - AUTHORITY_DELAY_TICKS - 1) snapshots.delete(storedTick);
  }
  const body = island.body(definitions[tick % definitions.length]!.id);
  checksum += body?.position.x ?? 0;
}

function commandFor(
  definition: PhysicsPredictionIslandMemberDefinition,
  index: number,
  tick: number
): PhysicsPredictionIslandCommand {
  const phase = tick * 0.023 + index * 0.37;
  if (definition.body.kind === "kinematic") {
    return {
      type: "patch",
      tick,
      sequence: tick * 64 + index,
      memberId: definition.id,
      patch: {
        position: {
          x: definition.body.position?.x ?? 0,
          y: (definition.body.position?.y ?? 0) + Math.sin(phase) * 0.3,
          z: definition.body.position?.z ?? 0
        }
      }
    };
  }
  return {
    type: "patch",
    tick,
    sequence: tick * 64 + index,
    memberId: definition.id,
    patch: {
      linearVelocity: {
        x: Math.sin(phase) * 2.8,
        y: island.body(definition.id)?.linearVelocity.y ?? 0,
        z: -2.4 + Math.cos(phase) * 0.5
      }
    }
  };
}

function checkAtMost(label: string, actual: number, maximum: number): void {
  if (actual > maximum) failures.push(`${label} exceeded ${maximum} (actual ${actual})`);
}

function toMiB(bytes: number): number {
  return round(bytes / (1024 * 1024));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
