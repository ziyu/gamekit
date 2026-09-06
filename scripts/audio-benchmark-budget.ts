export type AudioBenchmarkCase = Record<string, number | string>;

export type AudioBenchmarkSuite = {
  suite: string;
  cases: AudioBenchmarkCase[];
};

export type AudioBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type AudioBenchmarkBudget = {
  suite: string;
  where: AudioBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: AudioBenchmarkBudget[] = [
  {
    suite: "audio-sfx-burst",
    where: { eventsPerRound: 1000, rounds: 30 },
    metric: "p95MsPerRound",
    maximum: 40
  },
  {
    suite: "audio-sfx-burst",
    where: { eventsPerRound: 1000, rounds: 30 },
    metric: "maxMsPerRound",
    maximum: 100
  },
  {
    suite: "audio-sfx-burst",
    where: { eventsPerRound: 1000, rounds: 30 },
    metric: "activePlaybackInstances",
    maximum: 64
  },
  {
    suite: "audio-spatial-update",
    where: { instances: 500, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 15
  },
  {
    suite: "audio-spatial-update",
    where: { instances: 500, ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 40
  },
  {
    suite: "audio-stop-group",
    where: { instances: 1000 },
    metric: "milliseconds",
    maximum: 30
  },
  {
    suite: "audio-stop-group",
    where: { instances: 1000 },
    metric: "activeAfterStop",
    maximum: 0
  },
  {
    suite: "audio-stop-group",
    where: { instances: 1000 },
    metric: "retainedAfterDispose",
    maximum: 0
  }
];

export function checkAudioBenchmarkBudgets(suites: AudioBenchmarkSuite[]): AudioBenchmarkFailure[] {
  const failures: AudioBenchmarkFailure[] = [];
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

export function audioBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function failure(
  budget: AudioBenchmarkBudget,
  reason: AudioBenchmarkFailure["reason"],
  actual?: number
): AudioBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
