import { createAiError } from "../contracts/errors";
import type { AiBlackboardValueLimits } from "../memory";
import { AI_TRACE_KINDS, type AiTraceKind, type AiTraceRetentionOptions } from "../observability";
import type { AiGoalScoreTraceDetail } from "../observability/trace";
import type { CreateAiRuntimeOptions } from "./options";

type ResolvedAiTraceRetentionOptions = Omit<AiTraceRetentionOptions, "limit"> & {
  limit: number;
};

export type AiRuntimeLimits = {
  maxSensorSamplesPerTick: number;
  maxDecisionsPerTick: number;
  maxPathRequestsPerTick: number;
  failureBackoffMs: number;
  defaultBlackboardLimit: number;
  blackboardValueLimits: AiBlackboardValueLimits;
  traceRetention: ResolvedAiTraceRetentionOptions;
  traceProduction: {
    enabled: boolean;
    maxEntriesPerUpdate: number;
    goalScoreDetail: AiGoalScoreTraceDetail;
    emitDropSummary: boolean;
  };
};

export function resolveAiRuntimeLimits(options: CreateAiRuntimeOptions): AiRuntimeLimits {
  return {
    maxSensorSamplesPerTick: resolvePositiveAiInteger(options.maxSensorSamplesPerTick, 256),
    maxDecisionsPerTick: resolvePositiveAiInteger(options.maxDecisionsPerTick, 128),
    maxPathRequestsPerTick: resolveNonNegativeAiInteger(options.maxPathRequestsPerTick, 64),
    failureBackoffMs: resolveNonNegativeAiNumber(options.failureBackoffMs, 100),
    defaultBlackboardLimit: resolvePositiveAiInteger(options.defaultBlackboardLimit, 32),
    blackboardValueLimits: {
      maxDepth: resolvePositiveAiInteger(options.maxBlackboardValueDepth, 8),
      maxNodes: resolvePositiveAiInteger(options.maxBlackboardValueNodes, 256),
      maxStringLength: resolvePositiveAiInteger(options.maxBlackboardStringLength, 4_096)
    },
    traceRetention: resolveAiTraceRetention(options),
    traceProduction: resolveAiTraceProduction(options)
  };
}

function resolveAiTraceProduction(
  options: CreateAiRuntimeOptions
): AiRuntimeLimits["traceProduction"] {
  const configured = options.traceProduction;
  const retentionLimit = options.traceRetention?.limit ?? options.traceLimit ?? 512;
  const enabled = retentionLimit > 0 || options.onTrace !== undefined;
  const goalScoreDetail = configured?.goalScoreDetail ?? "summary";
  if (
    !(goalScoreDetail === "summary" || goalScoreDetail === "winner" || goalScoreDetail === "all")
  ) {
    throw createAiError("ai.invalid_config", "AI goal score trace detail is not supported", {
      goalScoreDetail
    });
  }
  return {
    enabled,
    maxEntriesPerUpdate: resolveNonNegativeAiInteger(
      configured?.maxEntriesPerUpdate,
      enabled ? 512 : 0
    ),
    goalScoreDetail,
    emitDropSummary: configured?.emitDropSummary ?? true
  };
}

function resolveAiTraceRetention(options: CreateAiRuntimeOptions): ResolvedAiTraceRetentionOptions {
  const configured = options.traceRetention;
  const limit = resolveNonNegativeAiInteger(configured?.limit ?? options.traceLimit, 512);
  const kinds = configured?.kinds === undefined ? undefined : [...new Set(configured.kinds)];
  for (const kind of kinds ?? []) {
    if (!AI_TRACE_KINDS.includes(kind)) {
      throw createAiError("ai.invalid_config", "AI trace kind is not supported", { kind });
    }
  }
  const kindLimits: Partial<Record<AiTraceKind, number>> = {};
  for (const kind of AI_TRACE_KINDS) {
    const kindLimit = configured?.kindLimits?.[kind];
    if (kindLimit !== undefined) {
      kindLimits[kind] = resolveNonNegativeAiInteger(kindLimit, limit);
    }
  }
  return {
    limit,
    ...(kinds === undefined ? {} : { kinds }),
    ...(Object.keys(kindLimits).length === 0 ? {} : { kindLimits })
  };
}

export function resolvePositiveAiInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createAiError("ai.invalid_config", "AI limit must be a positive integer", {
      value: resolved
    });
  }
  return resolved;
}

function resolveNonNegativeAiInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createAiError("ai.invalid_config", "AI limit must be a non-negative integer", {
      value: resolved
    });
  }
  return resolved;
}

function resolveNonNegativeAiNumber(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw createAiError("ai.invalid_config", "AI duration must be non-negative", {
      value: resolved
    });
  }
  return resolved;
}
