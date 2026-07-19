import { NAVIGATION_AGENT_PROFILE_TYPE } from "../data/navigation-data-types";
import { createNavigationError } from "./errors";
import { createNavigationTraceStore } from "./trace-store";
import type {
  CreateNavigationRuntimeOptions,
  NavigationAgentProfileDefinition,
  NavigationBackendPathResult,
  NavigationObstacleTarget,
  NavigationObstacleUpdateResult,
  NavigationPath,
  NavigationPathRequest,
  NavigationPathResult,
  NavigationPoint,
  NavigationProjection,
  NavigationRouteSample,
  NavigationRuntime
} from "./types";

type PendingRequest = {
  request: NavigationPathRequest & { id: string };
  signature: string;
  cancelled: boolean;
};

type CachedBackendResult = {
  result: NavigationBackendPathResult;
  revision: number;
  expiresAt: number;
  negative: boolean;
};

type RetainedRoute = {
  path: NavigationPath;
  dependencies: NavigationObstacleTarget[] | undefined;
};

type RuntimeConfig = {
  maxRequestsPerTick: number;
  maxPendingRequests: number;
  maxPendingPerRequester: number;
  maxRetainedResults: number;
  maxRetainedRoutes: number;
  maxCacheEntries: number;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
  pointQuantization: number;
};

