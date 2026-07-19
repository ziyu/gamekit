import type {
  NavigationAgentProfileDefinition,
  NavigationBackendAdapter,
  NavigationBackendPathRequest,
  NavigationBackendPathResult,
  NavigationPoint,
  NavigationProjection
} from "@gamekit/navigation-core";
import type {
  CreateGraphNavigationBackendOptions,
  NavigationGraphDefinition,
  NavigationGraphEdgeDefinition,
  NavigationGraphNodeDefinition
} from "./types";

type CompiledNode = NavigationGraphNodeDefinition & { point: NavigationPoint };

type EdgeState = {
  definition: NavigationGraphEdgeDefinition;
  blocked: boolean;
  costMultiplier: number;
};

type Arc = {
  edgeId: string;
  from: string;
  to: string;
  baseCost: number;
  area?: string | undefined;
};

type RouteField = {
  key: string;
  goalNodeId: string;
  revision: number;
  distances: Map<string, number>;
  nextByNode: Map<string, { nextNodeId: string; edgeId: string }>;
  treeEdgeIds: Set<string>;
};

type HeapEntry = {
  nodeId: string;
  distance: number;
};

export function createGraphNavigationBackend(
  options: CreateGraphNavigationBackendOptions
): NavigationBackendAdapter {
  const id = options.id ?? `navigation.graph.${options.graph.id}`;
  const maxRouteFields = positiveInteger(options.maxRouteFields, 128);
  const compiled = compileGraph(options.graph);
  const routeFields = new Map<string, RouteField>();
  let revision = 0;
  let disposed = false;

  return {
    id,
    revision: () => revision,
    projectPoint(point, profile) {
      if (disposed) {
        return undefined;
      }
      return projectPoint(point, profile, compiled.nodes, revision);
    },
    findPath(request) {
      if (disposed) {
        throw new Error("Graph navigation backend is disposed");
      }
      return findPath(request);
    },
    updateObstacle(update) {
      if (disposed || update.target.kind !== "edge") {
        return { status: "unsupported", revision };
      }
      const edge = compiled.edgeStates.get(update.target.id);
      if (edge === undefined) {
        return { status: "unsupported", revision };
      }
      if (
        update.costMultiplier !== undefined &&
        (!Number.isFinite(update.costMultiplier) || update.costMultiplier <= 0)
      ) {
        return { status: "unsupported", revision };
      }
      const nextBlocked = update.blocked ?? edge.blocked;
      const nextCostMultiplier = update.costMultiplier ?? edge.costMultiplier;
      if (nextBlocked === edge.blocked && nextCostMultiplier === edge.costMultiplier) {
        return { status: "unchanged", revision, invalidatedRouteFields: 0 };
      }
      const improvesRoute =
        (edge.blocked && !nextBlocked) || nextCostMultiplier < edge.costMultiplier;
      const previousFieldCount = routeFields.size;
      edge.blocked = nextBlocked;
      edge.costMultiplier = nextCostMultiplier;
      revision += 1;

      if (improvesRoute) {
        routeFields.clear();
      } else {
        for (const [key, field] of routeFields) {
          if (field.treeEdgeIds.has(update.target.id)) {
            routeFields.delete(key);
          } else {
            field.revision = revision;
          }
        }
      }
      return {
        status: "changed",
        revision,
        invalidatedRouteFields: previousFieldCount - routeFields.size,
        ...(improvesRoute
          ? { invalidateAllPaths: true }
          : { invalidatedPathDependencies: [{ ...update.target }] })
      };
    },
    snapshot() {
      let blockedEdges = 0;
      for (const edge of compiled.edgeStates.values()) {
        if (edge.blocked) {
          blockedEdges += 1;
        }
      }
      return {
        id,
        revision,
        disposed,
        details: {
          graphId: options.graph.id,
          nodes: compiled.nodes.size,
          edges: compiled.edgeStates.size,
          blockedEdges,
          routeFields: routeFields.size,
          maxRouteFields
        }
      };
    },
    dispose() {
      disposed = true;
      routeFields.clear();
      compiled.nodes.clear();
      compiled.edgeStates.clear();
      compiled.reverseAdjacency.clear();
    }
  };

  function findPath(request: NavigationBackendPathRequest): NavigationBackendPathResult {
    const startProjection = projectPoint(request.start, request.profile, compiled.nodes, revision);
    if (startProjection === undefined) {
      return { status: "failed", reason: "start-unprojectable" };
    }
    const goalProjection = projectPoint(request.goal, request.profile, compiled.nodes, revision);
    if (goalProjection === undefined) {
      return { status: "failed", reason: "goal-unprojectable" };
    }
    const startNodeId = startProjection.backendNodeId as string;
    const goalNodeId = goalProjection.backendNodeId as string;
    const key = routeFieldKey(request.profile, goalNodeId, request.goalKey);
    let field = routeFields.get(key);
    if (field === undefined || field.revision !== revision) {
      field = buildRouteField(
        key,
        goalNodeId,
        request.profile,
        revision,
        compiled.nodes,
        compiled.edgeStates,
        compiled.reverseAdjacency
      );
      retainRouteField(field);
    } else {
      routeFields.delete(key);
      routeFields.set(key, field);
    }
    const cost = field.distances.get(startNodeId);
    if (cost === undefined) {
      return { status: "failed", reason: "unreachable" };
    }
    if (request.maxCost !== undefined && cost > request.maxCost) {
      return { status: "failed", reason: "cost-limit" };
    }
    const points: NavigationPoint[] = [];
    const dependencies = new Set<string>();
    let current = startNodeId;
    points.push(clonePoint(compiled.nodes.get(current)?.point as NavigationPoint));
    let guard = 0;
    while (current !== goalNodeId && guard <= compiled.nodes.size) {
      const next = field.nextByNode.get(current);
      if (next === undefined) {
        return { status: "failed", reason: "unreachable" };
      }
      dependencies.add(next.edgeId);
      current = next.nextNodeId;
      const node = compiled.nodes.get(current);
      if (node === undefined) {
        return { status: "failed", reason: "unreachable" };
      }
      points.push(clonePoint(node.point));
      guard += 1;
    }
    if (current !== goalNodeId) {
      return { status: "failed", reason: "unreachable" };
    }
    return {
      status: "complete",
      points,
      cost,
      startProjection,
      goalProjection,
      dependencies: [...dependencies]
        .sort((left, right) => left.localeCompare(right))
        .map((edgeId) => ({ kind: "edge" as const, id: edgeId }))
    };
  }

  function retainRouteField(field: RouteField): void {
    routeFields.set(field.key, field);
    while (routeFields.size > maxRouteFields) {
      const oldest = routeFields.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      routeFields.delete(oldest);
    }
  }
}

