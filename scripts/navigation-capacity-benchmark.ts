import { performance } from "node:perf_hooks";
import {
  createNavigationRuntime,
  type NavigationPoint,
  type NavigationRuntime
} from "../packages/navigation-core/src";
import {
  NAVIGATION_LAB_PROFILES,
  type NavigationLabScenarioDefinition
} from "../apps/sandbox/src/scenes/navigation-lab/scenario";
import type { NavigationLabBackendProvider } from "../apps/sandbox/src/scenes/navigation-lab/backends";
import {
  BLACKGLASS_BASIN_SCENARIO,
  createBlackglassGraphNavigationLabBackendProvider,
  createBlackglassGridNavigationLabBackendProvider,
  createBlackglassRecastNavigationLabBackendProvider
} from "../apps/sandbox/src/scenes/navigation-lab/scenarios";

type FieldCapacityTier = {
  agents: number;
  measuredTicks: number;
  averageTickMs: number;
  p95TickMs: number;
  peakTickMs: number;
  microsecondsPerSample: number;
  validSamples: number;
  checksum: number;
};

type FieldCapacityResult = {
  fieldBuildMs: number;
  routeCost: number;
  navigationBudgetMs: number;
  frameBudgetMs: number;
  maxAgentsWithinNavigationBudget: number;
  maxAgentsWithinFrameBudget: number;
  navigationCapacityIsLowerBound: boolean;
  frameCapacityIsLowerBound: boolean;
  tiers: FieldCapacityTier[];
};

type PathBurstResult = {
  requests: number;
  requestsPerTick: number;
  submitMs: number;
  drainMs: number;
  drainTicks: number;
  averageUpdateMs: number;
  p95UpdateMs: number;
  peakUpdateMs: number;
  requestsPerSecond: number;
  completed: number;
  failed: number;
};

const FIELD_AGENT_COUNTS = [100, 250, 500, 1000, 1500, 2000, 2500, 5000, 10_000, 20_000, 50_000];
const FIELD_WARMUP_TICKS = 5;
const FIELD_MEASURED_TICKS = 30;
const NAVIGATION_BUDGET_MS = 4;
const FRAME_BUDGET_MS = 1000 / 60;
const PATH_BURST_REQUESTS = 1000;
const PATH_REQUESTS_PER_TICK = 64;

async function main(): Promise<void> {
  const providers = [
    createBlackglassGraphNavigationLabBackendProvider({ id: "capacity-graph" }),
    createBlackglassGridNavigationLabBackendProvider({ id: "capacity-grid" }),
    createBlackglassRecastNavigationLabBackendProvider({ id: "capacity-recast" })
  ];
  const backends = [];

  for (const provider of providers) {
    await provider.prepare?.();
    backends.push({
      id: provider.id,
      label: provider.label,
      field: runFieldCapacity(provider, BLACKGLASS_BASIN_SCENARIO),
      individualPathBurst: runIndividualPathBurst(provider, BLACKGLASS_BASIN_SCENARIO)
    });
  }

  console.log(
    JSON.stringify(
      {
        benchmark: "navigation-capacity",
        scenario: BLACKGLASS_BASIN_SCENARIO.id,
        methodology: {
          field:
            "One backend-owned shared route field is sampled once per unit per simulated tick. Canvas, React, World, Physics, separation, and rendering are excluded.",
          individualPathBurst: `${PATH_BURST_REQUESTS} cache-distinct point paths are drained through a ${PATH_REQUESTS_PER_TICK}-request per-tick budget and released immediately.`,
          budgets: {
            navigationSliceMs: NAVIGATION_BUDGET_MS,
            frame60HzMs: round(FRAME_BUDGET_MS)
          },
          interpretation:
            "Field capacity estimates steady-state route sampling. Path burst reports planning throughput and latency; it is not a recommendation to recompute every unit path every frame."
        },
        backends
      },
      null,
      2
    )
  );
}

