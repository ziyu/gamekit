import {
  createDevToolsCorrelationSource,
  type DevToolsCorrelationSource,
  type DevToolsCorrelationSourceOptions,
  type DevToolsRuntime
} from "@gamekit/devtools";
import { createGasTraceStore, type GasTraceEntry, type GasTraceStore } from "@gamekit/gas";
import {
  createPhysicsTraceStore,
  type PhysicsTraceEntry,
  type PhysicsTraceStore
} from "@gamekit/physics-core";
import { createTcaTraceStore, type TcaTraceEntry, type TcaTraceStore } from "@gamekit/tca";

export type GameplayDevToolsCorrelationOptions = DevToolsCorrelationSourceOptions & {
  devtools: DevToolsRuntime;
  tcaTraceLimit?: number | undefined;
  gasTraceLimit?: number | undefined;
  physicsTraceLimit?: number | undefined;
  summaries?: GameplayDevToolsTraceSummaries | undefined;
};

export type GameplayDevToolsTraceKind = "tca" | "gas" | "physics";

export type GameplayDevToolsTraceSummaryContext = {
  kind: GameplayDevToolsTraceKind;
  source: string;
  traceId: string;
};

export type GameplayDevToolsTraceSummaries = {
  tca?(entry: TcaTraceEntry): unknown;
  gas?(entry: GasTraceEntry): unknown;
  physics?(entry: PhysicsTraceEntry): unknown;
  redact?(payload: unknown, context: GameplayDevToolsTraceSummaryContext): unknown;
};

export type GameplayDevToolsCorrelation = {
  source: DevToolsCorrelationSource;
  tcaTraceStore: TcaTraceStore;
  gasTraceStore: GasTraceStore;
  physicsTraceStore: PhysicsTraceStore;
  dispose(): void;
};

export function createGameplayDevToolsCorrelation(
  options: GameplayDevToolsCorrelationOptions
): GameplayDevToolsCorrelation {
  const source = createDevToolsCorrelationSource(options.devtools, {
    id: options.id,
    label: options.label,
    correlationLimit: options.correlationLimit,
    rootLimitPerCorrelation: options.rootLimitPerCorrelation
  });
  const unregisterSource = options.devtools.registerDataSource(source.dataSource);
  let disposed = false;

  function reportBridgeError(
    kind: GameplayDevToolsTraceKind,
    entry: TcaTraceEntry | GasTraceEntry | PhysicsTraceEntry,
    error: unknown
  ): void {
    options.devtools.pushDiagnostic({
      type: "devtools.gameplay_trace_bridge_failed",
      severity: "warning",
      source: "app-host.gameplay-correlation",
      phase: "trace",
      code: "devtools.gameplay_trace_bridge_failed",
      message: truncateText(error instanceof Error ? error.message : String(error)),
      relatedTraceId: entry.id,
      dataSourceId: source.dataSource.id,
      payload: { kind }
    });
  }

  return {
    source,
    tcaTraceStore: createTcaTraceStore({
      limit: options.tcaTraceLimit,
      onEntry(entry) {
        source.push(mapTcaTrace(entry, options.summaries));
      },
      onEntryError(error, entry) {
        reportBridgeError("tca", entry, error);
      }
    }),
    gasTraceStore: createGasTraceStore({
      ...(options.gasTraceLimit === undefined ? {} : { limit: options.gasTraceLimit }),
      onEntry(entry) {
        source.push(mapGasTrace(entry, options.summaries));
      },
      onEntryError(error, entry) {
        reportBridgeError("gas", entry, error);
      }
    }),
    physicsTraceStore: createPhysicsTraceStore({
      ...(options.physicsTraceLimit === undefined ? {} : { limit: options.physicsTraceLimit }),
      onEntry(entry) {
        source.push(mapPhysicsTrace(entry, options.summaries));
      },
      onEntryError(error, entry) {
        reportBridgeError("physics", entry, error);
      }
    }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unregisterSource();
      source.dispose();
    }
  };
}

function mapTcaTrace(entry: TcaTraceEntry, summaries: GameplayDevToolsTraceSummaries | undefined) {
  const context = createSummaryContext("tca", "gamekit.tca", entry.id);
  return {
    id: entry.id,
    kind: "tca" as const,
    label: `tca.rule.${entry.status}`,
    source: "gamekit.tca",
    status: entry.status,
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
    dataKey: { type: "tca.rule", id: entry.ruleId },
    payload: summarize(
      summaries?.tca
        ? summaries.tca(entry)
        : {
            ruleId: entry.ruleId,
            eventType: entry.eventType,
            timestamp: entry.timestamp,
            conditionCount: entry.conditions.length,
            actionCount: entry.actions.length,
            ...(entry.reason === undefined ? {} : { reason: truncateText(entry.reason) })
          },
      context,
      summaries
    )
  };
}

function mapGasTrace(entry: GasTraceEntry, summaries: GameplayDevToolsTraceSummaries | undefined) {
  const context = createSummaryContext("gas", "gamekit.gas", entry.id);
  return {
    id: entry.id,
    kind: "gas" as const,
    label: `gas.${entry.type}`,
    source: "gamekit.gas",
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
    ...(entry.actorId === undefined ? {} : { actorId: entry.actorId }),
    ...(entry.abilityId === undefined
      ? entry.effectId === undefined
        ? {}
        : { dataKey: { type: "gas.effect", id: entry.effectId } }
      : { dataKey: { type: "gas.ability", id: entry.abilityId } }),
    payload: summarize(
      summaries?.gas
        ? summaries.gas(entry)
        : {
            type: entry.type,
            timestamp: entry.timestamp,
            ...(entry.effectId === undefined ? {} : { effectId: entry.effectId }),
            ...(entry.message === undefined ? {} : { message: truncateText(entry.message) })
          },
      context,
      summaries
    )
  };
}

function mapPhysicsTrace(
  entry: PhysicsTraceEntry,
  summaries: GameplayDevToolsTraceSummaries | undefined
) {
  const context = createSummaryContext("physics", "gamekit.physics", entry.id);
  return {
    id: entry.id,
    kind: "physics" as const,
    label: truncateText(entry.label),
    source: "gamekit.physics",
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
    ...(entry.entityId === undefined ? {} : { entityId: entry.entityId }),
    payload: summarize(
      summaries?.physics
        ? summaries.physics(entry)
        : {
            kind: entry.kind,
            ...(entry.tick === undefined ? {} : { tick: entry.tick }),
            ...(entry.elapsed === undefined ? {} : { elapsed: entry.elapsed }),
            ...(entry.bodyId === undefined ? {} : { bodyId: entry.bodyId }),
            ...(entry.colliderId === undefined ? {} : { colliderId: entry.colliderId })
          },
      context,
      summaries
    )
  };
}

function createSummaryContext(
  kind: GameplayDevToolsTraceKind,
  source: string,
  traceId: string
): GameplayDevToolsTraceSummaryContext {
  return { kind, source, traceId };
}

function summarize(
  payload: unknown,
  context: GameplayDevToolsTraceSummaryContext,
  summaries: GameplayDevToolsTraceSummaries | undefined
): unknown {
  return summaries?.redact ? summaries.redact(payload, context) : payload;
}

function truncateText(value: string, limit = 256): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
