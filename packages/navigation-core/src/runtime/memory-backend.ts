import type {
  NavigationBackendAdapter,
  NavigationBackendPathRequest,
  NavigationBackendPathResult,
  NavigationPoint,
  NavigationProjection
} from "./types";

export type CreateMemoryNavigationBackendOptions = {
  id?: string | undefined;
  bounds?:
    | {
        min: NavigationPoint;
        max: NavigationPoint;
      }
    | undefined;
  blockedGoalKeys?: string[] | undefined;
};

export function createMemoryNavigationBackend(
  options: CreateMemoryNavigationBackendOptions = {}
): NavigationBackendAdapter {
  const id = options.id ?? "navigation.memory";
  const blockedGoalKeys = new Set(options.blockedGoalKeys ?? []);
  let revision = 0;
  let disposed = false;
  return {
    id,
    revision: () => revision,
    projectPoint(point, _profile) {
      if (disposed || !insideBounds(point, options.bounds)) {
        return undefined;
      }
      return projection(point, revision);
    },
    findPath(request) {
      if (disposed) {
        throw new Error("Memory navigation backend is disposed");
      }
      return findMemoryPath(request, revision, blockedGoalKeys, options.bounds);
    },
    updateObstacle(update) {
      if (disposed || update.target.kind !== "custom") {
        return { status: "unsupported", revision };
      }
      const shouldBlock = update.blocked ?? false;
      const wasBlocked = blockedGoalKeys.has(update.target.id);
      if (shouldBlock === wasBlocked) {
        return { status: "unchanged", revision, invalidatedRouteFields: 0 };
      }
      if (shouldBlock) {
        blockedGoalKeys.add(update.target.id);
      } else {
        blockedGoalKeys.delete(update.target.id);
      }
      revision += 1;
      return {
        status: "changed",
        revision,
        invalidatedRouteFields: 0,
        invalidatedPathDependencies: [{ ...update.target }]
      };
    },
    snapshot() {
      return {
        id,
        revision,
        disposed,
        details: { blockedGoalKeys: blockedGoalKeys.size }
      };
    },
    dispose() {
      disposed = true;
      blockedGoalKeys.clear();
    }
  };
}

function findMemoryPath(
  request: NavigationBackendPathRequest,
  revision: number,
  blockedGoalKeys: Set<string>,
  bounds: CreateMemoryNavigationBackendOptions["bounds"]
): NavigationBackendPathResult {
  const start = insideBounds(request.start, bounds)
    ? projection(request.start, revision)
    : undefined;
  if (start === undefined) {
    return { status: "failed", reason: "start-unprojectable" };
  }
  const goal = insideBounds(request.goal, bounds) ? projection(request.goal, revision) : undefined;
  if (goal === undefined) {
    return { status: "failed", reason: "goal-unprojectable" };
  }
  if (request.goalKey !== undefined && blockedGoalKeys.has(request.goalKey)) {
    return {
      status: "failed",
      reason: "unreachable",
      dependencies: [{ kind: "custom", id: request.goalKey }]
    };
  }
  const cost = distance(start.point, goal.point);
  if (request.maxCost !== undefined && cost > request.maxCost) {
    return { status: "failed", reason: "cost-limit" };
  }
  return {
    status: "complete",
    points: [start.point, goal.point],
    cost,
    startProjection: start,
    goalProjection: goal,
    ...(request.goalKey === undefined
      ? {}
      : { dependencies: [{ kind: "custom" as const, id: request.goalKey }] })
  };
}

function projection(point: NavigationPoint, revision: number): NavigationProjection {
  return {
    point: clonePoint(point),
    distance: 0,
    revision,
    area: "memory"
  };
}

function insideBounds(
  point: NavigationPoint,
  bounds: CreateMemoryNavigationBackendOptions["bounds"]
): boolean {
  if (bounds === undefined) {
    return true;
  }
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    (point.z === undefined ||
      (point.z >= (bounds.min.z ?? Number.NEGATIVE_INFINITY) &&
        point.z <= (bounds.max.z ?? Number.POSITIVE_INFINITY)))
  );
}

function distance(left: NavigationPoint, right: NavigationPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function clonePoint(point: NavigationPoint): NavigationPoint {
  return { x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }) };
}
