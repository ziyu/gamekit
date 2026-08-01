export type ProjectilePredictionBenchmarkCase = Record<string, number | string>;

export type ProjectilePredictionBenchmarkSuite = {
  suite: string;
  cases: ProjectilePredictionBenchmarkCase[];
};

export type ProjectilePredictionBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type Budget = {
  suite: string;
  where: ProjectilePredictionBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: Budget[] = [
  {
    suite: "kinematic-record-churn",
    where: { recordsPerRound: 5_000, rounds: 20 },
    metric: "p95MsPerRound",
    maximum: 35
  },
  {
    suite: "kinematic-record-churn",
    where: { recordsPerRound: 5_000, rounds: 20 },
    metric: "retainedRecords",
    maximum: 512
  },
  {
    suite: "kinematic-record-churn",
    where: { recordsPerRound: 5_000, rounds: 20 },
    metric: "recordBytes",
    maximum: 1_024
  },
  {
    suite: "owner-kinematic-sweep",
    where: { projectiles: 1_000, rounds: 20 },
    metric: "p95MsPerRound",
    maximum: 35
  },
  {
    suite: "owner-kinematic-sweep",
    where: { projectiles: 1_000, rounds: 20 },
    metric: "unfinishedProjectiles",
    maximum: 0
  },
  {
    suite: "owner-kinematic-sweep",
    where: { projectiles: 1_000, rounds: 20 },
    metric: "maxBlockerPenetration",
    maximum: 0.001
  },
  {
    suite: "owner-kinematic-sweep",
    where: { projectiles: 1_000, rounds: 20 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "remote-record-reconstruction",
    where: { samples: 250_000 },
    metric: "maxBlockerPenetration",
    maximum: 0.001
  },
  {
    suite: "predicted-spawn-matching",
    where: { spawns: 100_000 },
    metric: "pendingAfterMatch",
    maximum: 0
  },
  {
    suite: "predicted-spawn-matching",
    where: { spawns: 100_000 },
    metric: "pendingOrderEntries",
    maximum: 16
  },
  {
    suite: "predicted-spawn-matching",
    where: { spawns: 100_000 },
    metric: "resolvedEntries",
    maximum: 2_048
  },
  {
    suite: "physics-island-rollback",
    where: { rounds: 20, members: 24, simulatedTicks: 120, rollbackTicks: 30 },
    metric: "p95MsPerRound",
    maximum: 120
  },
  {
    suite: "physics-island-rollback",
    where: { rounds: 20, members: 24, simulatedTicks: 120, rollbackTicks: 30 },
    metric: "maxHistoryBytes",
    maximum: 4_194_304
  },
  {
    suite: "physics-island-rollback",
    where: { rounds: 20, members: 24, simulatedTicks: 120, rollbackTicks: 30 },
    metric: "maxHistoryEntries",
    maximum: 121
  },
  {
    suite: "physics-island-rollback",
    where: { rounds: 20, members: 24, simulatedTicks: 120, rollbackTicks: 30 },
    metric: "retainedAfterDispose",
    maximum: 0
  }
];

export function checkProjectilePredictionBenchmarkBudgets(
  suites: ProjectilePredictionBenchmarkSuite[]
): ProjectilePredictionBenchmarkFailure[] {
  const failures: ProjectilePredictionBenchmarkFailure[] = [];
  for (const budget of BUDGETS) {
    const suite = suites.find((candidate) => candidate.suite === budget.suite);
    if (suite === undefined) {
      failures.push(failure(budget, "missing-suite"));
      continue;
    }
    const benchmarkCase = suite.cases.find((candidate) =>
      Object.entries(budget.where).every(([key, value]) => candidate[key] === value)
    );
    if (benchmarkCase === undefined) {
      failures.push(failure(budget, "missing-case"));
      continue;
    }
    const actual = benchmarkCase[budget.metric];
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      failures.push(failure(budget, "missing-metric"));
    } else if (actual > budget.maximum) {
      failures.push(failure(budget, "over-budget", actual));
    }
  }
  return failures;
}

export function projectilePredictionBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function failure(
  budget: Budget,
  reason: ProjectilePredictionBenchmarkFailure["reason"],
  actual?: number
): ProjectilePredictionBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
