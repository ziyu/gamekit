import type { NavigationAgentProfileDefinition } from "../contracts/profile";
import type { NavigationObstacleUpdate } from "../contracts/obstacle";
import type { NavigationRuntime } from "../contracts/facade";

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
  firstRouteKind: "path" | "field";
  firstRoutePoints: number;
  revision: number;
};

export async function runNavigationRuntimeConformance(
  createHarness: () => NavigationConformanceHarness
): Promise<NavigationConformanceReport> {
  const harness = createHarness();
  try {
    const firstId = harness.runtime.requestPath({
      id: "navigation.conformance.reachable",
      requesterId: "conformance",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.reachableGoal,
      goalKey: "reachable",
      routeKind: "path"
    });
    const fieldId = harness.runtime.requestPath({
      id: "navigation.conformance.field",
      requesterId: "conformance-field",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.reachableGoal,
      goalKey: "reachable-field",
      routeKind: "field"
    });
    const cancelledId = harness.runtime.requestPath({
      id: "navigation.conformance.cancelled",
      requesterId: "conformance-cancel",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.reachableGoal
    });
    harness.runtime.cancel(cancelledId);
    const first = await settle(harness.runtime, firstId, 1);
    const field = await settle(harness.runtime, fieldId, 1000);
    const cancelled = harness.runtime.poll(cancelledId);
    assertConformance(first.status === "complete", "reachable path completes");
    assertConformance(first.route.kind === "path", "path request returns a path route");
    assertConformance(first.route.points.length >= 1, "completed path exposes stable points");
    assertConformance(field.status === "complete", "field request completes");
    assertConformance(field.route.kind === "field", "field request does not expose point arrays");
    assertConformance(cancelled.status === "cancelled", "cancelled request remains cancelled");
    assertConformance(
      harness.runtime.sampleRoute(field.route.routeId, harness.reachableStart).status === "valid",
      "field route can be sampled"
    );

    const missingId = harness.runtime.requestPath({
      id: "navigation.conformance.unreachable",
      requesterId: "conformance",
      profileId: harness.profile.id,
      start: harness.reachableStart,
      goal: harness.unreachableGoal,
      goalKey: "unreachable"
    });
    const missing = await settle(harness.runtime, missingId, 2000);
    assertConformance(
      missing.status === "failed" || missing.status === "complete",
      "backend returns an explicit terminal result"
    );

    const revisionBefore = harness.runtime.revision();
    if (harness.blockReachableGoal !== undefined) {
      const change = harness.runtime.updateObstacle(harness.blockReachableGoal);
      assertConformance(change.status === "changed", "obstacle update changes backend state");
      assertConformance(change.revision > revisionBefore, "obstacle update advances revision");
      assertConformance(
        harness.runtime.sampleRoute(first.route.routeId, harness.reachableStart).status === "stale",
        "old route becomes explicitly stale"
      );
    }

    return {
      checks: [
        "reachable path completes",
        "path request returns a path route",
        "completed path exposes stable points",
        "field request completes",
        "field request does not expose point arrays",
        "field route can be sampled",
        "cancelled request remains cancelled",
        "backend returns an explicit terminal result",
        ...(harness.blockReachableGoal === undefined
          ? []
          : ["obstacle update advances revision", "old route becomes explicitly stale"])
      ],
      firstRouteKind: first.route.kind,
      firstRoutePoints: first.route.kind === "path" ? first.route.points.length : 0,
      revision: harness.runtime.revision()
    };
  } finally {
    harness.dispose();
  }
}

async function settle(runtime: NavigationRuntime, requestId: string, startElapsed: number) {
  let elapsed = startElapsed;
  for (let tick = 0; tick < 256; tick += 1) {
    runtime.update(1, elapsed);
    const result = runtime.poll(requestId);
    if (result.status !== "pending") {
      return result;
    }
    elapsed += 1;
    await Promise.resolve();
  }
  return runtime.poll(requestId);
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Navigation conformance failed: ${message}`);
  }
}
