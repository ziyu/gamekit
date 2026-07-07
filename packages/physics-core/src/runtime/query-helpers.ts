import type {
  PhysicsBounds,
  PhysicsColliderId,
  PhysicsQueryOptions,
  PhysicsQueryResult,
  PhysicsRotation,
  PhysicsScene,
  PhysicsShapeDefinition,
  PhysicsVector
} from "./types";

export function queryPoint(
  scene: Pick<PhysicsScene, "query">,
  point: PhysicsVector,
  options?: PhysicsQueryOptions
): PhysicsQueryResult[] {
  return scene.query({
    type: "point",
    point,
    ...(options === undefined ? {} : { options })
  });
}

export function raycast(
  scene: Pick<PhysicsScene, "query">,
  origin: PhysicsVector,
  direction: PhysicsVector,
  options: PhysicsQueryOptions & { maxDistance?: number; solid?: boolean } = {}
): PhysicsQueryResult[] {
  const { maxDistance, solid, ...queryOptions } = options;
  return scene.query({
    type: "raycast",
    origin,
    direction,
    ...(maxDistance === undefined ? {} : { maxDistance }),
    ...(solid === undefined ? {} : { solid }),
    options: queryOptions
  });
}

export function shapeCast(
  scene: Pick<PhysicsScene, "query">,
  shape: PhysicsShapeDefinition,
  position: PhysicsVector,
  direction: PhysicsVector,
  options: PhysicsQueryOptions & {
    maxDistance?: number;
    rotation?: PhysicsRotation;
    stopAtPenetration?: boolean;
    targetDistance?: number;
  } = {}
): PhysicsQueryResult[] {
  const { maxDistance, rotation, stopAtPenetration, targetDistance, ...queryOptions } = options;
  return scene.query({
    type: "shape-cast",
    shape,
    position,
    direction,
    ...(maxDistance === undefined ? {} : { maxDistance }),
    ...(rotation === undefined ? {} : { rotation }),
    ...(stopAtPenetration === undefined ? {} : { stopAtPenetration }),
    ...(targetDistance === undefined ? {} : { targetDistance }),
    options: queryOptions
  });
}

export function overlapShape(
  scene: Pick<PhysicsScene, "query">,
  shape: PhysicsShapeDefinition,
  position: PhysicsVector,
  options: PhysicsQueryOptions & { rotation?: PhysicsRotation } = {}
): PhysicsQueryResult[] {
  const { rotation, ...queryOptions } = options;
  return scene.query({
    type: "overlap",
    shape,
    position,
    ...(rotation === undefined ? {} : { rotation }),
    options: queryOptions
  });
}

export function checkOverlap(
  scene: Pick<PhysicsScene, "query">,
  shape: PhysicsShapeDefinition,
  position: PhysicsVector,
  options: PhysicsQueryOptions & { rotation?: PhysicsRotation } = {}
): boolean {
  const { rotation, ...queryOptions } = options;
  return (
    scene.query({
      type: "check",
      shape,
      position,
      ...(rotation === undefined ? {} : { rotation }),
      options: { ...queryOptions, mode: "any", maxResults: 1 }
    }).length > 0
  );
}

export function checkCollision(
  scene: Pick<PhysicsScene, "query" | "getColliderState" | "getBodyState">,
  colliderId: PhysicsColliderId,
  options?: PhysicsQueryOptions
): boolean {
  const collider = scene.getColliderState(colliderId);
  if (!collider) {
    return false;
  }

  const bodyPosition =
    collider.bodyId === undefined ? undefined : scene.getBodyState(collider.bodyId)?.position;
  const position = addVectors(bodyPosition ?? { x: 0, y: 0 }, collider.offset?.position);

  return checkOverlap(scene, collider.shape, position ?? { x: 0, y: 0 }, {
    ...options,
    ignoreColliders: [...(options?.ignoreColliders ?? []), colliderId]
  });
}

export function queryBounds(
  scene: Pick<PhysicsScene, "query">,
  bounds: PhysicsBounds,
  options?: PhysicsQueryOptions
): PhysicsQueryResult[] {
  return scene.query({
    type: "bounds",
    bounds,
    ...(options === undefined ? {} : { options })
  });
}

function addVectors(base: PhysicsVector, offset: PhysicsVector | undefined): PhysicsVector {
  if (offset === undefined) {
    return base;
  }
  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
    ...(base.z === undefined && offset.z === undefined
      ? {}
      : { z: (base.z ?? 0) + (offset.z ?? 0) })
  };
}
