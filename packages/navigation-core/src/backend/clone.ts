import { cloneNavigationPoint, cloneNavigationProjection } from "../contracts/geometry";
import { cloneNavigationDependencies } from "../contracts/obstacle";
import type {
  NavigationBackendPathResult,
  NavigationBackendPathStatus,
  NavigationBackendRouteSample
} from "./port";

export function cloneBackendPathResult(
  result: NavigationBackendPathResult
): NavigationBackendPathResult {
  if (result.status === "failed") {
    return {
      ...result,
      ...(result.dependencies === undefined
        ? {}
        : { dependencies: cloneNavigationDependencies(result.dependencies) })
    };
  }
  return {
    ...result,
    route:
      result.route.kind === "path"
        ? {
            kind: "path",
            points: result.route.points.map(cloneNavigationPoint),
            ...(result.route.traversals === undefined
              ? {}
              : {
                  traversals: result.route.traversals.map((traversal) => ({
                    ...traversal,
                    entryPoint: cloneNavigationPoint(traversal.entryPoint),
                    exitPoint: cloneNavigationPoint(traversal.exitPoint)
                  }))
                })
          }
        : { ...result.route },
    startProjection: cloneNavigationProjection(result.startProjection),
    goalProjection: cloneNavigationProjection(result.goalProjection),
    ...(result.dependencies === undefined
      ? {}
      : { dependencies: cloneNavigationDependencies(result.dependencies) })
  };
}

export function cloneBackendPathStatus(
  status: NavigationBackendPathStatus
): NavigationBackendPathStatus {
  return status.status === "complete" || status.status === "failed"
    ? cloneBackendPathResult(status)
    : { ...status };
}

export function cloneBackendRouteSample(
  sample: NavigationBackendRouteSample
): NavigationBackendRouteSample {
  return sample.status === "valid"
    ? {
        ...sample,
        point: cloneNavigationPoint(sample.point),
        nextPoint: cloneNavigationPoint(sample.nextPoint),
        direction: cloneNavigationPoint(sample.direction),
        ...(sample.traversal === undefined
          ? {}
          : {
              traversal: {
                ...sample.traversal,
                entryPoint: cloneNavigationPoint(sample.traversal.entryPoint),
                exitPoint: cloneNavigationPoint(sample.traversal.exitPoint)
              }
            })
      }
    : { ...sample };
}
