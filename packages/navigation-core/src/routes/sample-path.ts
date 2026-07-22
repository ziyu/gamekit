import { cloneNavigationPoint } from "../contracts/geometry";
import type { NavigationPoint } from "../contracts/geometry";
import type {
  NavigationPathRoute,
  NavigationRouteSample,
  NavigationRouteTraversal
} from "../contracts/routes";

const PATH_SAMPLE_DISTANCE_EPSILON = 1e-9;

export function samplePathRoute(
  route: NavigationPathRoute,
  point: NavigationPoint
): NavigationRouteSample {
  if (route.points.length === 0) {
    return { status: "missing", routeId: route.routeId, revision: route.revision };
  }
  if (route.points.length === 1) {
    const only = route.points[0] as NavigationPoint;
    return {
      status: "valid",
      routeId: route.routeId,
      revision: route.revision,
      point: cloneNavigationPoint(only),
      nextPoint: cloneNavigationPoint(only),
      direction: { x: 0, y: 0, ...(only.z === undefined ? {} : { z: 0 }) },
      distanceToRoute: distance(point, only),
      remainingDistance: 0
    };
  }

  let bestIndex = 0;
  let bestPoint = route.points[0] as NavigationPoint;
  let bestNextPoint = route.points[1] as NavigationPoint;
  let bestTraversal: NavigationRouteTraversal | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  const traversals = new Map(
    (route.traversals ?? []).map((traversal) => [traversal.fromPointIndex, traversal])
  );
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index] as NavigationPoint;
    const end = route.points[index + 1] as NavigationPoint;
    const traversal = traversals.get(index);
    if (traversal !== undefined) {
      considerCandidate(
        index,
        traversal.entryPoint,
        traversal.entryPoint,
        cloneTraversal(traversal)
      );
      continue;
    }
    const projected = projectToSegment(point, start, end);
    const upcomingTraversal = traversals.get(index + 1);
    considerCandidate(
      index,
      projected,
      end,
      upcomingTraversal === undefined ? undefined : cloneTraversal(upcomingTraversal)
    );
  }
  const vector = subtract(bestNextPoint, bestPoint);
  const length = magnitude(vector);
  let remainingDistance = distance(bestPoint, bestNextPoint);
  if (traversals.has(bestIndex)) {
    const traversal = traversals.get(bestIndex)!;
    remainingDistance += distance(traversal.entryPoint, traversal.exitPoint);
  }
  for (let index = bestIndex + 1; index < route.points.length - 1; index += 1) {
    const traversal = traversals.get(index);
    remainingDistance +=
      traversal === undefined
        ? distance(
            route.points[index] as NavigationPoint,
            route.points[index + 1] as NavigationPoint
          )
        : distance(traversal.entryPoint, traversal.exitPoint);
  }
  return {
    status: "valid",
    routeId: route.routeId,
    revision: route.revision,
    point: cloneNavigationPoint(bestPoint),
    nextPoint: cloneNavigationPoint(bestNextPoint),
    direction:
      length === 0
        ? { x: 0, y: 0, ...(vector.z === undefined ? {} : { z: 0 }) }
        : {
            x: vector.x / length,
            y: vector.y / length,
            ...(vector.z === undefined ? {} : { z: (vector.z ?? 0) / length })
          },
    distanceToRoute: bestDistance,
    remainingDistance,
    ...(bestTraversal === undefined ? {} : { traversal: bestTraversal })
  };

  function considerCandidate(
    index: number,
    projected: NavigationPoint,
    nextPoint: NavigationPoint,
    traversal: NavigationRouteTraversal | undefined
  ): void {
    const candidateDistance = distance(point, projected);
    if (candidateDistance <= bestDistance + PATH_SAMPLE_DISTANCE_EPSILON) {
      bestDistance = candidateDistance;
      bestIndex = index;
      bestPoint = projected;
      bestNextPoint = nextPoint;
      bestTraversal = traversal;
    }
  }
}

function cloneTraversal(
  traversal: Pick<NavigationRouteTraversal, "kind" | "portalId" | "entryPoint" | "exitPoint">
): NavigationRouteTraversal {
  return {
    kind: traversal.kind,
    portalId: traversal.portalId,
    entryPoint: cloneNavigationPoint(traversal.entryPoint),
    exitPoint: cloneNavigationPoint(traversal.exitPoint)
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
