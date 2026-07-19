import type { GameInstallContext } from "@gamekit/game-runtime";
import { describe, expect, it } from "vitest";
import {
  createMemoryNavigationBackend,
  createNavigationAgentProfileDataType,
  createNavigationHandle,
  createNavigationLayoutDataType,
  createNavigationModule,
  createNavigationRuntime,
  runNavigationRuntimeConformance,
  type NavigationAgentProfileDefinition
} from "../src";

const profile: NavigationAgentProfileDefinition = {
  id: "profile.standard",
  radius: 0.5,
  allowedAreas: ["memory"]
};

describe("Navigation data", () => {
  it("validates agent profiles and typed layout sources", () => {
    const profileType = createNavigationAgentProfileDataType();
    const layoutType = createNavigationLayoutDataType();
    const invalidProfile = profileType.validate?.(
      document("navigation.agent-profile", "invalid", { id: "", radius: 0 }),
      context("navigation.agent-profile")
    );
    const invalidLayout = layoutType.validate?.(
      document("navigation.layout", "invalid", {
        id: "layout.invalid",
        backend: "",
        source: { type: "", id: "" },
        areas: [{ id: "ground" }, { id: "ground" }],
        portals: [{ id: "portal", fromArea: "ground", toArea: "missing" }]
      }),
      context("navigation.layout")
    );
    expect(invalidProfile?.map((entry) => entry.code)).toEqual([
      "navigation.profile_missing_id",
      "navigation.profile_invalid_radius"
    ]);
    expect(invalidLayout?.map((entry) => entry.code)).toContain(
      "navigation.layout_missing_backend"
    );
    expect(invalidLayout?.map((entry) => entry.code)).toContain("navigation.layout_duplicate_area");
    expect(invalidLayout?.map((entry) => entry.code)).toContain(
      "navigation.layout_portal_unknown_area"
    );
  });
});

