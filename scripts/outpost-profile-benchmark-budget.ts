export type OutpostProfileBenchmarkResult = {
  millisecondsPerHeadlessLifecycle: number;
  millisecondsPerDeterministicLifecycle: number;
  headlessVisualAssetLoads: number;
  retainedEntitiesAfterDispose: number;
};

export type OutpostProfileBenchmarkFailure = {
  metric: keyof OutpostProfileBenchmarkResult;
  maximum: number;
  actual: number;
};

const BUDGETS: Array<{
  metric: keyof OutpostProfileBenchmarkResult;
  maximum: number;
}> = [
  { metric: "millisecondsPerHeadlessLifecycle", maximum: 12 },
  { metric: "millisecondsPerDeterministicLifecycle", maximum: 16 },
  { metric: "headlessVisualAssetLoads", maximum: 0 },
  { metric: "retainedEntitiesAfterDispose", maximum: 0 }
];

export function checkOutpostProfileBudgets(
  result: OutpostProfileBenchmarkResult
): OutpostProfileBenchmarkFailure[] {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function outpostProfileBudgetCount(): number {
  return BUDGETS.length;
}
