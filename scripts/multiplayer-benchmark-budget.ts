export type MultiplayerBenchmarkCase = Record<string, number | string>;

export type MultiplayerBenchmarkSuite = {
  suite: string;
  cases: MultiplayerBenchmarkCase[];
};

export type MultiplayerBenchmarkBudgetFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type MultiplayerBenchmarkBudget = {
  suite: string;
  where: MultiplayerBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: MultiplayerBenchmarkBudget[] = [
  {
    suite: "runtime-envelope-normalization",
    where: { messages: 500_000 },
    metric: "microsecondsPerMessage",
    maximum: 5
  },
  {
    suite: "authority-receiver-source-gate",
    where: { messages: 250_000, rejectedEvery: 4 },
    metric: "microsecondsPerMessage",
    maximum: 8
  },
  {
    suite: "authority-host-input-loop",
    where: { clients: 32 },
    metric: "msPerTick",
    maximum: 1
  },
  {
    suite: "authority-host-action-queue",
    where: { clients: 32, actionsPerClientPerTick: 2 },
    metric: "msPerTick",
    maximum: 1.5
  },
  {
    suite: "authority-latest-input-coalescing",
    where: { clients: 32, burstSize: 4 },
    metric: "msPerTick",
    maximum: 1.5
  },
  {
    suite: "authority-local-input-loop",
    where: { inputs: 500_000 },
    metric: "microsecondsPerInput",
    maximum: 6
  },
  {
    suite: "prediction-reconciliation",
    where: { inputs: 100_000, reconcileEvery: 12 },
    metric: "microsecondsPerInput",
    maximum: 3
  },
  {
    suite: "prediction-presentation",
    where: { presentationFps: 120 },
    metric: "microsecondsPerFrame",
    maximum: 3
  },
  {
    suite: "snapshot-playback",
    where: { snapshots: 100_000, maxSnapshots: 96 },
    metric: "microsecondsPerSnapshot",
    maximum: 30
  },
  {
    suite: "presentation-projection",
    where: { trackCount: 5_000 },
    metric: "msPerFrame",
    maximum: 15
  }
];

export function checkMultiplayerBenchmarkBudgets(
  suites: MultiplayerBenchmarkSuite[]
): MultiplayerBenchmarkBudgetFailure[] {
  const failures: MultiplayerBenchmarkBudgetFailure[] = [];

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

export function multiplayerBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function matches(candidate: MultiplayerBenchmarkCase, expected: MultiplayerBenchmarkCase): boolean {
  return Object.entries(expected).every(([key, value]) => candidate[key] === value);
}

function createFailure(
  budget: MultiplayerBenchmarkBudget,
  reason: MultiplayerBenchmarkBudgetFailure["reason"],
  actual?: number
): MultiplayerBenchmarkBudgetFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
