import { GameError } from "@gamekit/core";
import type {
  DevToolsClearOptions,
  DevToolsCommandDefinition,
  DevToolsDataSource,
  DevToolsDiagnosticEvent,
  DevToolsPanelDefinition,
  DevToolsProfilerSample,
  DevToolsProfilerSummary,
  DevToolsRuntime,
  DevToolsRuntimeOptions,
  DevToolsSnapshot,
  DevToolsSnapshotContext,
  DevToolsSourceSnapshot,
  DevToolsTraceEntry
} from "./types";

const DEFAULT_TRACE_LIMIT = 300;
const DEFAULT_DIAGNOSTIC_LIMIT = 100;
const DEFAULT_PROFILER_BUDGET_MS = 4;

type DataSourceRegistration = {
  source: DevToolsDataSource;
  commandIds: string[];
  unsubscribe?: (() => void) | undefined;
};

type ProfilerAggregate = {
  systemId: string;
  moduleId?: string | undefined;
  count: number;
  totalDurationMs: number;
  lastDurationMs: number;
  maxDurationMs: number;
  lastTick: number;
  tags: Set<string>;
};

export function createDevToolsRuntime(options: DevToolsRuntimeOptions = {}): DevToolsRuntime {
  const clock = options.clock ?? Date.now;
  const traceLimit = options.traceLimit ?? DEFAULT_TRACE_LIMIT;
  const diagnosticLimit = options.diagnosticLimit ?? DEFAULT_DIAGNOSTIC_LIMIT;
  const profilerBudgetMs = options.profilerBudgetMs ?? DEFAULT_PROFILER_BUDGET_MS;
  const traces: DevToolsTraceEntry[] = [];
  const diagnostics: DevToolsDiagnosticEvent[] = [];
  const dataSources = new Map<string, DataSourceRegistration>();
  const panels = new Map<string, DevToolsPanelDefinition>();
  const commands = new Map<string, DevToolsCommandDefinition>();
  const profiler = new Map<string, ProfilerAggregate>();
  let traceSequence = 0;
  let diagnosticSequence = 0;

  const runtime: DevToolsRuntime = {
    registerDataSource(source) {
      if (dataSources.has(source.id)) {
        throw duplicateError("data_source", source.id);
      }
      const registration: DataSourceRegistration = { source, commandIds: [] };
      if (source.subscribe) {
        registration.unsubscribe = source.subscribe(() => {
          runtime.pushTrace({
            kind: "runtime",
            label: "devtools.source_changed",
            source: source.id,
            severity: "debug"
          });
        });
      }
      dataSources.set(source.id, registration);

      for (const action of source.actions ?? []) {
        if (!commands.has(action.id)) {
          commands.set(action.id, action);
          registration.commandIds.push(action.id);
        }
      }

      return () => {
        registration.unsubscribe?.();
        for (const commandId of registration.commandIds) {
          commands.delete(commandId);
        }
        dataSources.delete(source.id);
      };
    },
    registerPanel(panel) {
      if (panels.has(panel.id)) {
        throw duplicateError("panel", panel.id);
      }
      panels.set(panel.id, panel);
      return () => {
        panels.delete(panel.id);
      };
    },
    registerCommand(command) {
      if (commands.has(command.id)) {
        throw duplicateError("command", command.id);
      }
      commands.set(command.id, command);
      return () => {
        commands.delete(command.id);
      };
    },
    pushTrace(input) {
      const entry: DevToolsTraceEntry = {
        ...input,
        id: input.id ?? `devtools-trace-${traceSequence}`,
        time: input.time ?? clock()
      };
      traceSequence += 1;
      traces.push(entry);
      trim(traces, traceLimit);
      return entry;
    },
    pushDiagnostic(input) {
      const event: DevToolsDiagnosticEvent = {
        ...input,
        id: input.id ?? `devtools-diagnostic-${diagnosticSequence}`,
        time: input.time ?? clock()
      };
      diagnosticSequence += 1;
      diagnostics.push(event);
      trim(diagnostics, diagnosticLimit);
      return event;
    },
    markProfilerSample(sample) {
      const key = profilerKey(sample);
      const aggregate = profiler.get(key) ?? createProfilerAggregate(sample);
      aggregate.count += 1;
      aggregate.totalDurationMs += sample.durationMs;
      aggregate.lastDurationMs = sample.durationMs;
      aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, sample.durationMs);
      aggregate.lastTick = sample.tick;
      for (const tag of sample.tags ?? []) {
        aggregate.tags.add(tag);
      }
      profiler.set(key, aggregate);
    },
    async executeCommand(commandId, input) {
      const command = commands.get(commandId);
      if (!command) {
        throw new GameError("devtools.command_missing", `Missing DevTools command: ${commandId}`);
      }
      try {
        runtime.pushTrace({
          kind: "runtime",
          label: command.id,
          source: "devtools.command",
          status: "started",
          severity: "info"
        });
        await command.execute({ runtime, now: clock() }, input);
        runtime.pushTrace({
          kind: "runtime",
          label: command.id,
          source: "devtools.command",
          status: "completed",
          severity: "info"
        });
      } catch (error) {
        runtime.pushDiagnostic({
          type: "devtools.command_failed",
          severity: "error",
          source: "devtools.command",
          phase: "command",
          code: "devtools.command_failed",
          commandId,
          message: readErrorMessage(error),
          payload: {}
        });
        throw error;
      }
    },
    snapshot(snapshotOptions = {}) {
      const sourceKinds = new Set(snapshotOptions.sourceKinds);
      const traceKinds = new Set(snapshotOptions.traceKinds);
      const includeSourceSnapshots = snapshotOptions.includeSourceSnapshots === true;
      const snapshotContext: DevToolsSnapshotContext = { now: clock() };
      const sourceList = [...dataSources.values()]
        .map((entry) => entry.source)
        .filter((source) => sourceKinds.size === 0 || sourceKinds.has(source.kind));
      const sourceSnapshots = includeSourceSnapshots
        ? sourceList.map((source) => readSourceSnapshot(source, snapshotContext, runtime))
        : undefined;

      const snapshot: DevToolsSnapshot = {
        traces: traces.filter((entry) => traceKinds.size === 0 || traceKinds.has(entry.kind)),
        diagnostics: [...diagnostics],
        dataSources: sourceList.map((source) => ({
          id: source.id,
          label: source.label,
          kind: source.kind
        })),
        panels: [...panels.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
        commands: [...commands.values()].map((command) => ({
          id: command.id,
          label: command.label,
          scope: command.scope,
          destructive: command.destructive === true
        })),
        profiler: profilerSummary([...profiler.values()], profilerBudgetMs)
      };

      if (sourceSnapshots) {
        snapshot.sourceSnapshots = sourceSnapshots;
      }

      return snapshot;
    },
    clear(clearOptions: DevToolsClearOptions = {}) {
      const clearAll =
        clearOptions.traces !== true &&
        clearOptions.diagnostics !== true &&
        clearOptions.profiler !== true;
      if (clearAll || clearOptions.traces === true) {
        traces.length = 0;
      }
      if (clearAll || clearOptions.diagnostics === true) {
        diagnostics.length = 0;
      }
      if (clearAll || clearOptions.profiler === true) {
        profiler.clear();
      }
    },
    dispose() {
      for (const registration of dataSources.values()) {
        registration.unsubscribe?.();
      }
      dataSources.clear();
      panels.clear();
      commands.clear();
      traces.length = 0;
      diagnostics.length = 0;
      profiler.clear();
    }
  };

  return runtime;
}