export function createNavigationRuntime(
  options: CreateNavigationRuntimeOptions
): NavigationRuntime {
  const id = options.id ?? "navigation";
  const config = normalizeConfig(options);
  const profiles = new Map(
    (options.profiles ?? []).map((profile) => [profile.id, cloneProfile(profile)] as const)
  );
  const trace = createNavigationTraceStore({
    limit: normalizeLimit(options.traceLimit, 256),
    onEntry: options.onTrace,
    onEntryError: options.onTraceError
  });
  const results = new Map<string, NavigationPathResult>();
  const requests = new Map<string, PendingRequest>();
  const signatures = new Map<string, string>();
  const queues = new Map<string, PendingRequest[]>();
  const requesterOrder: string[] = [];
  const requesterPending = new Map<string, number>();
  const terminalOrder: string[] = [];
  const routes = new Map<string, RetainedRoute>();
  const routeOrder: string[] = [];
  const cache = new Map<string, CachedBackendResult>();
  let requesterCursor = 0;
  let nextRequestSequence = 0;
  let pendingCount = 0;
  let elapsed = 0;
  let disposed = false;

  trace.push({
    kind: "lifecycle",
    label: "navigation.created",
    timestamp: elapsed,
    revision: options.backend.revision(),
    payload: { backendId: options.backend.id }
  });

  const runtime: NavigationRuntime = {
    projectPoint(point, profileId) {
      if (disposed || !validPoint(point)) {
        return undefined;
      }
      const profile = resolveProfile(profileId);
      if (profile === undefined) {
        return undefined;
      }
      const projection = options.backend.projectPoint(point, profile);
      return projection === undefined ? undefined : cloneProjection(projection);
    },
    requestPath(request) {
      const requestedId = request.id ?? `${id}.request.${nextRequestSequence}`;
      nextRequestSequence += 1;
      const signature = requestSignature(request, config.pointQuantization);
      const existingSignature = signatures.get(requestedId);
      if (existingSignature !== undefined) {
        if (existingSignature === signature) {
          return requestedId;
        }
        return retainRejection(
          uniqueRequestId(`${requestedId}.conflict`),
          request.requesterId,
          "duplicate-request-conflict",
          `Navigation request id ${requestedId} was reused with different input`
        );
      }
      signatures.set(requestedId, signature);

      if (disposed) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "runtime-disposed",
          "Navigation runtime is disposed"
        );
      }
      if (!validRequest(request)) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "invalid-request",
          "Navigation path request is invalid"
        );
      }
      if (pendingCount >= config.maxPendingRequests) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "queue-full",
          "Navigation request queue is full"
        );
      }
      if ((requesterPending.get(request.requesterId) ?? 0) >= config.maxPendingPerRequester) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "requester-queue-full",
          "Navigation requester queue is full"
        );
      }

      const pending: PendingRequest = {
        request: { ...cloneRequest(request), id: requestedId },
        signature,
        cancelled: false
      };
      requests.set(requestedId, pending);
      results.set(requestedId, {
        status: "pending",
        requestId: requestedId,
        requesterId: request.requesterId,
        revision: options.backend.revision()
      });
      enqueue(pending);
      trace.push({
        kind: "request",
        label: "navigation.requested",
        timestamp: elapsed,
        revision: options.backend.revision(),
        requestId: requestedId,
        requesterId: request.requesterId,
        payload: { profileId: request.profileId, goalKey: request.goalKey ?? null }
      });
      return requestedId;
    },
    poll(requestId) {
      const result = results.get(requestId);
      return result === undefined ? { status: "missing", requestId } : clonePathResult(result);
    },
    cancel(requestId) {
      const pending = requests.get(requestId);
      if (
        pending === undefined ||
        pending.cancelled ||
        results.get(requestId)?.status !== "pending"
      ) {
        return;
      }
      pending.cancelled = true;
      pendingCount = Math.max(0, pendingCount - 1);
      decrementRequester(pending.request.requesterId);
      retainTerminal({
        status: "cancelled",
        requestId,
        requesterId: pending.request.requesterId,
        revision: options.backend.revision()
      });
      trace.push({
        kind: "result",
        label: "navigation.cancelled",
        timestamp: elapsed,
        revision: options.backend.revision(),
        requestId,
        requesterId: pending.request.requesterId
      });
    },
    sampleRoute(routeId, point) {
      const retained = routes.get(routeId);
      const revision = options.backend.revision();
      if (retained === undefined) {
        return { status: "missing", routeId, revision };
      }
      if (retained.path.revision !== revision) {
        return {
          status: "stale",
          routeId,
          routeRevision: retained.path.revision,
          revision
        };
      }
      return samplePath(retained.path, point);
    },
    revision() {
      return options.backend.revision();
    },
    snapshot() {
      let negativeCacheEntries = 0;
      for (const entry of cache.values()) {
        if (entry.negative) {
          negativeCacheEntries += 1;
        }
      }
      return {
        id,
        revision: options.backend.revision(),
        disposed,
        profiles: [...profiles.keys()].sort(),
        pendingRequests: pendingCount,
        retainedResults: results.size,
        retainedRoutes: routes.size,
        cacheEntries: cache.size,
        negativeCacheEntries,
        traceEntries: trace.size(),
        backend: options.backend.snapshot()
      };
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      elapsed = Number.isFinite(elapsedMs)
        ? Math.max(elapsed, elapsedMs)
        : elapsed + Math.max(0, deltaMs);
      pruneExpiredCache();
      let processed = 0;
      while (processed < config.maxRequestsPerTick) {
        const pending = dequeue();
        if (pending === undefined) {
          break;
        }
        if (pending.cancelled) {
          continue;
        }
        pendingCount = Math.max(0, pendingCount - 1);
        decrementRequester(pending.request.requesterId);
        processRequest(pending);
        processed += 1;
      }
      if (pendingCount > 0) {
        trace.push({
          kind: "budget",
          label: "navigation.requests_deferred",
          timestamp: elapsed,
          revision: options.backend.revision(),
          payload: { pending: pendingCount, processed, budget: config.maxRequestsPerTick }
        });
      }
    },
    updateObstacle(update) {
      if (disposed || options.backend.updateObstacle === undefined) {
        return { status: "unsupported", revision: options.backend.revision() };
      }
      const before = options.backend.revision();
      const result = options.backend.updateObstacle(update);
      let invalidatedCachedPaths = 0;
      let promotedCachedPaths = 0;
      let staleRoutes = 0;
      let promotedRoutes = 0;
      if (result.status === "changed") {
        const invalidation = invalidatePaths(result);
        invalidatedCachedPaths = invalidation.invalidatedCachedPaths;
        promotedCachedPaths = invalidation.promotedCachedPaths;
        staleRoutes = invalidation.staleRoutes;
        promotedRoutes = invalidation.promotedRoutes;
      }
      trace.push({
        kind: "obstacle",
        label: `navigation.obstacle_${result.status}`,
        timestamp: elapsed,
        revision: result.revision,
        payload: {
          obstacleId: update.id,
          targetKind: update.target.kind,
          targetId: update.target.id,
          previousRevision: before,
          invalidatedRouteFields: result.invalidatedRouteFields ?? 0,
          invalidateAllPaths: result.invalidateAllPaths === true,
          invalidatedPathDependencies: result.invalidatedPathDependencies?.length ?? 0,
          invalidatedCachedPaths,
          promotedCachedPaths,
          staleRoutes,
          promotedRoutes
        }
      });
      return cloneObstacleUpdateResult(result);
    },
    traces() {
      return trace.snapshot();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      options.backend.dispose();
      results.clear();
      requests.clear();
      signatures.clear();
      queues.clear();
      requesterOrder.length = 0;
      requesterPending.clear();
      terminalOrder.length = 0;
      routes.clear();
      routeOrder.length = 0;
      cache.clear();
      pendingCount = 0;
      trace.clear();
    }
  };

  return runtime;

  function resolveProfile(profileId: string): NavigationAgentProfileDefinition | undefined {
    const local = profiles.get(profileId);
    if (local !== undefined) {
      return local;
    }
    if (
      options.dataRegistry?.hasType(NAVIGATION_AGENT_PROFILE_TYPE) &&
      options.dataRegistry.has(NAVIGATION_AGENT_PROFILE_TYPE, profileId)
    ) {
      const profile = cloneProfile(
        options.dataRegistry.getValue<NavigationAgentProfileDefinition>(
          NAVIGATION_AGENT_PROFILE_TYPE,
          profileId
        )
      );
      profiles.set(profile.id, profile);
      return profile;
    }
    return undefined;
  }

  function uniqueRequestId(prefix: string): string {
    let candidate = `${prefix}.${nextRequestSequence}`;
    nextRequestSequence += 1;
    while (signatures.has(candidate)) {
      candidate = `${prefix}.${nextRequestSequence}`;
      nextRequestSequence += 1;
    }
    return candidate;
  }

  function retainRejection(
    requestId: string,
    requesterId: string,
    reason: Extract<NavigationPathResult, { status: "rejected" }>["reason"],
    message: string
  ): string {
    if (!signatures.has(requestId)) {
      signatures.set(requestId, `rejected:${reason}`);
    }
    retainTerminal({
      status: "rejected",
      requestId,
      requesterId,
      reason,
      revision: options.backend.revision(),
      message
    });
    trace.push({
      kind: "result",
      label: "navigation.rejected",
      timestamp: elapsed,
      revision: options.backend.revision(),
      requestId,
      requesterId,
      payload: { reason }
    });
    return requestId;
  }

  function enqueue(pending: PendingRequest): void {
    let queue = queues.get(pending.request.requesterId);
    if (queue === undefined) {
      queue = [];
      queues.set(pending.request.requesterId, queue);
      requesterOrder.push(pending.request.requesterId);
    }
    queue.push(pending);
    pendingCount += 1;
    requesterPending.set(
      pending.request.requesterId,
      (requesterPending.get(pending.request.requesterId) ?? 0) + 1
    );
  }

  function dequeue(): PendingRequest | undefined {
    if (requesterOrder.length === 0) {
      return undefined;
    }
    let inspected = 0;
    while (requesterOrder.length > 0 && inspected <= requesterOrder.length) {
      requesterCursor %= requesterOrder.length;
      const requesterId = requesterOrder[requesterCursor];
      if (requesterId === undefined) {
        return undefined;
      }
      const queue = queues.get(requesterId);
      if (queue === undefined || queue.length === 0) {
        queues.delete(requesterId);
        requesterOrder.splice(requesterCursor, 1);
        continue;
      }
      const pending = queue.shift();
      requesterCursor = (requesterCursor + 1) % requesterOrder.length;
      inspected += 1;
      if (queue.length === 0) {
        queues.delete(requesterId);
        const index = requesterOrder.indexOf(requesterId);
        if (index >= 0) {
          requesterOrder.splice(index, 1);
          if (requesterOrder.length > 0) {
            requesterCursor %= requesterOrder.length;
          } else {
            requesterCursor = 0;
          }
        }
      }
      if (pending !== undefined) {
        return pending;
      }
    }
    return undefined;
  }

  function decrementRequester(requesterId: string): void {
    const next = Math.max(0, (requesterPending.get(requesterId) ?? 0) - 1);
    if (next === 0) {
      requesterPending.delete(requesterId);
    } else {
      requesterPending.set(requesterId, next);
    }
  }

  function processRequest(pending: PendingRequest): void {
    const profile = resolveProfile(pending.request.profileId);
    if (profile === undefined) {
      retainTerminal({
        status: "failed",
        requestId: pending.request.id,
        requesterId: pending.request.requesterId,
        reason: "profile-missing",
        revision: options.backend.revision(),
        cache: "miss"
      });
      return;
    }
    const key = cacheKey(pending.request, profile, config.pointQuantization);
    const cached = cache.get(key);
    if (
      cached !== undefined &&
      cached.revision === options.backend.revision() &&
      cached.expiresAt >= elapsed
    ) {
      cache.delete(key);
      cache.set(key, cached);
      trace.push({
        kind: "cache",
        label: cached.negative ? "navigation.negative_cache_hit" : "navigation.cache_hit",
        timestamp: elapsed,
        revision: options.backend.revision(),
        requestId: pending.request.id,
        requesterId: pending.request.requesterId
      });
      completeFromBackend(pending, cached.result, "hit");
      return;
    }

    let backendResult: NavigationBackendPathResult;
    try {
      backendResult = options.backend.findPath({
        requestId: pending.request.id,
        profile,
        start: pending.request.start,
        goal: pending.request.goal,
        ...(pending.request.goalKey === undefined ? {} : { goalKey: pending.request.goalKey }),
        ...(pending.request.maxCost === undefined ? {} : { maxCost: pending.request.maxCost })
      });
    } catch (error) {
      retainTerminal({
        status: "failed",
        requestId: pending.request.id,
        requesterId: pending.request.requesterId,
        reason: "backend-error",
        revision: options.backend.revision(),
        cache: "miss",
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    retainCache(key, backendResult);
    completeFromBackend(pending, backendResult, "miss");
  }

  function completeFromBackend(
    pending: PendingRequest,
    backendResult: NavigationBackendPathResult,
    cacheStatus: "hit" | "miss"
  ): void {
    if (backendResult.status === "failed") {
      retainTerminal({
        status: "failed",
        requestId: pending.request.id,
        requesterId: pending.request.requesterId,
        reason: backendResult.reason,
        revision: options.backend.revision(),
        cache: cacheStatus,
        ...(backendResult.message === undefined ? {} : { message: backendResult.message })
      });
      traceResult(pending, "navigation.path_failed", {
        reason: backendResult.reason,
        cache: cacheStatus
      });
      return;
    }
    if (pending.request.maxCost !== undefined && backendResult.cost > pending.request.maxCost) {
      retainTerminal({
        status: "failed",
        requestId: pending.request.id,
        requesterId: pending.request.requesterId,
        reason: "cost-limit",
        revision: options.backend.revision(),
        cache: cacheStatus
      });
      traceResult(pending, "navigation.path_failed", { reason: "cost-limit", cache: cacheStatus });
      return;
    }
    const routeId = `${pending.request.id}.route`;
    const path: NavigationPath = {
      routeId,
      points: backendResult.points.map(clonePoint),
      cost: backendResult.cost,
      revision: options.backend.revision(),
      startProjection: cloneProjection(backendResult.startProjection),
      goalProjection: cloneProjection(backendResult.goalProjection)
    };
    retainRoute(path, backendResult.dependencies);
    retainTerminal({
      status: "complete",
      requestId: pending.request.id,
      requesterId: pending.request.requesterId,
      path,
      cache: cacheStatus
    });
    traceResult(pending, "navigation.path_completed", {
      cache: cacheStatus,
      points: path.points.length,
      cost: path.cost
    });
  }

  function traceResult(
    pending: PendingRequest,
    label: string,
    payload: Record<string, unknown>
  ): void {
    trace.push({
      kind: "result",
      label,
      timestamp: elapsed,
      revision: options.backend.revision(),
      requestId: pending.request.id,
      requesterId: pending.request.requesterId,
      payload
    });
  }

  function retainTerminal(
    result: Exclude<NavigationPathResult, { status: "pending" | "missing" }>
  ): void {
    results.set(result.requestId, result);
    terminalOrder.push(result.requestId);
    while (terminalOrder.length > config.maxRetainedResults) {
      const oldest = terminalOrder.shift();
      if (oldest !== undefined && results.get(oldest)?.status !== "pending") {
        results.delete(oldest);
        requests.delete(oldest);
        signatures.delete(oldest);
      }
    }
  }

  function retainRoute(
    path: NavigationPath,
    dependencies: NavigationObstacleTarget[] | undefined
  ): void {
    routes.set(path.routeId, { path, dependencies: cloneDependencies(dependencies) });
    routeOrder.push(path.routeId);
    while (routeOrder.length > config.maxRetainedRoutes) {
      const oldest = routeOrder.shift();
      if (oldest !== undefined) {
        routes.delete(oldest);
      }
    }
  }

  function retainCache(key: string, result: NavigationBackendPathResult): void {
    const negative = result.status === "failed";
    cache.set(key, {
      result: cloneBackendResult(result),
      revision: options.backend.revision(),
      expiresAt: elapsed + (negative ? config.negativeCacheTtlMs : config.cacheTtlMs),
      negative
    });
    while (cache.size > config.maxCacheEntries) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
  }

  function pruneExpiredCache(): void {
    const revision = options.backend.revision();
    for (const [key, entry] of cache) {
      if (entry.expiresAt < elapsed || entry.revision !== revision) {
        cache.delete(key);
      }
    }
  }

  function invalidatePaths(result: NavigationObstacleUpdateResult): {
    invalidatedCachedPaths: number;
    promotedCachedPaths: number;
    staleRoutes: number;
    promotedRoutes: number;
  } {
    const invalidateAll =
      result.invalidateAllPaths === true || result.invalidatedPathDependencies === undefined;
    const invalidatedDependencies = result.invalidatedPathDependencies ?? [];
    let invalidatedCachedPaths = 0;
    let promotedCachedPaths = 0;
    for (const [key, entry] of cache) {
      const dependencies = entry.result.dependencies;
      if (invalidateAll || intersectsDependencies(dependencies, invalidatedDependencies)) {
        cache.delete(key);
        invalidatedCachedPaths += 1;
      } else {
        promoteBackendResult(entry.result, result.revision);
        entry.revision = result.revision;
        promotedCachedPaths += 1;
      }
    }

    let staleRoutes = 0;
    let promotedRoutes = 0;
    for (const retained of routes.values()) {
      if (invalidateAll || intersectsDependencies(retained.dependencies, invalidatedDependencies)) {
        staleRoutes += 1;
      } else {
        promotePath(retained.path, result.revision);
        promotedRoutes += 1;
      }
    }
    return { invalidatedCachedPaths, promotedCachedPaths, staleRoutes, promotedRoutes };
  }
}

function normalizeConfig(options: CreateNavigationRuntimeOptions): RuntimeConfig {
  return {
    maxRequestsPerTick: positiveInteger(options.maxRequestsPerTick, 32),
    maxPendingRequests: positiveInteger(options.maxPendingRequests, 4096),
    maxPendingPerRequester: positiveInteger(options.maxPendingPerRequester, 128),
    maxRetainedResults: positiveInteger(options.maxRetainedResults, 512),
    maxRetainedRoutes: positiveInteger(options.maxRetainedRoutes, 256),
    maxCacheEntries: positiveInteger(options.maxCacheEntries, 512),
    cacheTtlMs: nonNegative(options.cacheTtlMs, 5000),
    negativeCacheTtlMs: nonNegative(options.negativeCacheTtlMs, 250),
    pointQuantization: positive(options.pointQuantization, 0.25)
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation limit must be a positive integer",
      {
        value: resolved
      }
    );
  }
  return resolved;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw createNavigationError(
      "navigation.invalid_config",
      "Navigation trace limit must be non-negative",
      {
        value: resolved
      }
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
      {
        value: resolved
      }
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

function validRequest(request: NavigationPathRequest): boolean {
  return (
    request.requesterId.trim().length > 0 &&
    request.profileId.trim().length > 0 &&
    validPoint(request.start) &&
    validPoint(request.goal) &&
    (request.maxCost === undefined || (Number.isFinite(request.maxCost) && request.maxCost >= 0))
  );
}

function validPoint(point: NavigationPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (point.z === undefined || Number.isFinite(point.z))
  );
}

function requestSignature(request: NavigationPathRequest, quantization: number): string {
  return [
    request.requesterId,
    request.profileId,
    pointKey(request.start, quantization),
    pointKey(request.goal, quantization),
    request.goalKey ?? "",
    request.maxCost ?? ""
  ].join("|");
}

function cacheKey(
  request: NavigationPathRequest,
  profile: NavigationAgentProfileDefinition,
  quantization: number
): string {
  return [
    profileKey(profile),
    pointKey(request.start, quantization),
    pointKey(request.goal, quantization),
    request.goalKey ?? "",
    request.maxCost ?? ""
  ].join("|");
}

function profileKey(profile: NavigationAgentProfileDefinition): string {
  const areas = [...(profile.allowedAreas ?? [])].sort().join(",");
  const costs = Object.entries(profile.costOverrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([area, cost]) => `${area}:${cost}`)
    .join(",");
  return `${profile.id}:${profile.radius}:${profile.height ?? ""}:${areas}:${costs}`;
}

function pointKey(point: NavigationPoint, quantization: number): string {
  const quantize = (value: number | undefined) =>
    value === undefined ? "" : Math.round(value / quantization);
  return `${quantize(point.x)},${quantize(point.y)},${quantize(point.z)}`;
}

function samplePath(path: NavigationPath, point: NavigationPoint): NavigationRouteSample {
  if (path.points.length === 1) {
    const only = path.points[0] as NavigationPoint;
    return {
      status: "valid",
      routeId: path.routeId,
      revision: path.revision,
      point: clonePoint(only),
      nextPoint: clonePoint(only),
      direction: { x: 0, y: 0, ...(only.z === undefined ? {} : { z: 0 }) },
      distanceToRoute: distance(point, only),
      remainingDistance: 0
    };
  }

  let bestIndex = 0;
  let bestPoint = path.points[0] as NavigationPoint;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index] as NavigationPoint;
    const end = path.points[index + 1] as NavigationPoint;
    const projected = projectToSegment(point, start, end);
    const candidateDistance = distance(point, projected);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestIndex = index;
      bestPoint = projected;
    }
  }
  const nextPoint = path.points[Math.min(bestIndex + 1, path.points.length - 1)] as NavigationPoint;
  const vector = subtract(nextPoint, bestPoint);
  const length = magnitude(vector);
  let remainingDistance = distance(bestPoint, nextPoint);
  for (let index = bestIndex + 1; index < path.points.length - 1; index += 1) {
    remainingDistance += distance(
      path.points[index] as NavigationPoint,
      path.points[index + 1] as NavigationPoint
    );
  }
  return {
    status: "valid",
    routeId: path.routeId,
    revision: path.revision,
    point: clonePoint(bestPoint),
    nextPoint: clonePoint(nextPoint),
    direction:
      length === 0
        ? { x: 0, y: 0, ...(vector.z === undefined ? {} : { z: 0 }) }
        : {
            x: vector.x / length,
            y: vector.y / length,
            ...(vector.z === undefined ? {} : { z: vector.z / length })
          },
    distanceToRoute: bestDistance,
    remainingDistance
  };
}

