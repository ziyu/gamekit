import type {
  NavigationObstacleUpdateResult,
  NavigationPoint,
  NavigationProjection,
  NavigationRequestResult,
  NavigationRoute,
  NavigationRouteSample,
  NavigationSnapshot,
  NavigationTraceEntry
} from "@gamekit/navigation-core";
import type { NavigationLabBackendSummary } from "./backends";
import type { NavigationLabProfileId, NavigationLabScenarioDefinition } from "./scenario";

export type NavigationLabPointMode = "probe" | "start" | "goal";
export type NavigationLabSwampMode = "normal" | "costly" | "blocked";

export type NavigationLabAgentSnapshot = {
  id: string;
  routeId: string;
  position: NavigationPoint;
  direction: NavigationPoint;
  remainingDistance: number;
  progress: "moving" | "arrived" | "stuck" | "route-stale" | "route-missing";
};

export type NavigationLabFieldVector = {
  point: NavigationPoint;
  sample: NavigationRouteSample;
};

export type NavigationLabBurstSnapshot = {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type NavigationLabSnapshot = {
  running: boolean;
  tick: number;
  elapsed: number;
  scenario: NavigationLabScenarioDefinition;
  backend: NavigationLabBackendSummary;
  profileId: NavigationLabProfileId;
  start: NavigationPoint;
  goal: NavigationPoint;
  pointMode: NavigationLabPointMode;
  probePoint?: NavigationPoint | undefined;
  projection?: NavigationProjection | undefined;
  currentRequestId?: string | undefined;
  lastResult?: NavigationRequestResult | undefined;
  activeRoute?: NavigationRoute | undefined;
  activeRoutes: NavigationRoute[];
  releasedSample?: NavigationRouteSample | undefined;
  agents: NavigationLabAgentSnapshot[];
  fieldVectors: NavigationLabFieldVector[];
  agentsFrozen: boolean;
  gateBlocked: boolean;
  ridgeBlocked: boolean;
  swampMode: NavigationLabSwampMode;
  portalEnabled: boolean;
  lockdown: boolean;
  lastObstacleResult?: NavigationObstacleUpdateResult | undefined;
  burst?: NavigationLabBurstSnapshot | undefined;
  navigation: NavigationSnapshot;
  traces: NavigationTraceEntry[];
  notice: string;
};

export type NavigationLabController = {
  setProfile(profileId: NavigationLabProfileId): void;
  setPointMode(mode: NavigationLabPointMode): void;
  placePoint(point: NavigationPoint): void;
  requestPath(): string;
  requestField(): string;
  repeatLastRequest(): string | undefined;
  requestCostCappedPath(): string;
  cancelProbe(): string;
  runBurst(count?: number): void;
  releaseRoute(): void;
  toggleAgentsFrozen(): void;
  toggleGate(): void;
  cycleSwamp(): void;
  togglePortal(): void;
  runLockdown(): string;
  probeUnsupportedObstacle(): void;
  reset(): void;
  snapshot(): NavigationLabSnapshot;
};
