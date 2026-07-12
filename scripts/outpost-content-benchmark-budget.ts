export type OutpostContentBenchmarkResult = {
  millisecondsPerContentBoot: number;
  microsecondsPerIdentityRegistration: number;
  microsecondsPerIdentityLookup: number;
  retainedDocuments: number;
  retainedReferences: number;
  retainedIdentities: number;
};

export type OutpostContentBenchmarkFailure = {
  metric: keyof OutpostContentBenchmarkResult;
  maximum: number;
  actual: number;
};

const BUDGETS: Array<{
  metric: keyof OutpostContentBenchmarkResult;
  maximum: number;
}> = [
  { metric: "millisecondsPerContentBoot", maximum: 5 },
  { metric: "microsecondsPerIdentityRegistration", maximum: 20 },
  { metric: "microsecondsPerIdentityLookup", maximum: 5 },
  { metric: "retainedDocuments", maximum: 128 },
  { metric: "retainedReferences", maximum: 256 },
  { metric: "retainedIdentities", maximum: 25_000 }
];

export function checkOutpostContentBudgets(
  result: OutpostContentBenchmarkResult
): OutpostContentBenchmarkFailure[] {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function outpostContentBudgetCount(): number {
  return BUDGETS.length;
}
