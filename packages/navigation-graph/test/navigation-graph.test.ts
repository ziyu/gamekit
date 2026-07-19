import {
  createNavigationRuntime,
  type NavigationAgentProfileDefinition
} from "@gamekit/navigation-core";
import { describe, expect, it } from "vitest";
import {
  createGraphNavigationBackend,
  createNavigationGraphDataType,
  type NavigationGraphDefinition
} from "../src";

const standardProfile: NavigationAgentProfileDefinition = {
  id: "profile.standard",
  radius: 0.5,
  allowedAreas: ["ground", "mud", "road"]
};

describe("Navigation graph data", () => {
  it("rejects invalid nodes, edges, and costs", () => {
    const type = createNavigationGraphDataType();
    const diagnostics = type.validate?.(
      {
        type: "navigation.graph",
        id: "invalid",
        priority: 0,
        tags: [],
        data: {
          id: "graph.invalid",
          nodes: [
            { id: "a", point: { x: 0, y: 0 } },
            { id: "a", point: { x: Number.NaN, y: 0 } }
          ],
          edges: [{ id: "edge", from: "a", to: "missing", cost: 0 }]
        }
      },
      {
        type: "navigation.graph",
        pack: { id: "test", version: "1", entries: [] },
        path: "test"
      }
    );
    expect(diagnostics?.map((entry) => entry.code)).toEqual([
      "navigation.graph_duplicate_node",
      "navigation.graph_invalid_node_point",
      "navigation.graph_invalid_edge_nodes",
      "navigation.graph_invalid_edge_cost"
    ]);
  });
});

describe("Graph navigation backend", () => {
  it("uses deterministic shortest paths and reacts to blockers", () => {
    const backend = createGraphNavigationBackend({ graph: diamondGraph() });
    const first = backend.findPath(pathRequest("first", standardProfile));
    expect(first.status).toBe("complete");
    if (first.status !== "complete") {
      throw new Error("Expected complete graph path");
    }
    expect(first.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 }
    ]);
    expect(backend.snapshot().details?.routeFields).toBe(1);

    const changed = backend.updateObstacle?.({
      id: "block.upper",
      target: { kind: "edge", id: "edge.a-b" },
      blocked: true
    });
    expect(changed).toMatchObject({ status: "changed", revision: 1, invalidatedRouteFields: 1 });
    expect(changed).toMatchObject({
      invalidatedPathDependencies: [{ kind: "edge", id: "edge.a-b" }]
    });
    const alternate = backend.findPath(pathRequest("alternate", standardProfile));
    expect(alternate.status).toBe("complete");
    if (alternate.status === "complete") {
      expect(alternate.points[1]).toEqual({ x: 1, y: -1 });
    }
    backend.dispose();
    expect(backend.snapshot()).toMatchObject({ disposed: true, details: { routeFields: 0 } });
  });

  it("applies profile area filters and cost overrides", () => {
    const backend = createGraphNavigationBackend({ graph: diamondGraph() });
    const costlyMud: NavigationAgentProfileDefinition = {
      ...standardProfile,
      costOverrides: { mud: 10 }
    };
    const result = backend.findPath(pathRequest("cost", costlyMud));
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.points[1]).toEqual({ x: 1, y: -1 });
    }

    const roadOnly: NavigationAgentProfileDefinition = {
      id: "profile.road",
      radius: 0.5,
      allowedAreas: ["ground", "road"]
    };
    expect(backend.projectPoint({ x: 1, y: 0.8 }, roadOnly)?.backendNodeId).toBe("a");
    backend.dispose();
  });

  it("shares one goal-keyed reverse route field across many starts", () => {
    const graph = lineGraph(128);
    const backend = createGraphNavigationBackend({ graph, maxRouteFields: 4 });
    for (let index = 0; index < 1000; index += 1) {
      const start = index % 127;
      const result = backend.findPath({
        requestId: `path.${index}`,
        profile: standardProfile,
        start: { x: start, y: 0 },
        goal: { x: 127, y: 0 },
        goalKey: "shared-goal"
      });
      expect(result.status).toBe("complete");
    }
    expect(backend.snapshot().details).toMatchObject({ routeFields: 1, nodes: 128, edges: 127 });
    backend.dispose();
  });

  it("returns unreachable explicitly and invalidates only dependent route fields", () => {
    const backend = createGraphNavigationBackend({ graph: splitGraph() });
    const left = backend.findPath({
      requestId: "left",
      profile: standardProfile,
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 0 },
      goalKey: "left"
    });
    const right = backend.findPath({
      requestId: "right",
      profile: standardProfile,
      start: { x: 10, y: 0 },
      goal: { x: 11, y: 0 },
      goalKey: "right"
    });
    expect(left.status).toBe("complete");
    expect(right.status).toBe("complete");
    expect(backend.snapshot().details?.routeFields).toBe(2);
    expect(
      backend.updateObstacle?.({
        id: "block.left",
        target: { kind: "edge", id: "edge.left" },
        blocked: true
      })
    ).toMatchObject({ status: "changed", invalidatedRouteFields: 1 });
    expect(backend.snapshot().details?.routeFields).toBe(1);
    expect(
      backend.findPath({
        requestId: "left.blocked",
        profile: standardProfile,
        start: { x: 0, y: 0 },
        goal: { x: 1, y: 0 },
        goalKey: "left"
      })
    ).toMatchObject({ status: "failed", reason: "unreachable" });
    backend.dispose();
  });

  it("integrates with the Core scheduler, cache, and stale route contract", () => {
    const runtime = createNavigationRuntime({
      backend: createGraphNavigationBackend({ graph: diamondGraph() }),
      profiles: [standardProfile],
      maxRequestsPerTick: 4
    });
    const id = runtime.requestPath({
      id: "core.path",
      requesterId: "agent",
      profileId: standardProfile.id,
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      goalKey: "core"
    });
    runtime.update(16, 16);
    const result = runtime.poll(id);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") {
      throw new Error("Expected complete Core graph route");
    }
    expect(runtime.sampleRoute(result.path.routeId, { x: 0.5, y: 0.5 })).toMatchObject({
      status: "valid",
      nextPoint: { x: 1, y: 1 }
    });
    runtime.updateObstacle({
      id: "block",
      target: { kind: "edge", id: "edge.a-b" },
      blocked: true
    });
    expect(runtime.sampleRoute(result.path.routeId, { x: 0, y: 0 }).status).toBe("stale");
    runtime.dispose();
  });

  it("keeps independent Core cache entries and routes valid after partial invalidation", () => {
    const runtime = createNavigationRuntime({
      backend: createGraphNavigationBackend({ graph: splitGraph() }),
      profiles: [standardProfile],
      maxRequestsPerTick: 4
    });
    const leftId = runtime.requestPath(splitRequest("left.first", "left"));
    const rightId = runtime.requestPath(splitRequest("right.first", "right"));
    runtime.update(16, 16);
    const left = runtime.poll(leftId);
    const right = runtime.poll(rightId);
    expect(left.status).toBe("complete");
    expect(right.status).toBe("complete");
    if (left.status !== "complete" || right.status !== "complete") {
      throw new Error("Expected both split routes to complete");
    }

    runtime.updateObstacle({
      id: "block.left",
      target: { kind: "edge", id: "edge.left" },
      blocked: true
    });
    expect(runtime.sampleRoute(left.path.routeId, { x: 0, y: 0 }).status).toBe("stale");
    expect(runtime.sampleRoute(right.path.routeId, { x: 10, y: 0 })).toMatchObject({
      status: "valid",
      revision: 1
    });
    expect(runtime.snapshot()).toMatchObject({ cacheEntries: 1, revision: 1 });

    const rightCachedId = runtime.requestPath(splitRequest("right.cached", "right"));
    runtime.update(16, 32);
    expect(runtime.poll(rightCachedId)).toMatchObject({ status: "complete", cache: "hit" });
    runtime.dispose();
  });
});

