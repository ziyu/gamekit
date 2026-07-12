export type DiagnosticsBenchmarkResult = {
  traces: number;
  runtimeSnapshots: number;
  microsecondsPerTrace: number;
  millisecondsPerRuntimeSnapshot: number;
  retainedTraces: number;
  retainedCorrelations: number;
  retainedDomainTraces: number;
};

export type DiagnosticsBenchmarkFailure = {
  metric: keyof DiagnosticsBenchmarkResult;
  maximum: number;
  actual: number;
};

const BUDGETS: Array<{
  metric: keyof DiagnosticsBenchmarkResult;
  maximum: number;
}> = [
  { metric: "microsecondsPerTrace", maximum: 10 },
  { metric: "millisecondsPerRuntimeSnapshot", maximum: 2 },
  { metric: "retainedTraces", maximum: 512 },
  { metric: "retainedCorrelations", maximum: 64 },
  { metric: "retainedDomainTraces", maximum: 192 }
];

export function checkDiagnosticsBudgets(
  result: DiagnosticsBenchmarkResult
): DiagnosticsBenchmarkFailure[] {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function diagnosticsBudgetCount(): number {
  return BUDGETS.length;
}
