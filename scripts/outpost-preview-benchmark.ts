import { performance } from "node:perf_hooks";
import { initRapier2dPhysicsBackend } from "../packages/physics-rapier2d/src";
import { createKootaWorld } from "../packages/world-koota/src";
import { createOutpostDataRegistry } from "../apps/multiplayer-outpost-siege-demo/src/content";
import { createOutpostPreviewRuntime } from "../apps/multiplayer-outpost-siege-demo/src/gameplay";
import { createOutpostArenaRenderObjectDefinitions } from "../apps/multiplayer-outpost-siege-demo/src/presentation";
import {
  checkOutpostPreviewBudgets,
  outpostPreviewBudgetCount,
  type OutpostPreviewBenchmarkResult
} from "./outpost-preview-benchmark-budget";

const BOOT_ITERATIONS = 100;
const TICK_ITERATIONS = 6_000;
const FIXED_DELTA_MS = 1000 / 60;
const RENDER_PLAN_ITERATIONS = 1_000;
const INTERPOLATION_SAMPLE_ITERATIONS = 100_000;

async function main(): Promise<void> {
  const backend = await initRapier2dPhysicsBackend({
    id: "outpost.preview.benchmark.rapier2d",
    lengthUnit: 100
  });
  const registry = createOutpostDataRegistry();
  let renderPlanObjectCount = 0;
  const renderPlanStartedAt = performance.now();
  for (let index = 0; index < RENDER_PLAN_ITERATIONS; index += 1) {
    renderPlanObjectCount = createOutpostArenaRenderObjectDefinitions(registry).length;
  }
  const renderPlanDurationMs = performance.now() - renderPlanStartedAt;
  const lifecycleWorld = createKootaWorld();

  for (let index = 0; index < 8; index += 1) {
    const warm = createOutpostPreviewRuntime({
      dataRegistry: registry,
      world: lifecycleWorld,
      physicsBackend: backend
    });
    warm.runtime.start();
    warm.runtime.tick(FIXED_DELTA_MS);
    warm.runtime.dispose();
  }

  const bootStartedAt = performance.now();
  for (let index = 0; index < BOOT_ITERATIONS; index += 1) {
    const preview = createOutpostPreviewRuntime({
      dataRegistry: registry,
      world: lifecycleWorld,
      physicsBackend: backend
    });
    preview.runtime.dispose();
  }
  if (lifecycleWorld.count() !== 0) {
    throw new Error("Outpost preview lifecycle benchmark retained World entities");
  }
  const bootDurationMs = performance.now() - bootStartedAt;

  const world = createKootaWorld();
  const preview = createOutpostPreviewRuntime({
    dataRegistry: registry,
    world,
    physicsBackend: backend
  });
  preview.runtime.start();
  const tickStartedAt = performance.now();
  for (let tick = 0; tick < TICK_ITERATIONS; tick += 1) {
    const direction = Math.floor(tick / 300) % 2 === 0 ? 1 : -1;
    preview.input.moveX = direction;
    preview.input.moveY = direction;
    preview.runtime.tick(FIXED_DELTA_MS);
  }
  const tickDurationMs = performance.now() - tickStartedAt;
  const interpolatedTransform = { position: { x: 0, y: 0 } };
  let interpolationChecksum = 0;
  const interpolationStartedAt = performance.now();
  for (let index = 0; index < INTERPOLATION_SAMPLE_ITERATIONS; index += 1) {
    const transform = preview.physicsInterpolation.sample(
      "outpost.preview.player.body",
      interpolatedTransform
    );
    if (!transform) {
      throw new Error("Outpost preview interpolation benchmark requires the player body");
    }
    interpolationChecksum += transform.position.x;
  }
  const interpolationDurationMs = performance.now() - interpolationStartedAt;
  const retainedPhysicsTraces = preview.physicsTrace.list().length;
  const entitiesPerRuntime = preview.snapshot().entityCount;
  const physicsSnapshot = preview.physics.snapshot();
  preview.runtime.dispose();

  const result: OutpostPreviewBenchmarkResult = {
    millisecondsPerRuntimeBootDispose: round(bootDurationMs / BOOT_ITERATIONS),
    microsecondsPerArenaRenderPlan: round((renderPlanDurationMs * 1_000) / RENDER_PLAN_ITERATIONS),
    microsecondsPerPhysicalTick: round((tickDurationMs * 1_000) / TICK_ITERATIONS),
    microsecondsPerInterpolatedTransformSample: round(
      (interpolationDurationMs * 1_000) / INTERPOLATION_SAMPLE_ITERATIONS
    ),
    retainedPhysicsTraces,
    retainedEntitiesAfterDispose: world.count()
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkOutpostPreviewBudgets(result) : [];
  console.log(
    JSON.stringify(
      {
        benchmark: "outpost-local-physical-preview",
        profile: {
          bootIterations: BOOT_ITERATIONS,
          tickIterations: TICK_ITERATIONS,
          renderPlanIterations: RENDER_PLAN_ITERATIONS,
          interpolationSampleIterations: INTERPOLATION_SAMPLE_ITERATIONS,
          interpolationChecksum: round(interpolationChecksum),
          renderPlanObjectCount,
          entitiesPerRuntime,
          physicsBodiesPerRuntime: physicsSnapshot.bodyCount,
          physicsCollidersPerRuntime: physicsSnapshot.colliderCount,
          fixedDeltaMs: FIXED_DELTA_MS
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: outpostPreviewBudgetCount(),
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

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

await main();