function compileGraph(graph: NavigationGraphDefinition): {
  nodes: Map<string, CompiledNode>;
  edgeStates: Map<string, EdgeState>;
  reverseAdjacency: Map<string, Arc[]>;
} {
  if (!graph.id || graph.nodes.length === 0) {
    throw new Error("Navigation graph requires an id and at least one node");
  }
  const nodes = new Map<string, CompiledNode>();
  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!node.id || nodes.has(node.id) || !validPoint(node.point)) {
      throw new Error(`Navigation graph contains invalid node: ${node.id}`);
    }
    nodes.set(node.id, { ...node, point: clonePoint(node.point) });
  }
  const edgeStates = new Map<string, EdgeState>();
  const reverseAdjacency = new Map<string, Arc[]>();
  for (const nodeId of nodes.keys()) {
    reverseAdjacency.set(nodeId, []);
  }
  for (const edge of [...graph.edges].sort((left, right) => left.id.localeCompare(right.id))) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (
      !edge.id ||
      edgeStates.has(edge.id) ||
      from === undefined ||
      to === undefined ||
      from.id === to.id
    ) {
      throw new Error(`Navigation graph contains invalid edge: ${edge.id}`);
    }
    const baseCost = edge.cost ?? distance(from.point, to.point);
    if (!Number.isFinite(baseCost) || baseCost <= 0) {
      throw new Error(`Navigation graph edge cost must be positive: ${edge.id}`);
    }
    edgeStates.set(edge.id, {
      definition: { ...edge, ...(edge.tags === undefined ? {} : { tags: [...edge.tags] }) },
      blocked: edge.enabled === false,
      costMultiplier: 1
    });
    addReverseArc(reverseAdjacency, {
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      baseCost,
      ...(edge.area === undefined ? {} : { area: edge.area })
    });
    if (edge.bidirectional !== false) {
      addReverseArc(reverseAdjacency, {
        edgeId: edge.id,
        from: edge.to,
        to: edge.from,
        baseCost,
        ...(edge.area === undefined ? {} : { area: edge.area })
      });
    }
  }
  for (const arcs of reverseAdjacency.values()) {
    arcs.sort((left, right) =>
      left.edgeId === right.edgeId
        ? left.from.localeCompare(right.from)
        : left.edgeId.localeCompare(right.edgeId)
    );
  }
  return { nodes, edgeStates, reverseAdjacency };
}

function addReverseArc(reverseAdjacency: Map<string, Arc[]>, arc: Arc): void {
  reverseAdjacency.get(arc.to)?.push(arc);
}

function projectPoint(
  point: NavigationPoint,
  profile: NavigationAgentProfileDefinition,
  nodes: Map<string, CompiledNode>,
  revision: number
): NavigationProjection | undefined {
  let best: CompiledNode | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes.values()) {
    if (!areaAllowed(node.area, profile)) {
      continue;
    }
    const candidateDistance = distance(point, node.point);
    if (
      candidateDistance < bestDistance ||
      (candidateDistance === bestDistance &&
        best !== undefined &&
        node.id.localeCompare(best.id) < 0)
    ) {
      best = node;
      bestDistance = candidateDistance;
    }
  }
  if (best === undefined) {
    return undefined;
  }
  return {
    point: clonePoint(best.point),
    backendNodeId: best.id,
    ...(best.area === undefined ? {} : { area: best.area }),
    distance: bestDistance,
    revision
  };
}

