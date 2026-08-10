import { cloneBackendPathStatus, cloneBackendRouteSample } from "../backend/clone";
import type {
  NavigationBackendAdapter,
  NavigationBackendPathRequest,
  NavigationBackendPathResult,
  NavigationBackendPathStatus,
  NavigationBackendRouteSample
} from "../backend/port";
import {
  cloneNavigationPoint,
  type NavigationPoint,
  type NavigationProjection
} from "../contracts/geometry";
import type { NavigationObstacleTarget } from "../contracts/obstacle";

export type CreateMemoryNavigationBackendOptions = {
  id?: string | undefined;
  bounds?:
    | {
        min: NavigationPoint;
        max: NavigationPoint;
      }
    | undefined;
  blockedGoalKeys?: string[] | undefined;
  completionDelayTicks?: number | undefined;
  maxRouteFields?: number | undefined;
};

type MemoryTask = {
  request: NavigationBackendPathRequest;
  revision: number;
  remainingTicks: number;
  status: NavigationBackendPathStatus;
  retainedRouteKey?: string | undefined;
};

type MemoryRouteField = {
  key: string;
  goal: NavigationPoint;
  revision: number;
  dependencies: NavigationObstacleTarget[] | undefined;
  retainCount: number;
};

export function createMemoryNavigationBackend(
  options: CreateMemoryNavigationBackendOptions = {}
): NavigationBackendAdapter {
  const id = options.id ?? "navigation.memory";
  const blockedGoalKeys = new Set(options.blockedGoalKeys ?? []);
  const completionDelayTicks = nonNegativeInteger(options.completionDelayTicks, 0);
  const maxRouteFields = positiveInteger(options.maxRouteFields, 128);
  const tasks = new Map<string, MemoryTask>();
  const routeFields = new Map<string, MemoryRouteField>();
  let revision = 0;
  let disposed = false;

  return {
    id,
    capabilities: {
      deferredRequests: true,
      routeFields: true,
      radius: false,
      height: false,
      maxSlope: false,
      dynamicObstacles: ["custom"]
    },
    revision: () => revision,
    projectPoint(point) {
      if (disposed || !insideBounds(point, options.bounds)) {
        return undefined;
      }
      return projection(point, revision);
    },
    submitPath(request) {
      if (disposed) {
        throw new Error("Memory navigation backend is disposed");
      }
      if (tasks.has(request.requestId)) {
        throw new Error(`Memory navigation request already exists: ${request.requestId}`);
      }
      const task: MemoryTask = {
        request: cloneRequest(request),
        revision,
        remainingTicks: completionDelayTicks,
        status: { status: "pending", revision }
      };
      tasks.set(request.requestId, task);
      if (completionDelayTicks === 0) {
        completeTask(task);
      }
    },
    pollPath(requestId) {
      const task = tasks.get(requestId);
      return task === undefined
        ? { status: "missing", revision }
        : cloneBackendPathStatus(task.status);
    },
    cancelPath(requestId) {
      releaseTask(requestId);
    },
    releasePath(requestId) {
      releaseTask(requestId);
    },
    update() {
      for (const task of tasks.values()) {
        if (task.status.status !== "pending") {
          continue;
        }
        task.remainingTicks = Math.max(0, task.remainingTicks - 1);
        if (task.remainingTicks === 0) {
          completeTask(task);
        }
      }
    },
    sampleRoute(routeKey, point) {
      const field = routeFields.get(routeKey);
      if (field === undefined) {
        return { status: "missing", revision };
      }
      if (field.revision !== revision) {
        return { status: "stale", routeRevision: field.revision, revision };
      }
      return cloneBackendRouteSample(sampleStraightField(field, point));
    },
    retainRoute(routeKey) {
      retainField(routeKey);
    },
    releaseRoute(routeKey) {
      const field = routeFields.get(routeKey);
      if (field !== undefined) {
        field.retainCount = Math.max(0, field.retainCount - 1);
      }
      trimFields();
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
      let invalidatedRouteFields = 0;
      for (const [key, field] of routeFields) {
        if (dependenciesContain(field.dependencies, update.target)) {
          routeFields.delete(key);
          invalidatedRouteFields += 1;
        } else {
          field.revision = revision;
        }
      }
      return {
        status: "changed",
        revision,
        invalidatedRouteFields,
        invalidatedPathDependencies: [{ ...update.target }]
      };
    },
    snapshot() {
      return {
        id,
        revision,
        disposed,
        capabilities: {
          deferredRequests: true,
          routeFields: true,
          radius: false,
          height: false,
          maxSlope: false,
          dynamicObstacles: ["custom"]
        },
        details: {
          blockedGoalKeys: blockedGoalKeys.size,
          retainedRequests: tasks.size,
          routeFields: routeFields.size,
          retainedRouteFields: [...routeFields.values()].filter((field) => field.retainCount > 0)
            .length
        }
      };
    },
    dispose() {
      disposed = true;
      blockedGoalKeys.clear();
      tasks.clear();
      routeFields.clear();
    }
  };

  function findMemoryPath(
    request: NavigationBackendPathRequest,
    resultRevision: number
  ): NavigationBackendPathResult {
    const start = insideBounds(request.start, options.bounds)
      ? projection(request.start, resultRevision)
      : undefined;
    if (start === undefined) {
      return { status: "failed", reason: "start-unprojectable", revision: resultRevision };
    }
    const goal = insideBounds(request.goal, options.bounds)
      ? projection(request.goal, resultRevision)
      : undefined;
    if (goal === undefined) {
      return { status: "failed", reason: "goal-unprojectable", revision: resultRevision };
    }
    const dependencies =
      request.goalKey === undefined
        ? undefined
        : [{ kind: "custom" as const, id: request.goalKey }];
    if (request.goalKey !== undefined && blockedGoalKeys.has(request.goalKey)) {
      return {
        status: "failed",
        reason: "unreachable",
        revision: resultRevision,
        dependencies
      };
    }
    const cost = distance(start.point, goal.point);
    if (request.maxCost !== undefined && cost > request.maxCost) {
      return { status: "failed", reason: "cost-limit", revision: resultRevision, dependencies };
    }
    if (request.routeKind === "field") {
      const routeKey = `${request.profile.id}|${request.goalKey ?? ""}|${pointKey(goal.point)}`;
      let field = routeFields.get(routeKey);
      if (field === undefined || field.revision !== resultRevision) {
        field = {
          key: routeKey,
          goal: cloneNavigationPoint(goal.point),
          revision: resultRevision,
          dependencies,
          retainCount: 0
        };
      }
      routeFields.delete(routeKey);
      routeFields.set(routeKey, field);
      return {
        status: "complete",
        revision: resultRevision,
        route: { kind: "field", routeKey },
        cost,
        startProjection: start,
        goalProjection: goal,
        dependencies
      };
    }
    return {
      status: "complete",
      revision: resultRevision,
      route: { kind: "path", points: [start.point, goal.point] },
      cost,
      startProjection: start,
      goalProjection: goal,
      dependencies
    };
  }

  function completeTask(task: MemoryTask): void {
    task.status = findMemoryPath(task.request, task.revision);
    if (task.status.status === "complete" && task.status.route.kind === "field") {
      task.retainedRouteKey = task.status.route.routeKey;
      retainField(task.retainedRouteKey);
      trimFields();
    }
  }

  function retainField(routeKey: string): void {
    const field = routeFields.get(routeKey);
    if (field === undefined) {
      throw new Error(`Memory navigation route field is missing: ${routeKey}`);
    }
    field.retainCount += 1;
    routeFields.delete(routeKey);
    routeFields.set(routeKey, field);
  }

  function releaseTask(requestId: string): void {
    const task = tasks.get(requestId);
    tasks.delete(requestId);
    if (task?.retainedRouteKey !== undefined) {
      const field = routeFields.get(task.retainedRouteKey);
      if (field !== undefined) {
        field.retainCount = Math.max(0, field.retainCount - 1);
      }
    }
  }

  function trimFields(): void {
    while (routeFields.size > maxRouteFields) {
      const removable = [...routeFields].find(([, field]) => field.retainCount === 0);
      if (removable === undefined) {
        break;
      }
      routeFields.delete(removable[0]);
    }
  }
}

