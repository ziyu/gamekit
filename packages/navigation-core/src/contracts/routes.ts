import type { NavigationPoint, NavigationProjection } from "./geometry";

export type NavigationRequestId = string;
export type NavigationRouteId = string;
export type NavigationRouteKind = "path" | "field";

export type NavigationRouteTraversal = {
  kind: "portal";
  portalId: string;
  entryPoint: NavigationPoint;
  exitPoint: NavigationPoint;
};

export type NavigationPathTraversal = NavigationRouteTraversal & {
  fromPointIndex: number;
  toPointIndex: number;
};

export type NavigationPathRequest = {
  id?: NavigationRequestId | undefined;
  requesterId: string;
  profileId: string;
  start: NavigationPoint;
  goal: NavigationPoint;
  goalKey?: string | undefined;
  routeKind?: NavigationRouteKind | undefined;
  maxCost?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type NavigationRouteBase = {
  routeId: NavigationRouteId;
  cost: number;
  revision: number;
  startProjection: NavigationProjection;
  goalProjection: NavigationProjection;
};

export type NavigationPathRoute = NavigationRouteBase & {
  kind: "path";
  points: NavigationPoint[];
  traversals?: NavigationPathTraversal[] | undefined;
};

export type NavigationFieldRoute = NavigationRouteBase & {
  kind: "field";
  goal: NavigationPoint;
  goalKey?: string | undefined;
};

export type NavigationRoute = NavigationPathRoute | NavigationFieldRoute;

export type NavigationPathFailureReason =
  | "profile-missing"
  | "start-unprojectable"
  | "goal-unprojectable"
  | "unreachable"
  | "cost-limit"
  | "unsupported-route-kind"
  | "stale-result"
  | "backend-error";

export type NavigationPathRejectionReason =
  | "invalid-request"
  | "queue-full"
  | "requester-queue-full"
  | "duplicate-request-conflict"
  | "runtime-disposed";

export type NavigationRequestResult =
  | {
      status: "pending";
      phase: "queued" | "submitted";
      requestId: NavigationRequestId;
      requesterId: string;
      revision: number;
    }
  | {
      status: "complete";
      requestId: NavigationRequestId;
      requesterId: string;
      route: NavigationRoute;
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
      traversal?: NavigationRouteTraversal | undefined;
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
