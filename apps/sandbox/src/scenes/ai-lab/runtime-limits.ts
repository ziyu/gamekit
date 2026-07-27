export const AI_LAB_AI_RUNTIME_LIMITS = {
  maxDecisionsPerTick: 192,
  maxSensorSamplesPerTick: 192,
  maxPathRequestsPerTick: 256
} as const;

export const AI_LAB_NAVIGATION_RUNTIME_LIMITS = {
  maxRequestsPerTick: 96,
  maxBackendPollsPerTick: 192,
  maxPendingRequests: 4_096,
  maxPendingPerRequester: 8,
  maxRetainedResults: 8_192,
  maxRetainedRoutes: 4_096,
  maxCacheEntries: 512
} as const;
