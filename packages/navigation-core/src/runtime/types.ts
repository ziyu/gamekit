import type { DataRef, DataRegistry } from "@gamekit/data";
import type { GameInstallContext } from "@gamekit/game-runtime";

export type NavigationRequestId = string;
export type NavigationRouteId = string;

export type NavigationPoint = {
  x: number;
  y: number;
  z?: number | undefined;
};

export type NavigationAgentProfileDefinition = {
  id: string;
  radius: number;
  height?: number | undefined;
  maxSlope?: number | undefined;
  allowedAreas?: string[] | undefined;
  costOverrides?: Record<string, number> | undefined;
  tags?: string[] | undefined;
};

export type NavigationAreaDefinition = {
  id: string;
  cost?: number | undefined;
  tags?: string[] | undefined;
};

export type NavigationPortalDefinition = {
  id: string;
  fromArea: string;
  toArea: string;
  cost?: number | undefined;
  bidirectional?: boolean | undefined;
};

export type NavigationLayoutDefinition = {
  id: string;
  backend: string;
  source: DataRef;
  areas?: NavigationAreaDefinition[] | undefined;
  portals?: NavigationPortalDefinition[] | undefined;
  tags?: string[] | undefined;
};

export type NavigationProjection = {
  point: NavigationPoint;
  backendNodeId?: string | undefined;
  area?: string | undefined;
  distance: number;
  revision: number;
};

