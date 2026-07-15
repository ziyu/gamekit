import { performance } from "node:perf_hooks";

import { createEventBus } from "../packages/event-bus/src";
import { initRapier2dPhysicsBackend } from "../packages/physics-rapier2d/src";
import { createKootaWorld } from "../packages/world-koota/src";
import { createOutpostDataRegistry } from "../apps/multiplayer-outpost-siege-demo/src/content";
import {
  createOutpostAuthorityGameplayRuntime,
  type OutpostAuthorityPlayerState
} from "../apps/multiplayer-outpost-siege-demo/src/gameplay";
import {
  checkOutpostAuthorityBudgets,
  outpostAuthorityBudgetCount,
  type OutpostAuthorityBenchmarkResult
} from "./outpost-authority-benchmark-budget";

const FIXED_DELTA_MS = 1000 / 60;
const WARMUP_TICKS = 500;
const PHYSICAL_TICKS = 6_000;
const CHURN_TICKS = 1_000;

async function main(): Promise<void> {
  const backend = await initRapier2dPhysicsBackend({
    id: "outpost.authority.benchmark.rapier2d",
    lengthUnit: 100
  });
  const world = createKootaWorld();
  const registry = createOutpostDataRegistry();
  const players = createBenchmarkPlayers();
  let activePlayers: readonly OutpostAuthorityPlayerState[] = players;
  const authority = createOutpostAuthorityGameplayRuntime({
    dataRegistry: registry,
    world,
    physicsBackend: backend,
    eventBus: createEventBus(),
    players() {
      return activePlayers;
    }
  });
  authority.runtime.start();

  for (let tick = 0; tick < WARMUP_TICKS; tick += 1) {
    updateInputs(players, tick);
    authority.runtime.tick(FIXED_DELTA_MS);
  }

  const physicalStartedAt = performance.now();
  for (let tick = 0; tick < PHYSICAL_TICKS; tick += 1) {
    updateInputs(players, tick);
    authority.runtime.tick(FIXED_DELTA_MS);
  }
  const physicalDurationMs = performance.now() - physicalStartedAt;

  const churnStartedAt = performance.now();
  for (let tick = 0; tick < CHURN_TICKS; tick += 1) {
    activePlayers = tick % 2 === 0 ? players.slice(0, 3) : players;
    authority.runtime.tick(FIXED_DELTA_MS);
  }
  const churnDurationMs = performance.now() - churnStartedAt;
  activePlayers = players;
  authority.runtime.tick(FIXED_DELTA_MS);

  const snapshot = authority.snapshot();
  const physicsSnapshot = authority.physics.snapshot();
  if (snapshot.players.length !== 4 || snapshot.entityCount !== 37) {
    throw new Error(
      `Outpost authority benchmark expected 4 players / 37 entities, received ${snapshot.players.length} / ${snapshot.entityCount}.`
    );
  }
  const retainedPhysicsTraces = authority.physicsTrace.list().length;
  authority.runtime.dispose();

  const result: OutpostAuthorityBenchmarkResult = {
    microsecondsPerFourPlayerPhysicalTick: round((physicalDurationMs * 1_000) / PHYSICAL_TICKS),
    microsecondsPerPlayerChurnTick: round((churnDurationMs * 1_000) / CHURN_TICKS),
    retainedPhysicsTraces,
    retainedEntitiesAfterDispose: world.count()
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkOutpostAuthorityBudgets(result) : [];
  console.log(
    JSON.stringify(
      {
        benchmark: "outpost-four-player-authority",
        profile: {
          warmupTicks: WARMUP_TICKS,
          physicalTicks: PHYSICAL_TICKS,
          churnTicks: CHURN_TICKS,
          fixedDeltaMs: FIXED_DELTA_MS,
          entitiesPerRuntime: snapshot.entityCount,
          playersPerRuntime: snapshot.players.length,
          physicsBodiesPerRuntime: physicsSnapshot.bodyCount,
          physicsCollidersPerRuntime: physicsSnapshot.colliderCount
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: outpostAuthorityBudgetCount(),
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

function createBenchmarkPlayers(): OutpostAuthorityPlayerState[] {
  return [
    player("benchmark.player.1", 0, 836, 500),
    player("benchmark.player.2", 1, 964, 500),
    player("benchmark.player.3", 2, 900, 436),
    player("benchmark.player.4", 3, 900, 564)
  ];
}

function player(playerId: string, slot: number, x: number, y: number): OutpostAuthorityPlayerState {
  return {
    playerId,
    slot,
    spawn: { x, y },
    input: { sequence: 0, moveX: 0, moveY: 0, aimX: 900, aimY: 500 }
  };
}

function updateInputs(players: OutpostAuthorityPlayerState[], tick: number): void {
  for (const [index, player] of players.entries()) {
    const direction = Math.floor((tick + index * 30) / 120) % 2 === 0 ? 1 : -1;
    player.input.sequence = tick + 1;
    player.input.moveX = index % 2 === 0 ? direction : 0;
    player.input.moveY = index % 2 === 0 ? 0 : direction;
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

await main();