function runFieldCapacity(
  provider: NavigationLabBackendProvider,
  scenario: NavigationLabScenarioDefinition
): FieldCapacityResult {
  const runtime = createBenchmarkRuntime(provider, FIELD_AGENT_COUNTS.at(-1) ?? 50_000);
  const requestId = runtime.requestPath({
    id: `${provider.id}.capacity.field`,
    requesterId: `${provider.id}.capacity.field`,
    profileId: "profile.scout",
    start: scenario.start,
    goal: scenario.goal,
    goalKey: scenario.goalKey,
    routeKind: "field"
  });
  const fieldStartedAt = performance.now();
  runtime.update(16, 16);
  const result = runtime.poll(requestId);
  const fieldBuildMs = performance.now() - fieldStartedAt;
  if (result.status !== "complete" || result.route.kind !== "field") {
    runtime.dispose();
    throw new Error(`${provider.label} capacity field failed: ${result.status}`);
  }

  const routeId = result.route.routeId;
  const samplePoints = [...scenario.fieldAgentStarts, ...scenario.fieldSamplePoints];
  const tiers: FieldCapacityTier[] = [];
  for (const agents of FIELD_AGENT_COUNTS) {
    sampleFieldTicks(runtime, routeId, samplePoints, agents, FIELD_WARMUP_TICKS, false);
    const tier = sampleFieldTicks(
      runtime,
      routeId,
      samplePoints,
      agents,
      FIELD_MEASURED_TICKS,
      true
    );
    tiers.push(tier);
    if (tier.p95TickMs > FRAME_BUDGET_MS) {
      break;
    }
  }

  runtime.releaseRoute(routeId);
  runtime.dispose();
  const maxAgentsWithinNavigationBudget = maxAgentsWithin(tiers, NAVIGATION_BUDGET_MS);
  const maxAgentsWithinFrameBudget = maxAgentsWithin(tiers, FRAME_BUDGET_MS);
  const finalTier = tiers.at(-1);
  return {
    fieldBuildMs: round(fieldBuildMs),
    routeCost: round(result.route.cost),
    navigationBudgetMs: NAVIGATION_BUDGET_MS,
    frameBudgetMs: round(FRAME_BUDGET_MS),
    maxAgentsWithinNavigationBudget,
    maxAgentsWithinFrameBudget,
    navigationCapacityIsLowerBound:
      finalTier !== undefined && finalTier.p95TickMs <= NAVIGATION_BUDGET_MS,
    frameCapacityIsLowerBound: finalTier !== undefined && finalTier.p95TickMs <= FRAME_BUDGET_MS,
    tiers
  };
}

function sampleFieldTicks(
  runtime: NavigationRuntime,
  routeId: string,
  points: readonly NavigationPoint[],
  agents: number,
  ticks: number,
  collect: boolean
): FieldCapacityTier {
  const durations: number[] = [];
  let validSamples = 0;
  let checksum = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    const startedAt = performance.now();
    for (let agent = 0; agent < agents; agent += 1) {
      const point = points[(agent + tick) % points.length] ?? { x: 0, y: 0 };
      const sample = runtime.sampleRoute(routeId, point);
      if (sample.status === "valid") {
        validSamples += 1;
        checksum += sample.nextPoint.x + sample.nextPoint.y + sample.remainingDistance;
      }
    }
    if (collect) {
      durations.push(performance.now() - startedAt);
    }
  }
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  const sorted = [...durations].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    agents,
    measuredTicks: durations.length,
    averageTickMs: round(durations.length === 0 ? 0 : totalMs / durations.length),
    p95TickMs: round(sorted[p95Index] ?? 0),
    peakTickMs: round(sorted.at(-1) ?? 0),
    microsecondsPerSample: round(agents === 0 ? 0 : (totalMs * 1000) / (agents * durations.length)),
    validSamples,
    checksum: round(checksum)
  };
}

