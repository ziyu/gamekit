import type {
  NavigationBackendAdapter,
  NavigationBackendPathResult,
  NavigationBackendPathStatus
} from "../backend/port";
import { cloneNavigationProjection, isNavigationPoint } from "../contracts/geometry";
import {
  cloneNavigationProfile,
  type NavigationAgentProfileDefinition
} from "../contracts/profile";
import type { NavigationRequestResult } from "../contracts/routes";
import type { NavigationRuntime } from "../contracts/facade";
import { NAVIGATION_AGENT_PROFILE_TYPE } from "../layout/navigation-data-types";
import { resolveNavigationBackend } from "../layout/resolve-navigation-backend";
import { createNavigationTraceStore } from "../observability/trace-store";
import { createFairRequestQueue } from "../requests/fair-request-queue";
import { createNavigationPathCache } from "../requests/path-cache";
import {
  createNavigationRequestStore,
  type NavigationRequestRecord
} from "../requests/request-store";
import {
  cloneNavigationRequest,
  navigationCacheKey,
  navigationRequestSignature,
  validNavigationRequest
} from "../requests/request-key";
import { createNavigationRouteRegistry } from "../routes/route-registry";
import { cloneNavigationObstacleResult, cloneNavigationRequestResult } from "./clone-runtime-data";
import { normalizeNavigationRuntimeConfig, normalizeNavigationTraceLimit } from "./runtime-config";
import type { CreateNavigationRuntimeOptions } from "./types";

