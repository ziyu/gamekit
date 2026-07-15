export type ColyseusRoomRuntimeBenchmarkResult = {
  nanosecondsPerTick: number;
  microsecondsPerIngress: number;
  microsecondsPerPeerChurn: number;
  millisecondsPerLifecycle: number;
  retainedPeersAfterDispose: number;
  activeTimersAfterDispose: number;
};

export type ColyseusRoomRuntimeBenchmarkFailure = {
  metric: keyof ColyseusRoomRuntimeBenchmarkResult;
  maximum: number;
  actual: number;
};

const BUDGETS: Array<{
  metric: keyof ColyseusRoomRuntimeBenchmarkResult;
  maximum: number;
}> = [
  { metric: "nanosecondsPerTick", maximum: 1_000 },
  { metric: "microsecondsPerIngress", maximum: 15 },
  { metric: "microsecondsPerPeerChurn", maximum: 30 },
  { metric: "millisecondsPerLifecycle", maximum: 0.2 },
  { metric: "retainedPeersAfterDispose", maximum: 0 },
  { metric: "activeTimersAfterDispose", maximum: 0 }
];

export function checkColyseusRoomRuntimeBudgets(
  result: ColyseusRoomRuntimeBenchmarkResult
): ColyseusRoomRuntimeBenchmarkFailure[] {
  return BUDGETS.flatMap((budget) =>
    result[budget.metric] > budget.maximum
      ? [{ metric: budget.metric, maximum: budget.maximum, actual: result[budget.metric] }]
      : []
  );
}

export function colyseusRoomRuntimeBudgetCount(): number {
  return BUDGETS.length;
}
