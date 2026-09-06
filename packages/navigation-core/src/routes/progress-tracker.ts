import type { NavigationPoint } from "../contracts/geometry";
import type { NavigationQueries } from "../contracts/facade";
import type { NavigationRouteSample } from "../contracts/routes";

export type NavigationProgressStatus =
  | "moving"
  | "arrived"
  | "stuck"
  | "route-stale"
  | "route-missing";

export type NavigationProgressInput = {
  agentId: string;
  routeId: string;
  position: NavigationPoint;
  elapsedMs: number;
  arrivalDistance?: number | undefined;
  progressEpsilon?: number | undefined;
  stuckAfterMs?: number | undefined;
};

export type NavigationProgress = {
  agentId: string;
  routeId: string;
  status: NavigationProgressStatus;
  elapsedMs: number;
  bestRemainingDistance?: number | undefined;
  lastProgressAt?: number | undefined;
  sample: NavigationRouteSample;
};

export type NavigationProgressTracker = {
  update(input: NavigationProgressInput): NavigationProgress;
  remove(agentId: string): void;
  clear(): void;
  size(): number;
};

type ProgressState = {
  routeId: string;
  bestRemainingDistance: number;
  lastProgressAt: number;
};

export function createNavigationProgressTracker(
  navigation: NavigationQueries
): NavigationProgressTracker {
  const states = new Map<string, ProgressState>();
  return {
    update(input) {
      const sample = navigation.sampleRoute(input.routeId, input.position);
      if (sample.status !== "valid") {
        states.delete(input.agentId);
        return {
          agentId: input.agentId,
          routeId: input.routeId,
          status: sample.status === "stale" ? "route-stale" : "route-missing",
          elapsedMs: input.elapsedMs,
          sample
        };
      }
      const arrivalDistance = nonNegative(input.arrivalDistance, 0.1);
      const progressEpsilon = positive(input.progressEpsilon, 0.05);
      const stuckAfterMs = positive(input.stuckAfterMs, 1000);
      let state = states.get(input.agentId);
      if (state === undefined || state.routeId !== input.routeId) {
        state = {
          routeId: input.routeId,
          bestRemainingDistance: sample.remainingDistance,
          lastProgressAt: input.elapsedMs
        };
        states.set(input.agentId, state);
      } else if (sample.remainingDistance <= state.bestRemainingDistance - progressEpsilon) {
        state.bestRemainingDistance = sample.remainingDistance;
        state.lastProgressAt = input.elapsedMs;
      }
      const status: NavigationProgressStatus =
        sample.remainingDistance <= arrivalDistance
          ? "arrived"
          : input.elapsedMs - state.lastProgressAt >= stuckAfterMs
            ? "stuck"
            : "moving";
      return {
        agentId: input.agentId,
        routeId: input.routeId,
        status,
        elapsedMs: input.elapsedMs,
        bestRemainingDistance: state.bestRemainingDistance,
        lastProgressAt: state.lastProgressAt,
        sample
      };
    },
    remove(agentId) {
      states.delete(agentId);
    },
    clear: () => states.clear(),
    size: () => states.size
  };
}

function nonNegative(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError("Navigation progress value must be non-negative");
  }
  return resolved;
}

function positive(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError("Navigation progress value must be positive");
  }
  return resolved;
}
