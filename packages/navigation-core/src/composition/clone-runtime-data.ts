import { cloneNavigationPoint, cloneNavigationProjection } from "../contracts/geometry";
import {
  cloneNavigationDependencies,
  type NavigationObstacleUpdateResult
} from "../contracts/obstacle";
import type { NavigationRequestResult, NavigationRoute } from "../contracts/routes";

export function cloneNavigationObstacleResult(
  result: NavigationObstacleUpdateResult
): NavigationObstacleUpdateResult {
  return {
    ...result,
    ...(result.invalidatedPathDependencies === undefined
      ? {}
      : {
          invalidatedPathDependencies: cloneNavigationDependencies(
            result.invalidatedPathDependencies
          )
        })
  };
}

export function cloneNavigationRequestResult(
  result: NavigationRequestResult
): NavigationRequestResult {
  if (result.status !== "complete") {
    return { ...result };
  }
  return { ...result, route: cloneRoute(result.route) };
}

function cloneRoute(route: NavigationRoute): NavigationRoute {
  const base = {
    ...route,
    startProjection: cloneNavigationProjection(route.startProjection),
    goalProjection: cloneNavigationProjection(route.goalProjection)
  };
  return route.kind === "path"
    ? {
        ...base,
        kind: "path",
        points: route.points.map(cloneNavigationPoint),
        ...(route.traversals === undefined
          ? {}
          : {
              traversals: route.traversals.map((traversal) => ({
                ...traversal,
                entryPoint: cloneNavigationPoint(traversal.entryPoint),
                exitPoint: cloneNavigationPoint(traversal.exitPoint)
              }))
            })
      }
    : { ...base, kind: "field", goal: cloneNavigationPoint(route.goal) };
}