function sampleStraightField(
  field: MemoryRouteField,
  point: NavigationPoint
): NavigationBackendRouteSample {
  const remainingDistance = distance(point, field.goal);
  const direction =
    remainingDistance === 0
      ? { x: 0, y: 0, ...(point.z === undefined && field.goal.z === undefined ? {} : { z: 0 }) }
      : {
          x: (field.goal.x - point.x) / remainingDistance,
          y: (field.goal.y - point.y) / remainingDistance,
          ...(point.z === undefined && field.goal.z === undefined
            ? {}
            : { z: ((field.goal.z ?? 0) - (point.z ?? 0)) / remainingDistance })
        };
  return {
    status: "valid",
    revision: field.revision,
    point: cloneNavigationPoint(point),
    nextPoint: cloneNavigationPoint(field.goal),
    direction,
    distanceToRoute: 0,
    remainingDistance
  };
}

function projection(point: NavigationPoint, revision: number): NavigationProjection {
  return { point: cloneNavigationPoint(point), distance: 0, revision, area: "memory" };
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

function cloneRequest(request: NavigationBackendPathRequest): NavigationBackendPathRequest {
  return {
    ...request,
    profile: {
      ...request.profile,
      allowedAreas: request.profile.allowedAreas && [...request.profile.allowedAreas],
      costOverrides: request.profile.costOverrides && { ...request.profile.costOverrides },
      tags: request.profile.tags && [...request.profile.tags]
    },
    start: cloneNavigationPoint(request.start),
    goal: cloneNavigationPoint(request.goal)
  };
}

function dependenciesContain(
  dependencies: NavigationObstacleTarget[] | undefined,
  target: NavigationObstacleTarget
): boolean {
  return (
    dependencies?.some(
      (dependency) => dependency.kind === target.kind && dependency.id === target.id
    ) ?? true
  );
}

function distance(left: NavigationPoint, right: NavigationPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function pointKey(point: NavigationPoint): string {
  return `${point.x},${point.y},${point.z ?? ""}`;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError("Memory navigation completion delay must be a non-negative integer");
  }
  return resolved;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError("Memory navigation maxRouteFields must be a positive integer");
  }
  return resolved;
}
