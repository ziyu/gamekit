import type {
  PhysicsBodyState,
  PhysicsQuery,
  PhysicsQueryResult,
  PhysicsVector
} from "@gamekit/physics-core";
import type { CharacterMotorObservation, CompiledCharacterMotorDefinition } from "../contracts";

export type CharacterGroundProbeSimulation = {
  query(query: PhysicsQuery): PhysicsQueryResult[];
  body?(bodyId: string): PhysicsBodyState | undefined;
};

export type ObserveCharacterGroundOptions = {
  body: Readonly<PhysicsBodyState>;
  definition: CompiledCharacterMotorDefinition;
  simulation: CharacterGroundProbeSimulation;
  ignoreBodyIds?: readonly string[] | undefined;
  ignoreColliderIds?: readonly string[] | undefined;
  surfaceId?(hit: Readonly<PhysicsQueryResult>): string | undefined;
};

/** Produces a stable backend-neutral ground fact for the pure character motor. */
export function observeCharacterGround(
  options: ObserveCharacterGroundOptions
): CharacterMotorObservation {
  const probeLift = Math.min(
    options.definition.groundSnapDistance,
    options.definition.groundProbeDistance
  );
  const hits = options.simulation
    .query({
      type: "shape-cast",
      shape: {
        type: "capsule",
        radius: options.definition.capsuleRadius,
        height: Math.max(
          0.001,
          options.definition.capsuleHeight - options.definition.capsuleRadius * 2
        )
      },
      position: {
        ...cloneVector(options.body.position),
        y: options.body.position.y + probeLift
      },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: options.definition.groundProbeDistance + probeLift,
      stopAtPenetration: true,
      options: {
        triggerInteraction: "exclude",
        mode: "closest",
        sort: "distance",
        maxResults: 1,
        ignoreBodies: uniqueSorted([options.body.id, ...(options.ignoreBodyIds ?? [])]),
        ignoreColliders: uniqueSorted(options.ignoreColliderIds ?? [])
      }
    })
    .sort(compareHit);
  let rejectedQueryCount = 0;
  for (const hit of hits) {
    if (hit.sensor === true || !finiteVector(hit.normal)) {
      rejectedQueryCount += 1;
      continue;
    }
    const body = hit.bodyId === undefined ? undefined : options.simulation.body?.(hit.bodyId);
    return {
      ground: {
        distance: Math.max(0, finiteNonNegative(hit.distance) - probeLift),
        normal: cloneVector(hit.normal),
        bodyId: hit.bodyId,
        bodyLinearVelocity: body?.linearVelocity,
        surfaceId: options.surfaceId?.(hit) ?? hit.colliderId
      },
      queryCount: 1,
      rejectedQueryCount
    };
  }
  return {
    queryCount: 1,
    rejectedQueryCount
  };
}

function compareHit(left: PhysicsQueryResult, right: PhysicsQueryResult): number {
  const distance = finiteNonNegative(left.distance) - finiteNonNegative(right.distance);
  return distance === 0 ? left.colliderId.localeCompare(right.colliderId) : distance;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function finiteVector(value: PhysicsVector | undefined): value is PhysicsVector {
  return (
    value !== undefined &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    (value.z === undefined || Number.isFinite(value.z))
  );
}

function finiteNonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}

function cloneVector(value: Readonly<PhysicsVector>): PhysicsVector {
  return {
    x: value.x,
    y: value.y,
    ...(value.z === undefined ? {} : { z: value.z })
  };
}