export type NavigationPathRequest = {
  id?: NavigationRequestId | undefined;
  requesterId: string;
  profileId: string;
  start: NavigationPoint;
  goal: NavigationPoint;
  goalKey?: string | undefined;
  maxCost?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type NavigationPath = {
  routeId: NavigationRouteId;
  points: NavigationPoint[];
  cost: number;
  revision: number;
  startProjection: NavigationProjection;
  goalProjection: NavigationProjection;
};

export type NavigationPathFailureReason =
  | "profile-missing"
  | "start-unprojectable"
  | "goal-unprojectable"
  | "unreachable"
  | "cost-limit"
  | "backend-error";

export type NavigationPathRejectionReason =
  | "invalid-request"
  | "queue-full"
  | "requester-queue-full"
  | "duplicate-request-conflict"
  | "runtime-disposed";

export type NavigationPathResult =
  | {
      status: "pending";
      requestId: NavigationRequestId;
      requesterId: string;
      revision: number;
    }
  | {
      status: "complete";
      requestId: NavigationRequestId;
      requesterId: string;
      path: NavigationPath;
      cache: "hit" | "miss";
    }
  | {
      status: "failed";
      requestId: NavigationRequestId;
      requesterId: string;
      reason: NavigationPathFailureReason;
      revision: number;
      cache: "hit" | "miss";
      message?: string | undefined;
    }
  | {
      status: "cancelled";
      requestId: NavigationRequestId;
      requesterId: string;
      revision: number;
    }
  | {
      status: "rejected";
      requestId: NavigationRequestId;
      requesterId: string;
      reason: NavigationPathRejectionReason;
      revision: number;
      message: string;
    }
  | {
      status: "missing";
      requestId: NavigationRequestId;
    };

export type NavigationRouteSample =
  | {
      status: "valid";
      routeId: NavigationRouteId;
      revision: number;
      point: NavigationPoint;
      nextPoint: NavigationPoint;
      direction: NavigationPoint;
      distanceToRoute: number;
      remainingDistance: number;
    }
  | {
      status: "stale";
      routeId: NavigationRouteId;
      routeRevision: number;
      revision: number;
    }
  | {
      status: "missing";
      routeId: NavigationRouteId;
      revision: number;
    };

export type NavigationObstacleTarget =
  | { kind: "edge"; id: string }
  | { kind: "area"; id: string }
  | { kind: "custom"; id: string };

export type NavigationObstacleUpdate = {
  id: string;
  target: NavigationObstacleTarget;
  blocked?: boolean | undefined;
  costMultiplier?: number | undefined;
  source?: string | undefined;
};

export type NavigationObstacleUpdateResult = {
  status: "changed" | "unchanged" | "unsupported";
  revision: number;
  invalidatedRouteFields?: number | undefined;
  invalidatedPathDependencies?: NavigationObstacleTarget[] | undefined;
  invalidateAllPaths?: boolean | undefined;
};

export type NavigationBackendPathRequest = {
  requestId: NavigationRequestId;
  profile: NavigationAgentProfileDefinition;
  start: NavigationPoint;
  goal: NavigationPoint;
  goalKey?: string | undefined;
  maxCost?: number | undefined;
};

export type NavigationBackendPathResult =
  | {
      status: "complete";
      points: NavigationPoint[];
      cost: number;
      startProjection: NavigationProjection;
      goalProjection: NavigationProjection;
      dependencies?: NavigationObstacleTarget[] | undefined;
    }
  | {
      status: "failed";
      reason: Exclude<NavigationPathFailureReason, "profile-missing" | "backend-error">;
      message?: string | undefined;
      dependencies?: NavigationObstacleTarget[] | undefined;
    };

export type NavigationBackendSnapshot = {
  id: string;
  revision: number;
  disposed: boolean;
  details?: Record<string, unknown> | undefined;
};

export type NavigationBackendAdapter = {
  readonly id: string;
  revision(): number;
  projectPoint(
    point: NavigationPoint,
    profile: NavigationAgentProfileDefinition
  ): NavigationProjection | undefined;
  findPath(request: NavigationBackendPathRequest): NavigationBackendPathResult;
  updateObstacle?(update: NavigationObstacleUpdate): NavigationObstacleUpdateResult;
  snapshot(): NavigationBackendSnapshot;
  dispose(): void;
};

export type NavigationTraceKind =
  | "lifecycle"
  | "request"
  | "result"
  | "cache"
  | "obstacle"
  | "budget";

export type NavigationTraceEntry = {
  sequence: number;
  kind: NavigationTraceKind;
  label: string;
  timestamp: number;
  revision: number;
  requestId?: NavigationRequestId | undefined;
  requesterId?: string | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type NavigationSnapshot = {
  id: string;
  revision: number;
  disposed: boolean;
  profiles: string[];
  pendingRequests: number;
  retainedResults: number;
  retainedRoutes: number;
  cacheEntries: number;
  negativeCacheEntries: number;
  traceEntries: number;
  backend: NavigationBackendSnapshot;
};

export type NavigationQueries = {
  projectPoint(point: NavigationPoint, profileId: string): NavigationProjection | undefined;
  requestPath(request: NavigationPathRequest): NavigationRequestId;
  poll(requestId: NavigationRequestId): NavigationPathResult;
  cancel(requestId: NavigationRequestId): void;
  sampleRoute(routeId: NavigationRouteId, point: NavigationPoint): NavigationRouteSample;
  revision(): number;
  snapshot(): NavigationSnapshot;
};

export type NavigationRuntime = NavigationQueries & {
  update(deltaMs: number, elapsedMs: number): void;
  updateObstacle(update: NavigationObstacleUpdate): NavigationObstacleUpdateResult;
  traces(): NavigationTraceEntry[];
  dispose(): void;
};

export type NavigationHandle = NavigationQueries & {
  updateObstacle(update: NavigationObstacleUpdate): NavigationObstacleUpdateResult;
  traces(): NavigationTraceEntry[];
  isBound(): boolean;
};

export type CreateNavigationRuntimeOptions = {
  id?: string | undefined;
  backend: NavigationBackendAdapter;
  dataRegistry?: DataRegistry | undefined;
  profiles?: NavigationAgentProfileDefinition[] | undefined;
  maxRequestsPerTick?: number | undefined;
  maxPendingRequests?: number | undefined;
  maxPendingPerRequester?: number | undefined;
  maxRetainedResults?: number | undefined;
  maxRetainedRoutes?: number | undefined;
  maxCacheEntries?: number | undefined;
  cacheTtlMs?: number | undefined;
  negativeCacheTtlMs?: number | undefined;
  pointQuantization?: number | undefined;
  traceLimit?: number | undefined;
  onTrace?: ((entry: NavigationTraceEntry) => void) | undefined;
  onTraceError?: ((error: unknown, entry: NavigationTraceEntry) => void) | undefined;
};

export type CreateNavigationModuleOptions = CreateNavigationRuntimeOptions & {
  handle?: NavigationHandle | undefined;
  onRuntime?: ((runtime: NavigationRuntime, context: GameInstallContext) => void) | undefined;
};
