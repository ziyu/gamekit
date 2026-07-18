export type OutpostAuthorityBenchmarkResult = {
  microsecondsPerFourPlayerPhysicalTick: number;
  microsecondsPerPlayerChurnTick: number;
  microsecondsPerCombatTick: number;
  retainedPhysicsTraces: number;
  retainedGasTraces: number;
  retainedTcaTraces: number;
  retainedEntitiesAfterDispose: number;
};

const BUDGETS: Array<{
  metric: keyof OutpostAuthorityBenchmarkResult;
  maximum: number;
}> = [
  { metric: "microsecondsPerFourPlayerPhysicalTick", maximum: 250 },
  { metric: "microsecondsPerPlayerChurnTick", maximum: 250 },
  { metric: "microsecondsPerCombatTick", maximum: 500 },
  { metric: "retainedPhysicsTraces", maximum: 180 },
  { metric: "retainedGasTraces", maximum: 240 },
  { metric: "retainedTcaTraces", maximum: 180 },
  { metric: "retainedEntitiesAfterDispose", maximum: 0 }
];

export function checkOutpostAuthorityBudgets(
  result: OutpostAuthorityBenchmarkResult
): Array<{ metric: keyof OutpostAuthorityBenchmarkResult; maximum: number; actual: number }> {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function outpostAuthorityBudgetCount(): number {
  return BUDGETS.length;
}