function projectToSegment(
  point: NavigationPoint,
  start: NavigationPoint,
  end: NavigationPoint
): NavigationPoint {
  const segment = subtract(end, start);
  const relative = subtract(point, start);
  const lengthSquared = dot(segment, segment);
  const amount =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, dot(relative, segment) / lengthSquared));
  const z =
    start.z === undefined && end.z === undefined
      ? undefined
      : (start.z ?? 0) + ((end.z ?? 0) - (start.z ?? 0)) * amount;
  return {
    x: start.x + segment.x * amount,
    y: start.y + segment.y * amount,
    ...(z === undefined ? {} : { z })
  };
}

function subtract(left: NavigationPoint, right: NavigationPoint): NavigationPoint {
  const hasZ = left.z !== undefined || right.z !== undefined;
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    ...(hasZ ? { z: (left.z ?? 0) - (right.z ?? 0) } : {})
  };
}

function dot(left: NavigationPoint, right: NavigationPoint): number {
  return left.x * right.x + left.y * right.y + (left.z ?? 0) * (right.z ?? 0);
}

function magnitude(point: NavigationPoint): number {
  return Math.sqrt(dot(point, point));
}

function distance(left: NavigationPoint, right: NavigationPoint): number {
  return magnitude(subtract(left, right));
}

