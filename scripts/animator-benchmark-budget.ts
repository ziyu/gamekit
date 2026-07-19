export type AnimatorBenchmarkCase = Record<string, number | string>;

export type AnimatorBenchmarkSuite = {
  suite: string;
  cases: AnimatorBenchmarkCase[];
};

export type AnimatorBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type AnimatorBenchmarkBudget = {
  suite: string;
  where: AnimatorBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: AnimatorBenchmarkBudget[] = [
  {
    suite: "animator-controller-update",
    where: { controllers: 500, profile: "active-phase", ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 20
  },
  {
    suite: "animator-controller-update",
    where: { controllers: 500, profile: "active-phase", ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 60
  },
  {
    suite: "animator-controller-update",
    where: { controllers: 1000, profile: "mostly-idle", ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 8
  },
  {
    suite: "animator-controller-update",
    where: { controllers: 1000, profile: "mostly-idle", ticks: 120 },
    metric: "framesDuringMeasurement",
    maximum: 0
  },
  {
    suite: "animator-controller-update",
    where: { controllers: 1000, profile: "mostly-idle", ticks: 120 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "animator-state-churn",
    where: { controllers: 500, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 20
  },
  {
    suite: "animator-late-join",
    where: { controllers: 1000 },
    metric: "milliseconds",
    maximum: 100
  },
  {
    suite: "animator-late-join",
    where: { controllers: 1000 },
    metric: "seekFrames",
    maximum: 1000
  }
];

export function checkAnimatorBenchmarkBudgets(
  suites: AnimatorBenchmarkSuite[]
): AnimatorBenchmarkFailure[] {
  const failures: AnimatorBenchmarkFailure[] = [];
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

export function animatorBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function failure(
  budget: AnimatorBenchmarkBudget,
  reason: AnimatorBenchmarkFailure["reason"],
  actual?: number
): AnimatorBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
