import type { NavigationPoint, NavigationProjection } from "./geometry";
import type { NavigationObstacleUpdate, NavigationObstacleUpdateResult } from "./obstacle";
import type { NavigationSnapshot, NavigationTraceEntry } from "./observability";
import type {
  NavigationPathRequest,
  NavigationRequestId,
  NavigationRequestResult,
  NavigationRouteId,
  NavigationRouteSample
} from "./routes";

export type NavigationQueries = {
  projectPoint(point: NavigationPoint, profileId: string): NavigationProjection | undefined;
  requestPath(request: NavigationPathRequest): NavigationRequestId;
  poll(requestId: NavigationRequestId): NavigationRequestResult;
  cancel(requestId: NavigationRequestId): void;
  sampleRoute(routeId: NavigationRouteId, point: NavigationPoint): NavigationRouteSample;
  releaseRoute(routeId: NavigationRouteId): void;
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