describe("Navigation runtime", () => {
  it("queues, completes, samples, caches, and invalidates routes", () => {
    let observerErrors = 0;
    const runtime = createNavigationRuntime({
      id: "navigation.test",
      backend: createMemoryNavigationBackend(),
      profiles: [profile],
      maxRequestsPerTick: 1,
      onTrace() {
        throw new Error("observer failed");
      },
      onTraceError() {
        observerErrors += 1;
      }
    });
    const requestId = runtime.requestPath({
      id: "path.first",
      requesterId: "agent.1",
      profileId: profile.id,
      start: { x: 0, y: 0 },
      goal: { x: 10, y: 0 },
      goalKey: "goal"
    });
    expect(runtime.poll(requestId).status).toBe("pending");
    runtime.update(16, 16);
    const completed = runtime.poll(requestId);
    expect(completed.status).toBe("complete");
    if (completed.status !== "complete") {
      throw new Error("Expected completed path");
    }
    expect(completed.cache).toBe("miss");
    expect(completed.path.cost).toBe(10);
    expect(observerErrors).toBeGreaterThan(0);
    expect(runtime.sampleRoute(completed.path.routeId, { x: 4, y: 2 })).toMatchObject({
      status: "valid",
      distanceToRoute: 2,
      remainingDistance: 6
    });

    const cachedId = runtime.requestPath({
      id: "path.cached",
      requesterId: "agent.2",
      profileId: profile.id,
      start: { x: 0, y: 0 },
      goal: { x: 10, y: 0 },
      goalKey: "goal"
    });
    runtime.update(16, 32);
    expect(runtime.poll(cachedId)).toMatchObject({ status: "complete", cache: "hit" });

    const changed = runtime.updateObstacle({
      id: "block.goal",
      target: { kind: "custom", id: "goal" },
      blocked: true
    });
    expect(changed.status).toBe("changed");
    expect(runtime.sampleRoute(completed.path.routeId, { x: 0, y: 0 }).status).toBe("stale");
    runtime.dispose();
    expect(runtime.snapshot()).toMatchObject({
      disposed: true,
      pendingRequests: 0,
      retainedResults: 0,
      retainedRoutes: 0,
      cacheEntries: 0,
      backend: { disposed: true }
    });
  });

  it("uses bounded negative cache and explicit cancellation", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend({ blockedGoalKeys: ["blocked"] }),
      profiles: [profile],
      negativeCacheTtlMs: 1000
    });
    const first = runtime.requestPath(request("negative.first", "blocked"));
    const second = runtime.requestPath(request("negative.second", "blocked"));
    const cancelled = runtime.requestPath(request("cancelled", "open"));
    runtime.cancel(cancelled);
    runtime.update(16, 16);
    expect(runtime.poll(first)).toMatchObject({
      status: "failed",
      reason: "unreachable",
      cache: "miss"
    });
    expect(runtime.poll(second)).toMatchObject({
      status: "failed",
      reason: "unreachable",
      cache: "hit"
    });
    expect(runtime.poll(cancelled).status).toBe("cancelled");
    expect(runtime.snapshot().negativeCacheEntries).toBe(1);
    runtime.dispose();
  });

  it("partially invalidates memory backend goal dependencies", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend(),
      profiles: [profile]
    });
    const leftId = runtime.requestPath(request("memory.left", "left"));
    const rightId = runtime.requestPath(request("memory.right", "right"));
    runtime.update(16, 16);
    const left = runtime.poll(leftId);
    const right = runtime.poll(rightId);
    expect(left.status).toBe("complete");
    expect(right.status).toBe("complete");
    if (left.status !== "complete" || right.status !== "complete") {
      throw new Error("Expected both memory routes to complete");
    }

    runtime.updateObstacle({
      id: "block.left",
      target: { kind: "custom", id: "left" },
      blocked: true
    });
    expect(runtime.sampleRoute(left.path.routeId, { x: 0, y: 0 }).status).toBe("stale");
    expect(runtime.sampleRoute(right.path.routeId, { x: 0, y: 0 })).toMatchObject({
      status: "valid",
      revision: 1
    });
    expect(runtime.snapshot().cacheEntries).toBe(1);
    runtime.dispose();
  });

  it("bounds positive cache entries", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend(),
      profiles: [profile],
      maxCacheEntries: 2
    });
    for (let index = 0; index < 3; index += 1) {
      runtime.requestPath({
        id: `cache.${index}`,
        requesterId: "cache",
        profileId: profile.id,
        start: { x: index, y: 0 },
        goal: { x: index + 1, y: 0 },
        goalKey: `goal.${index}`
      });
    }
    runtime.update(16, 16);
    expect(runtime.snapshot().cacheEntries).toBe(2);
    runtime.dispose();
  });

  it("schedules requesters in stable round-robin order", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend(),
      profiles: [profile],
      maxRequestsPerTick: 1
    });
    const a1 = runtime.requestPath({ ...request("a.1", "goal"), requesterId: "a" });
    const a2 = runtime.requestPath({ ...request("a.2", "goal"), requesterId: "a" });
    const b1 = runtime.requestPath({ ...request("b.1", "goal"), requesterId: "b" });
    runtime.update(16, 16);
    expect(runtime.poll(a1).status).toBe("complete");
    expect(runtime.poll(a2).status).toBe("pending");
    expect(runtime.poll(b1).status).toBe("pending");
    runtime.update(16, 32);
    expect(runtime.poll(b1).status).toBe("complete");
    expect(runtime.poll(a2).status).toBe("pending");
    runtime.update(16, 48);
    expect(runtime.poll(a2).status).toBe("complete");
    runtime.dispose();
  });

  it("binds handles through the GameModule lifecycle", () => {
    const handle = createNavigationHandle();
    const systems: Array<{ update(context: { delta: number; elapsed: number }): void }> = [];
    const module = createNavigationModule({
      backend: createMemoryNavigationBackend(),
      profiles: [profile],
      handle
    });
    const installed = module.install({
      systems: { register: (system) => systems.push(system) }
    } as unknown as GameInstallContext);
    expect(handle.isBound()).toBe(true);
    const id = handle.requestPath(request("module.path", "goal"));
    systems[0]?.update({ delta: 16, elapsed: 16 });
    expect(handle.poll(id).status).toBe("complete");
    if (typeof installed === "function") {
      installed();
    } else {
      installed?.dispose?.();
    }
    expect(handle.isBound()).toBe(false);
  });

  it("exposes a reusable memory conformance fixture", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend({ blockedGoalKeys: ["unreachable"] }),
      profiles: [profile]
    });
    const report = runNavigationRuntimeConformance(() => ({
      runtime,
      profile,
      reachableStart: { x: 0, y: 0 },
      reachableGoal: { x: 2, y: 0 },
      unreachableGoal: { x: 8, y: 0 },
      blockReachableGoal: {
        id: "block.reachable",
        target: { kind: "custom", id: "reachable" },
        blocked: true
      },
      dispose: () => runtime.dispose()
    }));
    expect(report.firstRoutePoints).toBe(2);
    expect(report.checks).toContain("old route becomes explicitly stale");
  });

  it("rejects conflicting ids without replacing the original request", () => {
    const runtime = createNavigationRuntime({
      backend: createMemoryNavigationBackend(),
      profiles: [profile]
    });
    const original = runtime.requestPath(request("same", "one"));
    const conflict = runtime.requestPath({ ...request("same", "two"), goal: { x: 3, y: 0 } });
    expect(conflict).not.toBe(original);
    expect(runtime.poll(conflict)).toMatchObject({
      status: "rejected",
      reason: "duplicate-request-conflict"
    });
    expect(runtime.poll(original).status).toBe("pending");
    runtime.dispose();
  });
});

function request(id: string, goalKey: string) {
  return {
    id,
    requesterId: "agent",
    profileId: profile.id,
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 0 },
    goalKey
  };
}

function document(type: string, id: string, data: unknown) {
  return { type, id, data, priority: 0, tags: [] };
}

function context(type: string) {
  return { type, pack: { id: "test", version: "1", entries: [] }, path: "test" };
}