function cloneRequest(request: NavigationPathRequest): NavigationPathRequest {
  return {
    ...request,
    start: clonePoint(request.start),
    goal: clonePoint(request.goal),
    ...(request.metadata === undefined ? {} : { metadata: { ...request.metadata } })
  };
}

function clonePoint(point: NavigationPoint): NavigationPoint {
  return { x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }) };
}

function cloneProjection(projection: NavigationProjection): NavigationProjection {
  return { ...projection, point: clonePoint(projection.point) };
}

function cloneProfile(profile: NavigationAgentProfileDefinition): NavigationAgentProfileDefinition {
  return {
    ...profile,
    ...(profile.allowedAreas === undefined ? {} : { allowedAreas: [...profile.allowedAreas] }),
    ...(profile.costOverrides === undefined ? {} : { costOverrides: { ...profile.costOverrides } }),
    ...(profile.tags === undefined ? {} : { tags: [...profile.tags] })
  };
}

function cloneBackendResult(result: NavigationBackendPathResult): NavigationBackendPathResult {
  return result.status === "failed"
    ? {
        ...result,
        ...(result.dependencies === undefined
          ? {}
          : { dependencies: cloneDependencies(result.dependencies) })
      }
    : {
        status: "complete",
        points: result.points.map(clonePoint),
        cost: result.cost,
        startProjection: cloneProjection(result.startProjection),
        goalProjection: cloneProjection(result.goalProjection),
        ...(result.dependencies === undefined
          ? {}
          : { dependencies: cloneDependencies(result.dependencies) })
      };
}

