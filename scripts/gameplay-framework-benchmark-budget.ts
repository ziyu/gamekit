export type GameplayFrameworkBenchmarkCase = Record<string, number | string>;

export type GameplayFrameworkBenchmarkSuite = {
  suite: string;
  cases: GameplayFrameworkBenchmarkCase[];
};

export type GameplayFrameworkBenchmarkBudgetFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type GameplayFrameworkBenchmarkBudget = {
  suite: string;
  where: GameplayFrameworkBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: GameplayFrameworkBenchmarkBudget[] = [
  {
    suite: "event-bus-correlated-fanout",
    where: { events: 200_000, listeners: 3 },
    metric: "microsecondsPerEvent",
    maximum: 2
  },
  {
    suite: "tca-indexed-dispatch",
    where: { events: 25_000, totalRules: 1_004, candidateRules: 4 },
    metric: "microsecondsPerEvent",
    maximum: 15
  },
  {
    suite: "gas-ability-effect-chain",
    where: { activations: 20_000, targetActors: 128 },
    metric: "microsecondsPerActivation",
    maximum: 50
  },
  {
    suite: "gas-bounded-effect-stacking",
    where: { applications: 20_000, stackLimit: 1, overflow: "refresh-oldest" },
    metric: "microsecondsPerApplication",
    maximum: 30
  },
  {
    suite: "gas-bounded-effect-stacking",
    where: { applications: 20_000, stackLimit: 4, overflow: "reject-newest" },
    metric: "microsecondsPerApplication",
    maximum: 15
  },
  {
    suite: "gas-entity-effect-update",
    where: { actors: 500, activeEffects: 0, periodMs: "none", ticks: 120 },
    metric: "msPerTick",
    maximum: 5
  },
  {
    suite: "gas-entity-effect-update",
    where: { actors: 500, activeEffects: 500, periodMs: 1_000, ticks: 120 },
    metric: "msPerTick",
    maximum: 6
  },
  {
    suite: "gas-entity-effect-update",
    where: { actors: 500, activeEffects: 500, periodMs: 50, ticks: 120 },
    metric: "msPerTick",
    maximum: 10
  },
  {
    suite: "gas-missing-entity-cleanup",
    where: { actors: 4_000, removedActors: 2_000 },
    metric: "microsecondsPerActor",
    maximum: 20
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "idle", trace: "disabled", ticks: 120 },
    metric: "msPerTick",
    maximum: 5
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "disabled", ticks: 16 },
    metric: "msPerTick",
    maximum: 12
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "enabled", ticks: 16 },
    metric: "msPerTick",
    maximum: 12
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "disabled", ticks: 16 },
    metric: "retainedExecutions",
    maximum: 256
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "enabled", ticks: 16 },
    metric: "retainedExecutions",
    maximum: 256
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "idle", trace: "disabled", ticks: 120 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "disabled", ticks: 16 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "gas-ability-execution-update",
    where: { actors: 1_000, mode: "active", trace: "enabled", ticks: 16 },
    metric: "retainedAfterDispose",
    maximum: 0
  }
];

export function checkGameplayFrameworkBenchmarkBudgets(
  suites: GameplayFrameworkBenchmarkSuite[]
): GameplayFrameworkBenchmarkBudgetFailure[] {
  const failures: GameplayFrameworkBenchmarkBudgetFailure[] = [];

  for (const budget of BUDGETS) {
    const suite = suites.find((candidate) => candidate.suite === budget.suite);
    if (suite === undefined) {
      failures.push(createFailure(budget, "missing-suite"));
      continue;
    }

    const benchmarkCase = suite.cases.find((candidate) => matches(candidate, budget.where));
    if (benchmarkCase === undefined) {
      failures.push(createFailure(budget, "missing-case"));
      continue;
    }

    const actual = benchmarkCase[budget.metric];
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      failures.push(createFailure(budget, "missing-metric"));
      continue;
    }
    if (actual > budget.maximum) {
      failures.push(createFailure(budget, "over-budget", actual));
    }
  }

  return failures;
}

export function gameplayFrameworkBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function matches(
  candidate: GameplayFrameworkBenchmarkCase,
  expected: GameplayFrameworkBenchmarkCase
): boolean {
  return Object.entries(expected).every(([key, value]) => candidate[key] === value);
}

function createFailure(
  budget: GameplayFrameworkBenchmarkBudget,
  reason: GameplayFrameworkBenchmarkBudgetFailure["reason"],
  actual?: number
): GameplayFrameworkBenchmarkBudgetFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
