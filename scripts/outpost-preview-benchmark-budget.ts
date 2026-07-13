export type OutpostPreviewBenchmarkResult = {
  millisecondsPerRuntimeBootDispose: number;
  microsecondsPerArenaRenderPlan: number;
  microsecondsPerPhysicalTick: number;
  microsecondsPerInterpolatedTransformSample: number;
  retainedPhysicsTraces: number;
  retainedEntitiesAfterDispose: number;
};

const BUDGETS: Array<{
  metric: keyof OutpostPreviewBenchmarkResult;
  maximum: number;
}> = [
  { metric: "millisecondsPerRuntimeBootDispose", maximum: 8 },
  { metric: "microsecondsPerArenaRenderPlan", maximum: 250 },
  { metric: "microsecondsPerPhysicalTick", maximum: 250 },
  { metric: "microsecondsPerInterpolatedTransformSample", maximum: 2 },
  { metric: "retainedPhysicsTraces", maximum: 180 },
  { metric: "retainedEntitiesAfterDispose", maximum: 0 }
];

export function checkOutpostPreviewBudgets(
  result: OutpostPreviewBenchmarkResult
): Array<{ metric: keyof OutpostPreviewBenchmarkResult; maximum: number; actual: number }> {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function outpostPreviewBudgetCount(): number {
  return BUDGETS.length;
}
