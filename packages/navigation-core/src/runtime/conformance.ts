import type {
  NavigationAgentProfileDefinition,
  NavigationObstacleUpdate,
  NavigationRuntime
} from "./types";

export type NavigationConformanceHarness = {
  runtime: NavigationRuntime;
  profile: NavigationAgentProfileDefinition;
  reachableStart: { x: number; y: number; z?: number | undefined };
  reachableGoal: { x: number; y: number; z?: number | undefined };
  unreachableGoal: { x: number; y: number; z?: number | undefined };
  blockReachableGoal?: NavigationObstacleUpdate | undefined;
  dispose(): void;
};

export type NavigationConformanceReport = {
  checks: string[];
  firstRoutePoints: number;
  revision: number;
};

export function runNavigationRuntimeConformance(
  createHarness: () => NavigationConformanceHarness
): NavigationConformanceReport {
  const harness = createHarness();
  try {
    const firstId = harness.runtime.requestPath({
      id: "navigation.conformance.reachable",
      requesterId: "conformance",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.reachableGoal,
      goalKey: "reachable"
    });
    const cancelledId = harness.runtime.requestPath({
      id: "navigation.conformance.cancelled",
      requesterId: "conformance",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.reachableGoal
    });
    harness.runtime.cancel(cancelledId);
    harness.runtime.update(16, 16);
    const first = harness.runtime.poll(firstId);
    const cancelled = harness.runtime.poll(cancelledId);
    assertConformance(first.status === "complete", "reachable path completes");
    assertConformance(first.path.points.length >= 1, "completed path exposes stable points");
    assertConformance(cancelled.status === "cancelled", "cancelled request remains cancelled");

    const missingId = harness.runtime.requestPath({
      id: "navigation.conformance.unreachable",
      requesterId: "conformance",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.unreachableGoal,
      goalKey: "unreachable"
    });
    harness.runtime.update(16, 32);
    const missing = harness.runtime.poll(missingId);
    assertConformance(
      missing.status === "failed" || missing.status === "complete",
      "backend returns an explicit terminal result"
    );

    const revisionBefore = harness.runtime.revision();
    if (harness.blockReachableGoal !== undefined) {
      const change = harness.runtime.updateObstacle(harness.blockReachableGoal);
      assertConformance(change.status === "changed", "obstacle update changes backend state");
      assertConformance(change.revision > revisionBefore, "obstacle update advances revision");
      const sample = harness.runtime.sampleRoute(first.path.routeId, harness.reachableStart);
      assertConformance(sample.status === "stale", "old route becomes explicitly stale");
    }

    return {
      checks: [
        "reachable path completes",
        "completed path exposes stable points",
        "cancelled request remains cancelled",
        "backend returns an explicit terminal result",
        ...(harness.blockReachableGoal === undefined
          ? []
          : ["obstacle update advances revision", "old route becomes explicitly stale"])
      ],
      firstRoutePoints: first.path.points.length,
      revision: harness.runtime.revision()
    };
  } finally {
    harness.dispose();
  }
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Navigation conformance failed: ${message}`);
  }
}
