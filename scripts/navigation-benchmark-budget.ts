export type NavigationBenchmarkCase = Record<string, number | string>;

export type NavigationBenchmarkSuite = {
  suite: string;
  cases: NavigationBenchmarkCase[];
};

export type NavigationBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type NavigationBenchmarkBudget = {
  suite: string;
  where: NavigationBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: NavigationBenchmarkBudget[] = [
  {
    suite: "navigation-route-sampling",
    where: { agents: 250, samplesPerAgent: 120 },
    metric: "microsecondsPerSample",
    maximum: 8
  },
  {
    suite: "navigation-route-sampling",
    where: { agents: 1000, samplesPerAgent: 120 },
    metric: "microsecondsPerSample",
    maximum: 8
  },
  {
    suite: "navigation-route-sampling",
    where: { agents: 1000, samplesPerAgent: 120 },
    metric: "retainedRouteFields",
    maximum: 1
  },
  {
    suite: "navigation-request-burst",
    where: { requests: 1000 },
    metric: "milliseconds",
    maximum: 150
  },
  {
    suite: "navigation-request-burst",
    where: { requests: 1000 },
    metric: "pendingAfterUpdate",
    maximum: 0
  },
  {
    suite: "navigation-blocker-churn",
    where: { cycles: 200 },
    metric: "microsecondsPerCycle",
    maximum: 5000
  },
  {
    suite: "navigation-blocker-churn",
    where: { cycles: 200 },
    metric: "retainedAfterDispose",
    maximum: 0
  }
];

export function checkNavigationBenchmarkBudgets(
  suites: NavigationBenchmarkSuite[]
): NavigationBenchmarkFailure[] {
  const failures: NavigationBenchmarkFailure[] = [];
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

export function navigationBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function failure(
  budget: NavigationBenchmarkBudget,
  reason: NavigationBenchmarkFailure["reason"],
  actual?: number
): NavigationBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