function runIndividualPathBurst(
  provider: NavigationLabBackendProvider,
  scenario: NavigationLabScenarioDefinition
): PathBurstResult {
  const runtime = createBenchmarkRuntime(provider, PATH_BURST_REQUESTS);
  const requestIds = new Set<string>();
  const submitStartedAt = performance.now();
  for (let index = 0; index < PATH_BURST_REQUESTS; index += 1) {
    const start =
      scenario.fieldAgentStarts[index % scenario.fieldAgentStarts.length] ?? scenario.start;
    requestIds.add(
      runtime.requestPath({
        id: `${provider.id}.capacity.path.${index}`,
        requesterId: `${provider.id}.capacity.agent.${index}`,
        profileId: "profile.scout",
        start,
        goal: scenario.goal,
        goalKey: `${scenario.goalKey}.capacity.${index}`,
        routeKind: "path"
      })
    );
  }
  const submitMs = performance.now() - submitStartedAt;
  const updateDurations: number[] = [];
  let completed = 0;
  let failed = 0;
  let tick = 0;
  const drainStartedAt = performance.now();
  while (requestIds.size > 0 && tick < 10_000) {
    tick += 1;
    const updateStartedAt = performance.now();
    runtime.update(16, tick * 16);
    updateDurations.push(performance.now() - updateStartedAt);
    for (const requestId of requestIds) {
      const result = runtime.poll(requestId);
      if (result.status === "pending") {
        continue;
      }
      requestIds.delete(requestId);
      if (result.status === "complete") {
        completed += 1;
        runtime.releaseRoute(result.route.routeId);
      } else {
        failed += 1;
      }
    }
  }
  const drainMs = performance.now() - drainStartedAt;
  const sorted = [...updateDurations].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const averageUpdateMs =
    updateDurations.reduce((sum, duration) => sum + duration, 0) / updateDurations.length;
  runtime.dispose();
  if (requestIds.size > 0) {
    throw new Error(`${provider.label} did not drain ${requestIds.size} path requests`);
  }
  return {
    requests: PATH_BURST_REQUESTS,
    requestsPerTick: PATH_REQUESTS_PER_TICK,
    submitMs: round(submitMs),
    drainMs: round(drainMs),
    drainTicks: tick,
    averageUpdateMs: round(averageUpdateMs),
    p95UpdateMs: round(sorted[p95Index] ?? 0),
    peakUpdateMs: round(sorted.at(-1) ?? 0),
    requestsPerSecond: round((completed / drainMs) * 1000),
    completed,
    failed
  };
}

function createBenchmarkRuntime(
  provider: NavigationLabBackendProvider,
  capacity: number
): NavigationRuntime {
  return createNavigationRuntime({
    id: `navigation-capacity.${provider.id}`,
    layout: provider.layoutRef,
    backendFactories: provider.createBackendFactories(),
    dataRegistry: provider.createDataRegistry(),
    profiles: NAVIGATION_LAB_PROFILES.map((profile) => ({
      ...profile,
      allowedAreas: [...profile.allowedAreas],
      costOverrides: { ...profile.costOverrides },
      tags: [...profile.tags]
    })),
    maxRequestsPerTick: PATH_REQUESTS_PER_TICK,
    maxBackendPollsPerTick: PATH_REQUESTS_PER_TICK,
    maxPendingRequests: capacity + 16,
    maxPendingPerRequester: 1,
    maxRetainedResults: capacity + 16,
    maxRetainedRoutes: capacity + 16,
    maxCacheEntries: 16,
    traceLimit: 32
  });
}

function maxAgentsWithin(tiers: readonly FieldCapacityTier[], budgetMs: number): number {
  return tiers.reduce(
    (maximum, tier) => (tier.p95TickMs <= budgetMs ? Math.max(maximum, tier.agents) : maximum),
    0
  );
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

await main();
