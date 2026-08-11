export type CheckpointBenchmarkCase = Record<string, number | string>;

export type CheckpointBenchmarkSuite = {
  suite: string;
  cases: CheckpointBenchmarkCase[];
};

export type CheckpointBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type CheckpointBudget = {
  suite: string;
  where: CheckpointBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: CheckpointBudget[] = [
  {
    suite: "tca-checkpoint",
    where: { onceRules: 1_000, cycles: 1_000 },
    metric: "msPerCapture",
    maximum: 0.5
  },
  {
    suite: "tca-checkpoint",
    where: { onceRules: 1_000, cycles: 1_000 },
    metric: "msPerRestore",
    maximum: 2
  },
  {
    suite: "gas-checkpoint",
    where: { actors: 1_000, activeEffects: 500, activeExecutions: 500, cycles: 20 },
    metric: "msPerCapture",
    maximum: 10
  },
  {
    suite: "gas-checkpoint",
    where: { actors: 1_000, activeEffects: 500, activeExecutions: 500, cycles: 20 },
    metric: "msPerRestore",
    maximum: 30
  },
  {
    suite: "gas-checkpoint",
    where: { actors: 1_000, activeEffects: 500, activeExecutions: 500, cycles: 20 },
    metric: "restoredExecutions",
    maximum: 500
  },
  {
    suite: "physics-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "msPerCapture",
    maximum: 25
  },
  {
    suite: "physics-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "msPerRestoreAndTick",
    maximum: 50
  },
  {
    suite: "multiplayer-rollback-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "msPerCapture",
    maximum: 100
  },
  {
    suite: "multiplayer-rollback-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "msPerRestoreAndTick",
    maximum: 100
  },
  {
    suite: "multiplayer-rollback-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "checkpointBytes",
    maximum: 2_097_152
  },
  {
    suite: "multiplayer-rollback-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "historyBytes",
    maximum: 16_777_216
  },
  {
    suite: "multiplayer-rollback-checkpoint",
    where: { entities: 1_000, cycles: 20 },
    metric: "retainedCheckpoints",
    maximum: 21
  }
];

export function checkCheckpointBudgets(
  suites: CheckpointBenchmarkSuite[]
): CheckpointBenchmarkFailure[] {
  const failures: CheckpointBenchmarkFailure[] = [];
  for (const budget of BUDGETS) {
    const suite = suites.find((candidate) => candidate.suite === budget.suite);
    if (suite === undefined) {
      failures.push(createFailure(budget, "missing-suite"));
      continue;
    }
    const benchmarkCase = suite.cases.find((candidate) =>
      Object.entries(budget.where).every(([key, value]) => candidate[key] === value)
    );
    if (benchmarkCase === undefined) {
      failures.push(createFailure(budget, "missing-case"));
      continue;
    }
    const actual = benchmarkCase[budget.metric];
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      failures.push(createFailure(budget, "missing-metric"));
    } else if (actual > budget.maximum) {
      failures.push(createFailure(budget, "over-budget", actual));
    }
  }
  return failures;
}

export function checkpointBudgetCount(): number {
  return BUDGETS.length;
}

function createFailure(
  budget: CheckpointBudget,
  reason: CheckpointBenchmarkFailure["reason"],
  actual?: number
): CheckpointBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
