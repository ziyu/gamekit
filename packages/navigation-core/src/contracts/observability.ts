import type { NavigationRequestId } from "./routes";
import type { NavigationBackendSnapshot } from "../backend/port";

export type NavigationTraceKind =
  | "lifecycle"
  | "request"
  | "backend"
  | "result"
  | "cache"
  | "route"
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
  queuedRequests: number;
  submittedRequests: number;
  retainedResults: number;
  retainedRoutes: number;
  cacheEntries: number;
  negativeCacheEntries: number;
  traceEntries: number;
  backend: NavigationBackendSnapshot;
};
