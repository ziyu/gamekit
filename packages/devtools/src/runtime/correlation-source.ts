import type {
  DevToolsCorrelationSource,
  DevToolsCorrelationSourceOptions,
  DevToolsCorrelationSourceSnapshot,
  DevToolsCorrelationSummary,
  DevToolsRuntime
} from "./types";

const DEFAULT_CORRELATION_LIMIT = 64;
const DEFAULT_ROOT_LIMIT = 16;

export function createDevToolsCorrelationSource(
  runtime: DevToolsRuntime,
  options: DevToolsCorrelationSourceOptions = {}
): DevToolsCorrelationSource {
  const id = options.id ?? "gameplay-correlation";
  const label = options.label ?? "Gameplay Correlation";
  const correlationLimit = normalizeLimit(options.correlationLimit, DEFAULT_CORRELATION_LIMIT);
  const rootLimit = normalizeLimit(options.rootLimitPerCorrelation, DEFAULT_ROOT_LIMIT);
  const correlations = new Map<string, DevToolsCorrelationSummary>();
  let totalTraceCount = 0;
  let uncorrelatedTraceCount = 0;
  let disposed = false;

  const source: DevToolsCorrelationSource = {
    dataSource: {
      id,
      label,
      kind: "runtime",
      snapshot() {
        return source.snapshot();
      }
    },
    push(input) {
      if (disposed) {
        return undefined;
      }

      const entry = runtime.pushTrace(input);
      totalTraceCount += 1;
      if (entry.correlationId === undefined) {
        uncorrelatedTraceCount += 1;
        return entry;
      }

      const existing = correlations.get(entry.correlationId);
      const summary = existing ?? createSummary(entry.correlationId, entry.id, entry.time);
      summary.traceCount += 1;
      summary.lastTime = entry.time;
      summary.lastTraceId = entry.id;
      summary.kinds[entry.kind] = (summary.kinds[entry.kind] ?? 0) + 1;
      if (entry.parentId === undefined) {
        summary.rootTraceIds.push(entry.id);
        trim(summary.rootTraceIds, rootLimit);
      }

      correlations.delete(entry.correlationId);
      correlations.set(entry.correlationId, summary);
      trimMap(correlations, correlationLimit);
      return entry;
    },
    snapshot() {
      return snapshot(totalTraceCount, uncorrelatedTraceCount, correlations);
    },
    clear() {
      totalTraceCount = 0;
      uncorrelatedTraceCount = 0;
      correlations.clear();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      source.clear();
    }
  };

  return source;
}

function createSummary(
  correlationId: string,
  traceId: string,
  time: number
): DevToolsCorrelationSummary {
  return {
    correlationId,
    traceCount: 0,
    firstTime: time,
    lastTime: time,
    lastTraceId: traceId,
    rootTraceIds: [],
    kinds: {}
  };
}

function snapshot(
  totalTraceCount: number,
  uncorrelatedTraceCount: number,
  correlations: Map<string, DevToolsCorrelationSummary>
): DevToolsCorrelationSourceSnapshot {
  return {
    totalTraceCount,
    uncorrelatedTraceCount,
    retainedCorrelationCount: correlations.size,
    correlations: [...correlations.values()].map((summary) => ({
      ...summary,
      rootTraceIds: [...summary.rootTraceIds],
      kinds: { ...summary.kinds }
    }))
  };
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, Math.floor(value));
}

function trim<T>(values: T[], limit: number): void {
  if (values.length > limit) {
    values.splice(0, values.length - limit);
  }
}

function trimMap<TKey, TValue>(values: Map<TKey, TValue>, limit: number): void {
  while (values.size > limit) {
    const oldest = values.keys().next().value as TKey | undefined;
    if (oldest === undefined) {
      return;
    }
    values.delete(oldest);
  }
}
