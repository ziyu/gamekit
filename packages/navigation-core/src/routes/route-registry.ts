import type { NavigationBackendAdapter, NavigationBackendPathResult } from "../backend/port";
import {
  cloneNavigationPoint,
  cloneNavigationProjection,
  type NavigationPoint
} from "../contracts/geometry";
import type { NavigationObstacleUpdateResult } from "../contracts/obstacle";
import {
  cloneNavigationDependencies,
  navigationDependencyKey,
  type NavigationObstacleTarget
} from "../contracts/obstacle";
import type { NavigationAgentProfileDefinition } from "../contracts/profile";
import type {
  NavigationPathRequest,
  NavigationRoute,
  NavigationRouteSample
} from "../contracts/routes";
import { samplePathRoute } from "./sample-path";

type RetainedRoute = {
  route: NavigationRoute;
  dependencies: NavigationObstacleTarget[] | undefined;
  backendRouteKey?: string | undefined;
  profile: NavigationAgentProfileDefinition;
};

export type NavigationRouteRegistry = {
  retain(
    routeId: string,
    result: Extract<NavigationBackendPathResult, { status: "complete" }>,
    request: NavigationPathRequest,
    profile: NavigationAgentProfileDefinition
  ): NavigationRoute;
  sample(routeId: string, point: NavigationPoint, revision: number): NavigationRouteSample;
  release(routeId: string): boolean;
  invalidate(result: NavigationObstacleUpdateResult): { stale: number; promoted: number };
  size(): number;
  clear(): void;
};

export function createNavigationRouteRegistry(
  backend: NavigationBackendAdapter,
  maxRoutes: number
): NavigationRouteRegistry {
  const routes = new Map<string, RetainedRoute>();

  return {
    retain(routeId, result, request, profile) {
      const route: NavigationRoute =
        result.route.kind === "path"
          ? {
              kind: "path",
              routeId,
              points: result.route.points.map(cloneNavigationPoint),
              ...(result.route.traversals === undefined
                ? {}
                : {
                    traversals: result.route.traversals.map((traversal) => ({
                      ...traversal,
                      entryPoint: cloneNavigationPoint(traversal.entryPoint),
                      exitPoint: cloneNavigationPoint(traversal.exitPoint)
                    }))
                  }),
              cost: result.cost,
              revision: result.revision,
              startProjection: cloneNavigationProjection(result.startProjection),
              goalProjection: cloneNavigationProjection(result.goalProjection)
            }
          : {
              kind: "field",
              routeId,
              goal: cloneNavigationPoint(request.goal),
              ...(request.goalKey === undefined ? {} : { goalKey: request.goalKey }),
              cost: result.cost,
              revision: result.revision,
              startProjection: cloneNavigationProjection(result.startProjection),
              goalProjection: cloneNavigationProjection(result.goalProjection)
            };
      release(routeId);
      if (result.route.kind === "field") {
        backend.retainRoute?.(result.route.routeKey);
      }
      routes.set(routeId, {
        route,
        dependencies: cloneNavigationDependencies(result.dependencies),
        ...(result.route.kind === "field" ? { backendRouteKey: result.route.routeKey } : {}),
        profile: cloneProfile(profile)
      });
      while (routes.size > maxRoutes) {
        const oldest = routes.keys().next().value as string | undefined;
        if (oldest === undefined) {
          break;
        }
        release(oldest);
      }
      return route;
    },
    sample(routeId, point, revision) {
      const retained = routes.get(routeId);
      if (retained === undefined) {
        return { status: "missing", routeId, revision };
      }
      if (retained.route.revision !== revision) {
        return {
          status: "stale",
          routeId,
          routeRevision: retained.route.revision,
          revision
        };
      }
      routes.delete(routeId);
      routes.set(routeId, retained);
      if (retained.route.kind === "path") {
        return samplePathRoute(retained.route, point);
      }
      if (retained.backendRouteKey === undefined || backend.sampleRoute === undefined) {
        return { status: "missing", routeId, revision };
      }
      const sample = backend.sampleRoute(retained.backendRouteKey, point, retained.profile);
      if (sample.status === "valid") {
        return { ...sample, routeId };
      }
      return sample.status === "stale"
        ? { ...sample, status: "stale", routeId }
        : { status: "missing", routeId, revision: sample.revision };
    },
    release,
    invalidate(result) {
      const invalidateAll =
        result.invalidateAllPaths === true || result.invalidatedPathDependencies === undefined;
      const invalidated = result.invalidatedPathDependencies ?? [];
      let stale = 0;
      let promoted = 0;
      for (const retained of routes.values()) {
        if (invalidateAll || dependenciesIntersect(retained.dependencies, invalidated)) {
          stale += 1;
        } else {
          promoteRoute(retained.route, result.revision);
          promoted += 1;
        }
      }
      return { stale, promoted };
    },
    size: () => routes.size,
    clear() {
      for (const routeId of routes.keys()) {
        release(routeId);
      }
    }
  };

  function release(routeId: string): boolean {
    const retained = routes.get(routeId);
    if (retained === undefined) {
      return false;
    }
    routes.delete(routeId);
    if (retained.backendRouteKey !== undefined) {
      backend.releaseRoute?.(retained.backendRouteKey);
    }
    return true;
  }
}

function dependenciesIntersect(
  dependencies: NavigationObstacleTarget[] | undefined,
  invalidated: NavigationObstacleTarget[]
): boolean {
  if (dependencies === undefined) {
    return true;
  }
  const keys = new Set(invalidated.map(navigationDependencyKey));
  return dependencies.some((dependency) => keys.has(navigationDependencyKey(dependency)));
}

function promoteRoute(route: NavigationRoute, revision: number): void {
  route.revision = revision;
  route.startProjection.revision = revision;
  route.goalProjection.revision = revision;
}

function cloneProfile(profile: NavigationAgentProfileDefinition): NavigationAgentProfileDefinition {
  return {
    ...profile,
    ...(profile.allowedAreas === undefined ? {} : { allowedAreas: [...profile.allowedAreas] }),
    ...(profile.costOverrides === undefined ? {} : { costOverrides: { ...profile.costOverrides } }),
    ...(profile.tags === undefined ? {} : { tags: [...profile.tags] })
  };
}