function diamondGraph(): NavigationGraphDefinition {
  return {
    id: "graph.diamond",
    nodes: [
      { id: "a", point: { x: 0, y: 0 }, area: "ground" },
      { id: "b", point: { x: 1, y: 1 }, area: "mud" },
      { id: "c", point: { x: 1, y: -1 }, area: "road" },
      { id: "d", point: { x: 2, y: 0 }, area: "ground" }
    ],
    edges: [
      { id: "edge.a-b", from: "a", to: "b", area: "mud" },
      { id: "edge.b-d", from: "b", to: "d", area: "mud" },
      { id: "edge.a-c", from: "a", to: "c", area: "road" },
      { id: "edge.c-d", from: "c", to: "d", area: "road" }
    ]
  };
}

function lineGraph(nodes: number): NavigationGraphDefinition {
  return {
    id: "graph.line",
    nodes: Array.from({ length: nodes }, (_, index) => ({
      id: `node.${index}`,
      point: { x: index, y: 0 },
      area: "ground"
    })),
    edges: Array.from({ length: nodes - 1 }, (_, index) => ({
      id: `edge.${index}`,
      from: `node.${index}`,
      to: `node.${index + 1}`,
      area: "ground"
    }))
  };
}

function splitGraph(): NavigationGraphDefinition {
  return {
    id: "graph.split",
    nodes: [
      { id: "left.start", point: { x: 0, y: 0 }, area: "ground" },
      { id: "left.goal", point: { x: 1, y: 0 }, area: "ground" },
      { id: "right.start", point: { x: 10, y: 0 }, area: "ground" },
      { id: "right.goal", point: { x: 11, y: 0 }, area: "ground" }
    ],
    edges: [
      { id: "edge.left", from: "left.start", to: "left.goal", area: "ground" },
      { id: "edge.right", from: "right.start", to: "right.goal", area: "ground" }
    ]
  };
}

function pathRequest(id: string, profile: NavigationAgentProfileDefinition) {
  return {
    requestId: id,
    profile,
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 0 },
    goalKey: "goal"
  };
}

function splitRequest(id: string, side: "left" | "right") {
  const offset = side === "left" ? 0 : 10;
  return {
    id,
    requesterId: side,
    profileId: standardProfile.id,
    start: { x: offset, y: 0 },
    goal: { x: offset + 1, y: 0 },
    goalKey: side
  };
}
