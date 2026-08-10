import { createNavigationError } from "../contracts/errors";
import type { CreateNavigationRuntimeOptions } from "./types";

export type NavigationRuntimeConfig = {
  maxRequestsPerTick: number;
  maxBackendPollsPerTick: number;
  maxPendingRequests: number;
  maxPendingPerRequester: number;
  maxRetainedResults: number;
  maxRetainedRoutes: number;
  maxCacheEntries: number;
  maxStaleRetries: number;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
  pointQuantization: number;
};

export function normalizeNavigationRuntimeConfig(
  options: CreateNavigationRuntimeOptions
): NavigationRuntimeConfig {
  const maxRequestsPerTick = positiveInteger(options.maxRequestsPerTick, 32);
  return {
    maxRequestsPerTick,
    maxBackendPollsPerTick: positiveInteger(
      options.maxBackendPollsPerTick,
      Math.max(64, maxRequestsPerTick * 2)
    ),
    maxPendingRequests: positiveInteger(options.maxPendingRequests, 4096),
    maxPendingPerRequester: positiveInteger(options.maxPendingPerRequester, 128),
    maxRetainedResults: positiveInteger(options.maxRetainedResults, 512),
    maxRetainedRoutes: positiveInteger(options.maxRetainedRoutes, 256),
    maxCacheEntries: positiveInteger(options.maxCacheEntries, 512),
    maxStaleRetries: nonNegativeInteger(options.maxStaleRetries, 2),
    cacheTtlMs: nonNegative(options.cacheTtlMs, 5000),
    negativeCacheTtlMs: nonNegative(options.negativeCacheTtlMs, 250),
    pointQuantization: positive(options.pointQuantization, 0.25)
  };
}

export function normalizeNavigationTraceLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation trace limit must be non-negative",
      { value: resolved }
    );
  }
  return resolved;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation limit must be a positive integer",
      { value: resolved }
    );
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation retry limit must be a non-negative integer",
      { value: resolved }
    );
  }
  return resolved;
}

function nonNegative(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation duration must be non-negative",
      { value: resolved }
    );
  }
  return resolved;
}

function positive(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw createNavigationError("navigation.invalid_config", "Navigation value must be positive", {
      value: resolved
    });
  }
  return resolved;
}
