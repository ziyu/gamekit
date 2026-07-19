export type AiBenchmarkCase = Record<string, number | string>;

export type AiBenchmarkSuite = {
  suite: string;
  cases: AiBenchmarkCase[];
};

export type AiBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type AiBenchmarkBudget = {
  suite: string;
  where: AiBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: AiBenchmarkBudget[] = [
  {
    suite: "ai-agent-update",
    where: { agents: 250, profile: "uniform", ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 15
  },
  {
    suite: "ai-agent-update",
    where: { agents: 250, profile: "uniform", ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 40
  },
  {
    suite: "ai-agent-update",
    where: { agents: 1000, profile: "mixed-lod", ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 35
  },
  {
    suite: "ai-agent-update",
    where: { agents: 1000, profile: "mixed-lod", ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 100
  },
  {
    suite: "ai-agent-update",
    where: { agents: 1000, profile: "mixed-lod", ticks: 120 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "ai-trace-overhead",
    where: { agents: 250, traceLimit: 0, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 15
  },
  {
    suite: "ai-trace-overhead",
    where: { agents: 250, traceLimit: 256, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 20
  },
  {
    suite: "ai-trace-overhead",
    where: { agents: 250, traceLimit: 256, ticks: 120 },
    metric: "retainedTraceEntries",
    maximum: 256
  }
];

export function checkAiBenchmarkBudgets(suites: AiBenchmarkSuite[]): AiBenchmarkFailure[] {
  const failures: AiBenchmarkFailure[] = [];
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

export function aiBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function failure(
  budget: AiBenchmarkBudget,
  reason: AiBenchmarkFailure["reason"],
  actual?: number
): AiBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
