export type OutpostClientBenchmarkResult = {
  microsecondsPerFourPlayerSnapshot: number;
  microsecondsPerPlayerChurnSnapshot: number;
  microsecondsPerFourPlayerSchemaProjectionAndDecode: number;
  microsecondsPerCombatSnapshot: number;
  microsecondsPerCombatSchemaProjectionAndDecode: number;
  maximumEstimatedSchemaStateBytes: number;
  maximumCombatEstimatedSchemaStateBytes: number;
  maximumCombatEntities: number;
  rejectedSnapshots: number;
  predictionPendingInputs: number;
  predictionCachedFrames: number;
  retainedEntitiesAfterDispose: number;
  retainedPhysicsScenesAfterDispose: number;
};

const BUDGETS: Array<{
  metric: keyof OutpostClientBenchmarkResult;
  maximum: number;
}> = [
  { metric: "microsecondsPerFourPlayerSnapshot", maximum: 150 },
  { metric: "microsecondsPerPlayerChurnSnapshot", maximum: 200 },
  { metric: "microsecondsPerFourPlayerSchemaProjectionAndDecode", maximum: 100 },
  { metric: "microsecondsPerCombatSnapshot", maximum: 4_000 },
  { metric: "microsecondsPerCombatSchemaProjectionAndDecode", maximum: 2_000 },
  { metric: "maximumEstimatedSchemaStateBytes", maximum: 16 * 1024 },
  { metric: "maximumCombatEstimatedSchemaStateBytes", maximum: 256 * 1024 },
  { metric: "maximumCombatEntities", maximum: 460 },
  { metric: "rejectedSnapshots", maximum: 0 },
  { metric: "predictionPendingInputs", maximum: 8 },
  { metric: "predictionCachedFrames", maximum: 256 },
  { metric: "retainedEntitiesAfterDispose", maximum: 0 },
  { metric: "retainedPhysicsScenesAfterDispose", maximum: 0 }
];

export function checkOutpostClientBudgets(
  result: OutpostClientBenchmarkResult
): Array<{ metric: keyof OutpostClientBenchmarkResult; maximum: number; actual: number }> {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function outpostClientBudgetCount(): number {
  return BUDGETS.length;
}