function cloneDependencies(
  dependencies: NavigationObstacleTarget[] | undefined
): NavigationObstacleTarget[] | undefined {
  return dependencies?.map((dependency) => ({ ...dependency }));
}

function intersectsDependencies(
  dependencies: NavigationObstacleTarget[] | undefined,
  invalidated: NavigationObstacleTarget[]
): boolean {
  if (dependencies === undefined) {
    return true;
  }
  const invalidatedKeys = new Set(
    invalidated.map((dependency) => `${dependency.kind}:${dependency.id}`)
  );
  return dependencies.some((dependency) =>
    invalidatedKeys.has(`${dependency.kind}:${dependency.id}`)
  );
}

function promoteBackendResult(result: NavigationBackendPathResult, revision: number): void {
  if (result.status === "complete") {
    result.startProjection.revision = revision;
    result.goalProjection.revision = revision;
  }
}

function promotePath(path: NavigationPath, revision: number): void {
  path.revision = revision;
  path.startProjection.revision = revision;
  path.goalProjection.revision = revision;
}

function cloneObstacleUpdateResult(
  result: NavigationObstacleUpdateResult
): NavigationObstacleUpdateResult {
  return {
    ...result,
    ...(result.invalidatedPathDependencies === undefined
      ? {}
      : { invalidatedPathDependencies: cloneDependencies(result.invalidatedPathDependencies) })
  };
}

function clonePathResult(result: NavigationPathResult): NavigationPathResult {
  if (result.status !== "complete") {
    return { ...result };
  }
  return {
    ...result,
    path: {
      ...result.path,
      points: result.path.points.map(clonePoint),
      startProjection: cloneProjection(result.path.startProjection),
      goalProjection: cloneProjection(result.path.goalProjection)
    }
  };
}
