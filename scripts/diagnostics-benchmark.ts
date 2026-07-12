import { performance } from "node:perf_hooks";
import {
  createDevToolsCorrelationSource,
  createDevToolsRuntime,
  type DevToolsTraceKind
} from "../packages/devtools/src";
import {
  checkDiagnosticsBudgets,
  diagnosticsBudgetCount,
  type DiagnosticsBenchmarkResult
} from "./diagnostics-benchmark-budget";

const TRACE_COUNT = 50_000;
const SNAPSHOT_COUNT = 500;
const TRACE_LIMIT = 512;
const CORRELATION_LIMIT = 64;
const KINDS: DevToolsTraceKind[] = ["multiplayer", "physics", "gas", "tca", "world"];

function main(): void {
  let now = 0;
  const runtime = createDevToolsRuntime({ traceLimit: TRACE_LIMIT, clock: () => now++ });
  const correlation = createDevToolsCorrelationSource(runtime, {
    correlationLimit: CORRELATION_LIMIT,
    rootLimitPerCorrelation: 4
  });
  runtime.registerDataSource(correlation.dataSource);

  for (let index = 0; index < 1_000; index += 1) {
    pushTrace(correlation, index);
  }
  runtime.clear({ traces: true });
  correlation.clear();

  const ingestStartedAt = performance.now();
  for (let index = 0; index < TRACE_COUNT; index += 1) {
    pushTrace(correlation, index);
  }
  const ingestMs = performance.now() - ingestStartedAt;

  let checksum = 0;
  const snapshotStartedAt = performance.now();
  for (let index = 0; index < SNAPSHOT_COUNT; index += 1) {
    const snapshot = runtime.snapshot({ includeSourceSnapshots: true });
    checksum += snapshot.traces.length + (snapshot.sourceSnapshots?.length ?? 0);
  }
  const snapshotMs = performance.now() - snapshotStartedAt;
  const sourceSnapshot = correlation.snapshot();
  const runtimeSnapshot = runtime.snapshot();
  const result: DiagnosticsBenchmarkResult = {
    traces: TRACE_COUNT,
    runtimeSnapshots: SNAPSHOT_COUNT,
    microsecondsPerTrace: round((ingestMs * 1_000) / TRACE_COUNT),
    millisecondsPerRuntimeSnapshot: round(snapshotMs / SNAPSHOT_COUNT),
    retainedTraces: runtimeSnapshot.traces.length,
    retainedCorrelations: sourceSnapshot.retainedCorrelationCount
  };
  const checkEnabled = process.argv.includes("--check");
  const failures = checkEnabled ? checkDiagnosticsBudgets(result) : [];

  console.log(
    JSON.stringify(
      {
        benchmark: "devtools-correlation",
        packages: ["@gamekit/devtools"],
        profile: {
          traceLimit: TRACE_LIMIT,
          correlationLimit: CORRELATION_LIMIT,
          checksum
        },
        result,
        ...(checkEnabled
          ? {
              budgetCheck: {
                budgets: diagnosticsBudgetCount(),
                passed: failures.length === 0,
                failures
              }
            }
          : {})
      },
      null,
      2
    )
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function pushTrace(
  correlation: ReturnType<typeof createDevToolsCorrelationSource>,
  index: number
): void {
  const chainIndex = index % 256;
  const correlationId = `combat-${chainIndex}`;
  const step = index % KINDS.length;
  correlation.push({
    id: `trace-${index}`,
    kind: KINDS[step] ?? "custom",
    label: `benchmark.step.${step}`,
    source: "benchmark",
    correlationId,
    ...(step === 0 ? {} : { parentId: `trace-${Math.max(0, index - 1)}` })
  });
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

main();