function readSourceSnapshot(
  source: DevToolsDataSource,
  ctx: DevToolsSnapshotContext,
  runtime: DevToolsRuntime
): DevToolsSourceSnapshot {
  try {
    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      snapshot: source.snapshot(ctx)
    };
  } catch (error) {
    runtime.pushDiagnostic({
      type: "devtools.data_source_snapshot_failed",
      severity: "error",
      source: "devtools",
      phase: "snapshot",
      code: "devtools.data_source_snapshot_failed",
      dataSourceId: source.id,
      message: readErrorMessage(error),
      payload: {}
    });
    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      error: {
        code: "devtools.data_source_snapshot_failed",
        message: readErrorMessage(error)
      }
    };
  }
}

function createProfilerAggregate(sample: DevToolsProfilerSample): ProfilerAggregate {
  return {
    systemId: sample.systemId,
    moduleId: sample.moduleId,
    count: 0,
    totalDurationMs: 0,
    lastDurationMs: 0,
    maxDurationMs: 0,
    lastTick: sample.tick,
    tags: new Set()
  };
}

function profilerSummary(
  aggregates: ProfilerAggregate[],
  budgetMs: number
): DevToolsProfilerSummary[] {
  return aggregates
    .map((aggregate) => ({
      systemId: aggregate.systemId,
      ...(aggregate.moduleId === undefined ? {} : { moduleId: aggregate.moduleId }),
      count: aggregate.count,
      lastDurationMs: aggregate.lastDurationMs,
      averageDurationMs: aggregate.totalDurationMs / aggregate.count,
      maxDurationMs: aggregate.maxDurationMs,
      lastTick: aggregate.lastTick,
      tags: [...aggregate.tags],
      overBudget: aggregate.maxDurationMs > budgetMs
    }))
    .sort((left, right) => right.maxDurationMs - left.maxDurationMs);
}

function profilerKey(sample: DevToolsProfilerSample): string {
  return `${sample.moduleId ?? "module"}:${sample.systemId}`;
}

function trim<T>(values: T[], limit: number): void {
  while (values.length > limit) {
    values.shift();
  }
}

function duplicateError(kind: string, id: string): GameError {
  return new GameError("devtools.duplicate_id", `Duplicate DevTools ${kind}: ${id}`);
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
