import { performance } from "node:perf_hooks";
import { createConfiguredAppHost, type AppProfile } from "../packages/app-host/src";
import type { AssetDefinition, AssetLoaderAdapter } from "../packages/asset/src";
import { createKootaWorld } from "../packages/world-koota/src";
import { outpostAppDefinition } from "../apps/multiplayer-outpost-siege-demo/src/app-definition";
import { createOutpostDeterministicTestProfile } from "../apps/multiplayer-outpost-siege-demo/src/profiles/deterministic-test";
import { createOutpostHeadlessServerProfile } from "../apps/multiplayer-outpost-siege-demo/src/profiles/headless-server";
import type { OutpostNonVisualContext } from "../apps/multiplayer-outpost-siege-demo/src/profiles/nonvisual";
import {
  checkOutpostProfileBudgets,
  outpostProfileBudgetCount,
  type OutpostProfileBenchmarkResult
} from "./outpost-profile-benchmark-budget";

const WARMUP_ITERATIONS = 8;
const LIFECYCLE_ITERATIONS = 100;
const FIXED_DELTA_MS = 1000 / 60;

type ProfileFactory = (
  context: OutpostNonVisualContext,
  options: { assetAdapter: AssetLoaderAdapter; createWorld: typeof createKootaWorld }
) => AppProfile<OutpostNonVisualContext>;

async function main(): Promise<void> {
  await measureProfile(createOutpostHeadlessServerProfile, WARMUP_ITERATIONS);
  await measureProfile(createOutpostDeterministicTestProfile, WARMUP_ITERATIONS);

  const headless = await measureProfile(createOutpostHeadlessServerProfile, LIFECYCLE_ITERATIONS);
  const deterministic = await measureProfile(
    createOutpostDeterministicTestProfile,
    LIFECYCLE_ITERATIONS
  );
  const result: OutpostProfileBenchmarkResult = {
    millisecondsPerHeadlessLifecycle: round(headless.durationMs / LIFECYCLE_ITERATIONS),
    millisecondsPerDeterministicLifecycle: round(deterministic.durationMs / LIFECYCLE_ITERATIONS),
    headlessVisualAssetLoads: headless.assetLoads,
    retainedEntitiesAfterDispose: headless.retainedEntities + deterministic.retainedEntities
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkOutpostProfileBudgets(result) : [];

  console.log(
    JSON.stringify(
      {
        benchmark: "outpost-app-profiles",
        profile: {
          warmupIterations: WARMUP_ITERATIONS,
          lifecycleIterations: LIFECYCLE_ITERATIONS,
          worldOwnership: "owner-supplied-reusable-world",
          deterministicAssetLoads: deterministic.assetLoads,
          fixedDeltaMs: FIXED_DELTA_MS
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: outpostProfileBudgetCount(),
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

async function measureProfile(
  createProfile: ProfileFactory,
  iterations: number
): Promise<{ durationMs: number; assetLoads: number; retainedEntities: number }> {
  let assetLoads = 0;
  let retainedEntities = 0;
  const world = createKootaWorld();
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const context: OutpostNonVisualContext = { assetDiagnostics: [] };
    const configured = createConfiguredAppHost({
      app: outpostAppDefinition,
      profile: createProfile(context, {
        assetAdapter: countingAssetAdapter(() => {
          assetLoads += 1;
        }),
        createWorld: () => world
      }),
      context,
      clock: () => index
    });
    await configured.host.boot();
    await configured.host.start();
    configured.host.tick(FIXED_DELTA_MS, index * FIXED_DELTA_MS);
    const runtimeWorld = context.preview?.runtime.world;
    await configured.host.dispose();
    retainedEntities += runtimeWorld?.count() ?? 0;
  }

  return {
    durationMs: performance.now() - startedAt,
    assetLoads,
    retainedEntities
  };
}

function countingAssetAdapter(onLoad: () => void): AssetLoaderAdapter {
  return {
    id: "outpost.profile-benchmark.assets",
    supports() {
      return true;
    },
    async load(_asset: AssetDefinition) {
      onLoad();
      return undefined;
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

await main();