function buildRouteField(
  key: string,
  goalNodeId: string,
  profile: NavigationAgentProfileDefinition,
  revision: number,
  nodes: Map<string, CompiledNode>,
  edgeStates: Map<string, EdgeState>,
  reverseAdjacency: Map<string, Arc[]>
): RouteField {
  const distances = new Map<string, number>([[goalNodeId, 0]]);
  const nextByNode = new Map<string, { nextNodeId: string; edgeId: string }>();
  const treeEdgeIds = new Set<string>();
  const heap = new MinHeap();
  heap.push({ nodeId: goalNodeId, distance: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === undefined || current.distance !== distances.get(current.nodeId)) {
      continue;
    }
    for (const arc of reverseAdjacency.get(current.nodeId) ?? []) {
      const edge = edgeStates.get(arc.edgeId);
      const fromNode = nodes.get(arc.from);
      const toNode = nodes.get(arc.to);
      if (
        edge === undefined ||
        edge.blocked ||
        fromNode === undefined ||
        toNode === undefined ||
        !areaAllowed(fromNode.area, profile) ||
        !areaAllowed(toNode.area, profile) ||
        !areaAllowed(arc.area, profile)
      ) {
        continue;
      }
      const area = arc.area ?? toNode.area ?? fromNode.area;
      const areaCost = area === undefined ? 1 : (profile.costOverrides?.[area] ?? 1);
      const candidate = current.distance + arc.baseCost * edge.costMultiplier * areaCost;
      const previous = distances.get(arc.from);
      const previousNext = nextByNode.get(arc.from);
      const improves =
        previous === undefined ||
        candidate < previous ||
        (candidate === previous &&
          (previousNext === undefined ||
            arc.edgeId.localeCompare(previousNext.edgeId) < 0 ||
            (arc.edgeId === previousNext.edgeId &&
              arc.to.localeCompare(previousNext.nextNodeId) < 0)));
      if (!improves) {
        continue;
      }
      distances.set(arc.from, candidate);
      nextByNode.set(arc.from, { nextNodeId: arc.to, edgeId: arc.edgeId });
      heap.push({ nodeId: arc.from, distance: candidate });
    }
  }
  for (const next of nextByNode.values()) {
    treeEdgeIds.add(next.edgeId);
  }
  return { key, goalNodeId, revision, distances, nextByNode, treeEdgeIds };
}

function routeFieldKey(
  profile: NavigationAgentProfileDefinition,
  goalNodeId: string,
  goalKey: string | undefined
): string {
  const areas = [...(profile.allowedAreas ?? [])].sort().join(",");
  const costs = Object.entries(profile.costOverrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([area, cost]) => `${area}:${cost}`)
    .join(",");
  return `${profile.id}|${profile.radius}|${areas}|${costs}|${goalKey ?? goalNodeId}|${goalNodeId}`;
}

function areaAllowed(area: string | undefined, profile: NavigationAgentProfileDefinition): boolean {
  return (
    area === undefined ||
    profile.allowedAreas === undefined ||
    profile.allowedAreas.length === 0 ||
    profile.allowedAreas.includes(area)
  );
}

class MinHeap {
  private readonly entries: HeapEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(entry: HeapEntry): void {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentEntry = this.entries[parent] as HeapEntry;
      if (compareHeap(parentEntry, entry) <= 0) {
        break;
      }
      this.entries[index] = parentEntry;
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): HeapEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (first === undefined || last === undefined || this.entries.length === 0) {
      return first;
    }
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) {
        break;
      }
      let child = left;
      if (
        right < this.entries.length &&
        compareHeap(this.entries[right] as HeapEntry, this.entries[left] as HeapEntry) < 0
      ) {
        child = right;
      }
      const childEntry = this.entries[child] as HeapEntry;
      if (compareHeap(last, childEntry) <= 0) {
        break;
      }
      this.entries[index] = childEntry;
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

function compareHeap(left: HeapEntry, right: HeapEntry): number {
  return left.distance === right.distance
    ? left.nodeId.localeCompare(right.nodeId)
    : left.distance - right.distance;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error("Graph navigation maxRouteFields must be a positive integer");
  }
  return resolved;
}

function validPoint(point: NavigationPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (point.z === undefined || Number.isFinite(point.z))
  );
}

function distance(left: NavigationPoint, right: NavigationPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function clonePoint(point: NavigationPoint): NavigationPoint {
  return { x: point.x, y: point.y, ...(point.z === undefined ? {} : { z: point.z }) };
}
