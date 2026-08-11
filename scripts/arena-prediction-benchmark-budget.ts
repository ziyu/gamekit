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
  ...caseBudgets("rapier3d-arena-rollback", "current-14", 14, 128, 12, {
    authorityStepP95Ms: 4,
    replayP95Ms: 10,
    replayMaxMs: 20,
    snapshotPayloadP95Bytes: 32 * 1024,
    snapshotPayloadMaxBytes: 64 * 1024,
    historyMaxBytes: 96 * 1024 * 1024,
    maxCheckpointBytes: 256 * 1024
  }),
  ...caseBudgets("rapier3d-arena-rollback", "target-36", 36, 128, 30, {
    authorityStepP95Ms: 4,
    replayP95Ms: 20,
    replayMaxMs: 30,
    snapshotPayloadP95Bytes: 32 * 1024,
    snapshotPayloadMaxBytes: 64 * 1024,
    historyMaxBytes: 96 * 1024 * 1024,
    maxCheckpointBytes: 512 * 1024
  }),
  ...caseBudgets("rapier3d-arena-rollback", "capacity-64", 64, 32, 0, {
    authorityStepP95Ms: 8,
    snapshotPayloadP95Bytes: 64 * 1024,
    snapshotPayloadMaxBytes: 128 * 1024,
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
  profile: string,
  members: number,
  simulatedTicks: number,
  rollbackTicks: number,
  timingAndMemory: Record<string, number>
): Budget[] {
  const where = { profile, members, simulatedTicks, rollbackTicks };
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
