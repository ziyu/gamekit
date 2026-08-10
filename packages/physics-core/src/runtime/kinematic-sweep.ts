import type {
  PhysicsQueries,
  PhysicsQueryOptions,
  PhysicsQueryResult,
  PhysicsRotation,
  PhysicsShapeDefinition,
  PhysicsVector
} from "./types";

export type PhysicsKinematicSweepMode = "ray" | "shape";

export type PhysicsKinematicSweepQueries = Pick<PhysicsQueries, "raycast" | "shapeCast">;

export type PhysicsKinematicSweepStepOptions = {
  queries: PhysicsKinematicSweepQueries;
  mode: PhysicsKinematicSweepMode;
  position: PhysicsVector;
  velocity: PhysicsVector;
  deltaMs: number;
  shape?: PhysicsShapeDefinition | undefined;
  rotation?: PhysicsRotation | undefined;
  query?: PhysicsQueryOptions | undefined;
};

export type PhysicsKinematicSweepStepResult = {
  from: PhysicsVector;
  position: PhysicsVector;
  displacement: PhysicsVector;
  distance: number;
  hit?: PhysicsQueryResult | undefined;
};

/**
 * Advances one kinematic interval and resolves the earliest blocker through the
 * same Physics query facade used by authoritative gameplay.
 */
export function sweepPhysicsKinematicStep(
  options: PhysicsKinematicSweepStepOptions
): PhysicsKinematicSweepStepResult {
  assertFiniteVector(options.position, "position");
  assertFiniteVector(options.velocity, "velocity");
  if (!Number.isFinite(options.deltaMs) || options.deltaMs < 0) {
    throw new Error("Physics kinematic sweep deltaMs must be a non-negative finite number.");
  }
  if (options.mode === "shape" && options.shape === undefined) {
    throw new Error("Physics kinematic shape sweep requires a shape.");
  }

  const from = cloneVector(options.position);
  const seconds = options.deltaMs / 1000;
  const displacement = scaleVector(options.velocity, seconds);
  const distance = vectorLength(displacement);
  if (distance <= Number.EPSILON) {
    return {
      from,
      position: cloneVector(from),
      displacement,
      distance: 0
    };
  }

  const direction = scaleVector(displacement, 1 / distance);
  const query = cloneQueryOptions(options.query);
  const hits =
    options.mode === "shape"
      ? options.queries.shapeCast(options.shape!, from, direction, {
          ...query,
          maxDistance: distance,
          mode: "closest",
          sort: "distance",
          maxResults: 1,
          ...(options.rotation === undefined ? {} : { rotation: options.rotation })
        })
      : options.queries.raycast(from, direction, {
          ...query,
          maxDistance: distance,
          mode: "closest",
          sort: "distance",
          maxResults: 1
        });
  const hit = hits[0];
  if (hit === undefined) {
    return {
      from,
      position: addVectors(from, displacement),
      displacement,
      distance
    };
  }

  const hitDistance = resolveHitDistance(hit, distance);
  const position = hasHitDistance(hit)
    ? addVectors(from, scaleVector(direction, hitDistance))
    : hit.point === undefined
      ? addVectors(from, scaleVector(direction, hitDistance))
      : cloneVector(hit.point);
  return {
    from,
    position,
    displacement,
    distance,
    hit: cloneQueryResult(hit)
  };
}

function hasHitDistance(hit: PhysicsQueryResult): boolean {
  return (
    (hit.distance !== undefined && Number.isFinite(hit.distance)) ||
    (hit.fraction !== undefined && Number.isFinite(hit.fraction))
  );
}

function resolveHitDistance(hit: PhysicsQueryResult, maxDistance: number): number {
  if (hit.distance !== undefined && Number.isFinite(hit.distance)) {
    return Math.max(0, Math.min(maxDistance, hit.distance));
  }
  if (hit.fraction !== undefined && Number.isFinite(hit.fraction)) {
    return Math.max(0, Math.min(maxDistance, hit.fraction * maxDistance));
  }
  return maxDistance;
}

function cloneQueryOptions(options: PhysicsQueryOptions | undefined): PhysicsQueryOptions {
  if (options === undefined) {
    return {};
  }
  return {
    ...options,
    ...(options.filter === undefined
      ? {}
      : {
          filter: {
            ...options.filter,
            ...(options.filter.groups === undefined ? {} : { groups: [...options.filter.groups] }),
            ...(options.filter.collidesWith === undefined
              ? {}
              : { collidesWith: [...options.filter.collidesWith] })
          }
        }),
    ...(options.ignoreBodies === undefined ? {} : { ignoreBodies: [...options.ignoreBodies] }),
    ...(options.ignoreColliders === undefined
      ? {}
      : { ignoreColliders: [...options.ignoreColliders] }),
    ...(options.includeBodies === undefined ? {} : { includeBodies: [...options.includeBodies] }),
    ...(options.includeColliders === undefined
      ? {}
      : { includeColliders: [...options.includeColliders] })
  };
}

function cloneQueryResult(result: PhysicsQueryResult): PhysicsQueryResult {
  return {
    ...result,
    ...(result.point === undefined ? {} : { point: cloneVector(result.point) }),
    ...(result.normal === undefined ? {} : { normal: cloneVector(result.normal) })
  };
}

function cloneVector(vector: PhysicsVector): PhysicsVector {
  return {
    x: vector.x,
    y: vector.y,
    ...(vector.z === undefined ? {} : { z: vector.z })
  };
}

function scaleVector(vector: PhysicsVector, scalar: number): PhysicsVector {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    ...(vector.z === undefined ? {} : { z: vector.z * scalar })
  };
}

function addVectors(left: PhysicsVector, right: PhysicsVector): PhysicsVector {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    ...(left.z === undefined && right.z === undefined ? {} : { z: (left.z ?? 0) + (right.z ?? 0) })
  };
}

function vectorLength(vector: PhysicsVector): number {
  return Math.hypot(vector.x, vector.y, vector.z ?? 0);
}

function assertFiniteVector(vector: PhysicsVector, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    (vector.z !== undefined && !Number.isFinite(vector.z))
  ) {
    throw new Error(`Physics kinematic sweep ${label} must be finite.`);
  }
}
