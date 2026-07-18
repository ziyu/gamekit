export type CombatBenchmarkCase = Record<string, number | string>;

export type CombatBenchmarkSuite = {
  suite: string;
  cases: CombatBenchmarkCase[];
};

export type CombatBenchmarkFailure = {
  suite: string;
  metric: string;
  maximum: number;
  actual?: number | undefined;
  reason: "missing-suite" | "missing-case" | "missing-metric" | "over-budget";
};

type CombatBenchmarkBudget = {
  suite: string;
  where: CombatBenchmarkCase;
  metric: string;
  maximum: number;
};

const BUDGETS: CombatBenchmarkBudget[] = [
  {
    suite: "combat-projectile-update",
    where: { projectiles: 300, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 4
  },
  {
    suite: "combat-projectile-update",
    where: { projectiles: 300, ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 12
  },
  {
    suite: "combat-projectile-update",
    where: { projectiles: 1_500, ticks: 120 },
    metric: "p95MsPerTick",
    maximum: 18
  },
  {
    suite: "combat-projectile-update",
    where: { projectiles: 1_500, ticks: 120 },
    metric: "maxMsPerTick",
    maximum: 45
  },
  {
    suite: "combat-projectile-update",
    where: { projectiles: 1_500, ticks: 120 },
    metric: "retainedAfterDispose",
    maximum: 0
  },
  {
    suite: "combat-mass-hit",
    where: { candidates: 1_000, deliveries: 30 },
    metric: "p95MsPerDelivery",
    maximum: 15
  },
  {
    suite: "combat-mass-hit",
    where: { candidates: 1_000, deliveries: 30 },
    metric: "maxMsPerDelivery",
    maximum: 40
  },
  {
    suite: "combat-ability-delivery-bridge",
    where: { dispatchesPerRound: 1_000, rounds: 30 },
    metric: "p95MsPerRound",
    maximum: 5
  },
  {
    suite: "combat-ability-delivery-bridge",
    where: { dispatchesPerRound: 1_000, rounds: 30 },
    metric: "maxMsPerRound",
    maximum: 15
  },
  {
    suite: "combat-ability-delivery-bridge",
    where: { dispatchesPerRound: 1_000, rounds: 30 },
    metric: "deliveredAfterDispose",
    maximum: 0
  },
  {
    suite: "combat-entity-churn",
    where: { projectilesPerCycle: 300, cycles: 20 },
    metric: "p95MsPerCycle",
    maximum: 25
  },
  {
    suite: "combat-entity-churn",
    where: { projectilesPerCycle: 300, cycles: 20 },
    metric: "retainedAfterDispose",
    maximum: 0
  }
];

export function checkCombatBenchmarkBudgets(
  suites: CombatBenchmarkSuite[]
): CombatBenchmarkFailure[] {
  const failures: CombatBenchmarkFailure[] = [];
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

export function combatBenchmarkBudgetCount(): number {
  return BUDGETS.length;
}

function createFailure(
  budget: CombatBenchmarkBudget,
  reason: CombatBenchmarkFailure["reason"],
  actual?: number
): CombatBenchmarkFailure {
  return {
    suite: budget.suite,
    metric: budget.metric,
    maximum: budget.maximum,
    ...(actual === undefined ? {} : { actual }),
    reason
  };
}
