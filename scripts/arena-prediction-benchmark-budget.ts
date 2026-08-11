export type ArenaPredictionBenchmarkCase = Record<string, number | string>;

export type ArenaPredictionBenchmarkSuite = {
  suite: string;
  cases: ArenaPredictionBenchmarkCase[];
};

export type ArenaPredictionBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type Budget = {
  suite: string;
  where: Record<string, number | string>;
  metric: string;
  maximum: number;
};

const BUDGETS: Budget[] = [
  ...caseBudgets("rapier3d-arena-rollback", 16, 128, 12, {
    p95MsPerRound: 8,
    maxMsPerRound: 32,
    payloadBytes: 16 * 1024,
    maxHistoryBytes: 16 * 1024 * 1024,
    maxCheckpointBytes: 256 * 1024
  }),
  ...caseBudgets("rapier3d-arena-rollback", 32, 128, 30, {
    p95MsPerRound: 25,
    maxMsPerRound: 50,
    payloadBytes: 16 * 1024,
    maxHistoryBytes: 24 * 1024 * 1024,
    maxCheckpointBytes: 512 * 1024
  }),
  ...caseBudgets("rapier3d-arena-rollback", 64, 32, 0, {
    payloadBytes: 32 * 1024,
    maxHistoryBytes: 32 * 1024 * 1024,
    maxCheckpointBytes: 1024 * 1024
  })
];

export function checkArenaPredictionBenchmarkBudgets(
  suites: ArenaPredictionBenchmarkSuite[]
): ArenaPredictionBenchmarkFailure[] {
  const failures: ArenaPredictionBenchmarkFailure[] = [];
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

export function arenaPredictionBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function caseBudgets(
  suite: string,
  members: number,
  simulatedTicks: number,
  rollbackTicks: number,
  timingAndMemory: Record<string, number>
): Budget[] {
  const where = { members, simulatedTicks, rollbackTicks };
  return [
    ...Object.entries(timingAndMemory).map(([metric, maximum]) => ({
      suite,
      where,
      metric,
      maximum
    })),
    { suite, where, metric: "maxHistoryEntries", maximum: simulatedTicks + 1 },
    { suite, where, metric: "hardCorrectionFailures", maximum: 0 },
    { suite, where, metric: "replayBudgetOverflows", maximum: 0 },
    { suite, where, metric: "retainedAfterDispose", maximum: 0 }
  ];
}

function failure(
  budget: Budget,
  reason: ArenaPredictionBenchmarkFailure["reason"],
  actual?: number
): ArenaPredictionBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
