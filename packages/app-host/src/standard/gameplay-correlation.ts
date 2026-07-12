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
};

export type GameplayDevToolsCorrelation = {
  source: DevToolsCorrelationSource;
  tcaTraceStore: TcaTraceStore;
  gasTraceStore: GasTraceStore;
  physicsTraceStore: PhysicsTraceStore;
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

  return {
    source,
    tcaTraceStore: createTcaTraceStore({
      limit: options.tcaTraceLimit,
      onEntry(entry) {
        source.push(mapTcaTrace(entry));
      }
    }),
    gasTraceStore: createGasTraceStore({
      ...(options.gasTraceLimit === undefined ? {} : { limit: options.gasTraceLimit }),
      onEntry(entry) {
        source.push(mapGasTrace(entry));
      }
    }),
    physicsTraceStore: createPhysicsTraceStore({
      ...(options.physicsTraceLimit === undefined ? {} : { limit: options.physicsTraceLimit }),
      onEntry(entry) {
        source.push(mapPhysicsTrace(entry));
      }
    })
  };
}

function mapTcaTrace(entry: TcaTraceEntry) {
  return {
    id: entry.id,
    kind: "tca" as const,
    label: `tca.rule.${entry.status}`,
    source: "gamekit.tca",
    status: entry.status,
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
    dataKey: { type: "tca.rule", id: entry.ruleId },
    payload: {
      ruleId: entry.ruleId,
      eventType: entry.eventType,
      timestamp: entry.timestamp,
      conditionCount: entry.conditions.length,
      actionCount: entry.actions.length,
      ...(entry.reason === undefined ? {} : { reason: entry.reason })
    }
  };
}

function mapGasTrace(entry: GasTraceEntry) {
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
    payload: {
      type: entry.type,
      timestamp: entry.timestamp,
      ...(entry.effectId === undefined ? {} : { effectId: entry.effectId }),
      ...(entry.message === undefined ? {} : { message: entry.message }),
      ...(entry.details === undefined ? {} : { details: entry.details })
    }
  };
}

function mapPhysicsTrace(entry: PhysicsTraceEntry) {
  return {
    id: entry.id,
    kind: "physics" as const,
    label: entry.label,
    source: "gamekit.physics",
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.parentId === undefined ? {} : { parentId: entry.parentId }),
    ...(entry.entityId === undefined ? {} : { entityId: entry.entityId }),
    payload: {
      kind: entry.kind,
      ...(entry.tick === undefined ? {} : { tick: entry.tick }),
      ...(entry.elapsed === undefined ? {} : { elapsed: entry.elapsed }),
      ...(entry.bodyId === undefined ? {} : { bodyId: entry.bodyId }),
      ...(entry.colliderId === undefined ? {} : { colliderId: entry.colliderId }),
      ...(entry.payload === undefined ? {} : { details: entry.payload })
    }
  };
}
