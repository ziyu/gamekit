import { createAnimatorError } from "../contracts/errors";

export type AnimatorRuntimeLimits = {
  maxControllers: number;
  maxQueuedOneShots: number;
  markerHistoryLimit: number;
  maxMarkerEventsPerControllerUpdate: number;
  traceLimit: number;
};

export function resolveAnimatorRuntimeLimits(options: {
  maxControllers?: number | undefined;
  maxQueuedOneShotsPerController?: number | undefined;
  markerHistoryLimit?: number | undefined;
  maxMarkerEventsPerControllerUpdate?: number | undefined;
  traceLimit?: number | undefined;
}): AnimatorRuntimeLimits {
  return {
    maxControllers: positiveInteger(options.maxControllers, 2_048),
    maxQueuedOneShots: nonNegativeInteger(options.maxQueuedOneShotsPerController, 4),
    markerHistoryLimit: nonNegativeInteger(options.markerHistoryLimit, 512),
    maxMarkerEventsPerControllerUpdate: nonNegativeInteger(
      options.maxMarkerEventsPerControllerUpdate,
      64
    ),
    traceLimit: nonNegativeInteger(options.traceLimit, 512)
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createAnimatorError("animator.invalid_config", "Animator limit must be positive", {
      value: resolved
    });
  }
  return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createAnimatorError("animator.invalid_config", "Animator limit must be non-negative", {
      value: resolved
    });
  }
  return resolved;
}