export function createNavigationRuntime(
  options: CreateNavigationRuntimeOptions
): NavigationRuntime {
  const id = options.id ?? "navigation";
  const config = normalizeNavigationRuntimeConfig(options);
  const backend = resolveBackend(options);
  const disposeBackend = options.disposeBackend !== false;
  const profiles = new Map(
    (options.profiles ?? []).map(
      (profile) => [profile.id, cloneNavigationProfile(profile)] as const
    )
  );
  const trace = createNavigationTraceStore({
    limit: normalizeNavigationTraceLimit(options.traceLimit, 256),
    onEntry: options.onTrace,
    onEntryError: options.onTraceError
  });
  const queue = createFairRequestQueue<NavigationRequestRecord>();
  const cache = createNavigationPathCache(config.maxCacheEntries);
  const routes = createNavigationRouteRegistry(backend, config.maxRetainedRoutes);
  const requestStore = createNavigationRequestStore(config.maxRetainedResults);
  let elapsed = 0;
  let disposed = false;

  pushTrace("lifecycle", "navigation.created", {
    backendId: backend.id,
    capabilities: { ...backend.capabilities }
  });

  const runtime: NavigationRuntime = {
    projectPoint(point, profileId) {
      if (disposed || !isNavigationPoint(point)) {
        return undefined;
      }
      const profile = resolveProfile(profileId);
      if (profile === undefined) {
        return undefined;
      }
      const projection = backend.projectPoint(point, profile);
      return projection === undefined ? undefined : cloneNavigationProjection(projection);
    },
    requestPath(request) {
      const requestedId = requestStore.allocateRequestId(request.id, `${id}.request`);
      const signature = navigationRequestSignature(request, config.pointQuantization);
      const existingSignature = requestStore.signature(requestedId);
      if (existingSignature !== undefined) {
        if (existingSignature === signature) {
          return requestedId;
        }
        return retainRejection(
          requestStore.allocateUniqueId(`${requestedId}.conflict`),
          request.requesterId,
          "duplicate-request-conflict",
          `Navigation request id ${requestedId} was reused with different input`
        );
      }
      requestStore.reserveSignature(requestedId, signature);

      if (disposed) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "runtime-disposed",
          "Navigation runtime is disposed"
        );
      }
      if (!validNavigationRequest(request)) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "invalid-request",
          "Navigation path request is invalid"
        );
      }
      if (requestStore.activeCount() >= config.maxPendingRequests) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "queue-full",
          "Navigation request queue is full"
        );
      }
      if (requestStore.activeForRequester(request.requesterId) >= config.maxPendingPerRequester) {
        return retainRejection(
          requestedId,
          request.requesterId,
          "requester-queue-full",
          "Navigation requester queue is full"
        );
      }

      const record: NavigationRequestRecord = {
        request: {
          ...cloneNavigationRequest(request),
          id: requestedId,
          routeKind: request.routeKind ?? "path"
        },
        state: "queued",
        staleRetries: 0
      };
      requestStore.addQueued(record);
      queue.enqueue(record);
      requestStore.setResult(requestedId, pendingResult(record, "queued", backend.revision()));
      pushTrace(
        "request",
        "navigation.requested",
        {
          profileId: request.profileId,
          goalKey: request.goalKey ?? null,
          routeKind: request.routeKind ?? "path"
        },
        record
      );
      return requestedId;
    },
    poll(requestId) {
      const result = requestStore.result(requestId);
      return result === undefined
        ? { status: "missing", requestId }
        : cloneNavigationRequestResult(result);
    },
    cancel(requestId) {
      const record = requestStore.record(requestId);
      if (record === undefined || record.state === "terminal") {
        return;
      }
      if (record.state === "submitted") {
        try {
          backend.cancelPath(requestId);
          backend.releasePath(requestId);
        } catch (error) {
          pushTrace(
            "backend",
            "navigation.backend_cancel_failed",
            { message: errorMessage(error) },
            record
          );
        }
      }
      requestStore.finishActive(record);
      retainTerminal({
        status: "cancelled",
        requestId,
        requesterId: record.request.requesterId,
        revision: backend.revision()
      });
      pushTrace("result", "navigation.cancelled", undefined, record);
    },
    sampleRoute(routeId, point) {
      return routes.sample(routeId, point, backend.revision());
    },
    releaseRoute(routeId) {
      if (routes.release(routeId)) {
        pushTrace("route", "navigation.route_released", { routeId });
      }
    },
    revision: () => backend.revision(),
    snapshot() {
      const requestSnapshot = requestStore.snapshot();
      return {
        id,
        revision: backend.revision(),
        disposed,
        profiles: [...profiles.keys()].sort(),
        pendingRequests: requestSnapshot.active,
        queuedRequests: requestSnapshot.queued,
        submittedRequests: requestSnapshot.submitted,
        retainedResults: requestSnapshot.retainedResults,
        retainedRoutes: routes.size(),
        cacheEntries: cache.size(),
        negativeCacheEntries: cache.negativeSize(),
        traceEntries: trace.size(),
        backend: backend.snapshot()
      };
    },
    update(deltaMs, elapsedMs) {
      if (disposed) {
        return;
      }
      elapsed = Number.isFinite(elapsedMs)
        ? Math.max(elapsed, elapsedMs)
        : elapsed + Math.max(0, deltaMs);
      try {
        backend.update?.(Math.max(0, deltaMs), elapsed);
      } catch (error) {
        pushTrace("backend", "navigation.backend_update_failed", {
          message: errorMessage(error)
        });
      }
      cache.prune(backend.revision(), elapsed);

      let polls = 0;
      for (const record of requestStore.submittedRecords()) {
        if (polls >= config.maxBackendPollsPerTick) {
          break;
        }
        pollSubmitted(record);
        polls += 1;
      }

      let submitted = 0;
      while (submitted < config.maxRequestsPerTick) {
        const record = queue.dequeue();
        if (record === undefined) {
          break;
        }
        if (record.state !== "queued") {
          continue;
        }
        processQueued(record);
        submitted += 1;
        if (requestStore.isSubmitted(record.request.id) && polls < config.maxBackendPollsPerTick) {
          pollSubmitted(record);
          polls += 1;
        }
      }
      const requestSnapshot = requestStore.snapshot();
      if (requestSnapshot.active > 0) {
        pushTrace("budget", "navigation.requests_deferred", {
          queued: requestSnapshot.queued,
          submitted: requestSnapshot.submitted,
          submissionsThisTick: submitted,
          pollsThisTick: polls,
          submitBudget: config.maxRequestsPerTick,
          pollBudget: config.maxBackendPollsPerTick
        });
      }
    },
    updateObstacle(update) {
      if (disposed || backend.updateObstacle === undefined) {
        return { status: "unsupported", revision: backend.revision() };
      }
      const before = backend.revision();
      const result = backend.updateObstacle(update);
      let cacheChange = { invalidated: 0, promoted: 0 };
      let routeChange = { stale: 0, promoted: 0 };
      if (result.status === "changed") {
        cacheChange = cache.invalidate(result);
        routeChange = routes.invalidate(result);
      }
      pushTrace("obstacle", `navigation.obstacle_${result.status}`, {
        obstacleId: update.id,
        targetKind: update.target.kind,
        targetId: update.target.id,
        previousRevision: before,
        invalidatedRouteFields: result.invalidatedRouteFields ?? 0,
        invalidateAllPaths: result.invalidateAllPaths === true,
        invalidatedPathDependencies: result.invalidatedPathDependencies?.length ?? 0,
        invalidatedCachedPaths: cacheChange.invalidated,
        promotedCachedPaths: cacheChange.promoted,
        staleRoutes: routeChange.stale,
        promotedRoutes: routeChange.promoted
      });
      return cloneNavigationObstacleResult(result);
    },
    traces: () => trace.snapshot(),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const record of requestStore.submittedRecords()) {
        try {
          backend.cancelPath(record.request.id);
          backend.releasePath(record.request.id);
        } catch {
          // Backend dispose remains the final cleanup boundary.
        }
      }
      routes.clear();
      cache.clear();
      queue.clear();
      requestStore.clear();
      if (disposeBackend) {
        backend.dispose();
      }
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
      const profile = cloneNavigationProfile(
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

  function processQueued(record: NavigationRequestRecord): void {
    const profile = resolveProfile(record.request.profileId);
    if (profile === undefined) {
      fail(record, "profile-missing", "miss");
      return;
    }
    const key = navigationCacheKey(record.request, profile, config.pointQuantization);
    const cached = cache.get(key, backend.revision(), elapsed);
    if (cached !== undefined) {
      pushTrace(
        "cache",
        cached.status === "failed" ? "navigation.negative_cache_hit" : "navigation.cache_hit",
        undefined,
        record
      );
      completeFromBackend(record, profile, cached, "hit");
      return;
    }

    transitionToSubmitted(record);
    try {
      backend.submitPath({
        requestId: record.request.id,
        profile,
        start: record.request.start,
        goal: record.request.goal,
        routeKind: record.request.routeKind ?? "path",
        ...(record.request.goalKey === undefined ? {} : { goalKey: record.request.goalKey }),
        ...(record.request.maxCost === undefined ? {} : { maxCost: record.request.maxCost })
      });
      pushTrace("backend", "navigation.backend_submitted", undefined, record);
    } catch (error) {
      fail(record, "backend-error", "miss", errorMessage(error));
    }
  }

  function pollSubmitted(record: NavigationRequestRecord): void {
    if (record.state !== "submitted") {
      return;
    }
    let status: NavigationBackendPathStatus;
    try {
      status = backend.pollPath(record.request.id);
    } catch (error) {
      fail(record, "backend-error", "miss", errorMessage(error));
      return;
    }
    if (status.status === "pending") {
      return;
    }
    if (status.status === "missing") {
      fail(record, "backend-error", "miss", "Navigation Backend lost the submitted request");
      return;
    }
    try {
      backend.releasePath(record.request.id);
    } catch (error) {
      pushTrace(
        "backend",
        "navigation.backend_release_failed",
        { message: errorMessage(error) },
        record
      );
    }
    if (status.revision !== backend.revision()) {
      if (record.staleRetries < config.maxStaleRetries) {
        record.staleRetries += 1;
        transitionToQueued(record);
        requestStore.setResult(
          record.request.id,
          pendingResult(record, "queued", backend.revision())
        );
        queue.enqueue(record);
        pushTrace(
          "backend",
          "navigation.backend_stale_result_retried",
          { resultRevision: status.revision, retry: record.staleRetries },
          record
        );
      } else {
        fail(
          record,
          "stale-result",
          "miss",
          `Navigation Backend result remained stale after ${config.maxStaleRetries} retries`
        );
      }
      return;
    }
    const profile = resolveProfile(record.request.profileId);
    if (profile === undefined) {
      fail(record, "profile-missing", "miss");
      return;
    }
    const key = navigationCacheKey(record.request, profile, config.pointQuantization);
    if (status.status === "failed" || status.route.kind === "path") {
      cache.set(key, status, elapsed, config.cacheTtlMs, config.negativeCacheTtlMs);
    }
    completeFromBackend(record, profile, status, "miss");
  }

  function completeFromBackend(
    record: NavigationRequestRecord,
    profile: NavigationAgentProfileDefinition,
    backendResult: NavigationBackendPathResult,
    cacheStatus: "hit" | "miss"
  ): void {
    if (backendResult.status === "failed") {
      fail(
        record,
        backendResult.reason,
        cacheStatus,
        backendResult.message,
        backendResult.revision
      );
      return;
    }
    if (record.request.maxCost !== undefined && backendResult.cost > record.request.maxCost) {
      fail(record, "cost-limit", cacheStatus, undefined, backendResult.revision);
      return;
    }
    const routeId = `${record.request.id}.route`;
    const route = routes.retain(routeId, backendResult, record.request, profile);
    requestStore.finishActive(record);
    retainTerminal({
      status: "complete",
      requestId: record.request.id,
      requesterId: record.request.requesterId,
      route,
      cache: cacheStatus
    });
    pushTrace(
      "result",
      "navigation.path_completed",
      {
        cache: cacheStatus,
        routeKind: route.kind,
        points: route.kind === "path" ? route.points.length : 0,
        cost: route.cost
      },
      record
    );
  }

  function fail(
    record: NavigationRequestRecord,
    reason: Extract<NavigationRequestResult, { status: "failed" }>["reason"],
    cacheStatus: "hit" | "miss",
    message?: string,
    revision = backend.revision()
  ): void {
    requestStore.finishActive(record);
    retainTerminal({
      status: "failed",
      requestId: record.request.id,
      requesterId: record.request.requesterId,
      reason,
      revision,
      cache: cacheStatus,
      ...(message === undefined ? {} : { message })
    });
    pushTrace(
      "result",
      "navigation.path_failed",
      { reason, cache: cacheStatus, ...(message === undefined ? {} : { message }) },
      record
    );
  }

  function transitionToSubmitted(record: NavigationRequestRecord): void {
    requestStore.transitionToSubmitted(record);
    requestStore.setResult(
      record.request.id,
      pendingResult(record, "submitted", backend.revision())
    );
  }

  function transitionToQueued(record: NavigationRequestRecord): void {
    requestStore.transitionToQueued(record);
  }

  function retainRejection(
    requestId: string,
    requesterId: string,
    reason: Extract<NavigationRequestResult, { status: "rejected" }>["reason"],
    message: string
  ): string {
    if (requestStore.signature(requestId) === undefined) {
      requestStore.reserveSignature(requestId, `rejected:${reason}`);
    }
    retainTerminal({
      status: "rejected",
      requestId,
      requesterId,
      reason,
      revision: backend.revision(),
      message
    });
    pushTrace("result", "navigation.rejected", { reason }, undefined, requestId, requesterId);
    return requestId;
  }

  function retainTerminal(
    result: Exclude<NavigationRequestResult, { status: "pending" | "missing" }>
  ): void {
    requestStore.retainTerminal(result);
  }

  function pushTrace(
    kind: Parameters<typeof trace.push>[0]["kind"],
    label: string,
    payload?: Record<string, unknown>,
    record?: NavigationRequestRecord,
    requestId = record?.request.id,
    requesterId = record?.request.requesterId
  ): void {
    trace.push({
      kind,
      label,
      timestamp: elapsed,
      revision: backend.revision(),
      ...(requestId === undefined ? {} : { requestId }),
      ...(requesterId === undefined ? {} : { requesterId }),
      ...(payload === undefined ? {} : { payload })
    });
  }
}

function resolveBackend(options: CreateNavigationRuntimeOptions): NavigationBackendAdapter {
  if (options.backend !== undefined) {
    return options.backend;
  }
  return resolveNavigationBackend({
    layout: options.layout,
    dataRegistry: options.dataRegistry,
    backendFactories: options.backendFactories
  }).backend;
}

function pendingResult(
  record: NavigationRequestRecord,
  phase: "queued" | "submitted",
  revision: number
): Extract<NavigationRequestResult, { status: "pending" }> {
  return {
    status: "pending",
    phase,
    requestId: record.request.id,
    requesterId: record.request.requesterId,
    revision
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
