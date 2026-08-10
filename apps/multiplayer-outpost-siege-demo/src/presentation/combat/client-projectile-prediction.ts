import {
  cloneCombatKinematicProjectileRecord,
  createCombatKinematicProjectileRecordBuffer,
  createCombatKinematicProjectileRuntime,
  type CombatKinematicProjectileRecord,
  type CombatKinematicProjectileSample,
  type CombatProjectileDefinition
} from "@gamekit/combat";
import { createStandardCombatKinematicProjectilePresentationTransition } from "@gamekit/app-host";
import type { DataRegistry } from "@gamekit/data";
import {
  createMultiplayerAuthorityTimeline,
  createMultiplayerPredictedSpawnRegistry
} from "@gamekit/multiplayer-core";
import {
  createPhysicsLayoutDefinitions,
  raycast as raycastPhysicsScene,
  shapeCast as shapeCastPhysicsScene,
  type PhysicsBackendAdapter,
  type PhysicsBodyData,
  type PhysicsColliderData,
  type PhysicsKinematicSweepQueries,
  type PhysicsScene
} from "@gamekit/physics-core";

import {
  createOutpostArenaPhysicsSceneConfig,
  OUTPOST_ARENA_PHYSICS_LAYOUT_ID
} from "../../content";
import {
  OUTPOST_BUILDABLE_TYPE,
  OUTPOST_ENEMY_TYPE,
  OUTPOST_PLAYER_TYPE,
  type OutpostBuildableDefinition,
  type OutpostEnemyDefinition,
  type OutpostPlayerDefinition,
  type OutpostReplicatedActor
} from "../../domain";
import {
  OUTPOST_PROJECTILE_FIXED_DELTA_MS,
  OUTPOST_PROJECTILE_RECORD_LIMIT,
  OUTPOST_RIFLE_PROJECTILE_DEFINITION_ID,
  OUTPOST_RIFLE_PROJECTILE_DEFINITION_VERSION,
  outpostRifleProjectileFirePosition,
  resolveOutpostRifleKinematicProjectileDefinition
} from "../../gameplay/rifle-projectile-network";

export type OutpostProjectilePredictionFrame = {
  generation: string;
  authorityElapsedMs: number;
  actors: readonly OutpostReplicatedActor[];
  records: readonly CombatKinematicProjectileRecord[];
};

export type OutpostClientProjectilePrediction = {
  sync(frame: OutpostProjectilePredictionFrame | undefined, elapsed: number): void;
  anticipate(input: {
    correlationId: string;
    position: { x: number; y: number };
    aim: { x: number; y: number };
    elapsed: number;
  }): CombatKinematicProjectileRecord | undefined;
  cancel(correlationId: string, elapsed: number, reason?: string): void;
  sample(projectileId: string, elapsed: number): CombatKinematicProjectileSample | undefined;
  listAuthoritySamples(elapsed: number): Array<{
    record: CombatKinematicProjectileRecord;
    sample: CombatKinematicProjectileSample;
  }>;
  correlationId(projectileId: string): string | undefined;
  hasLocalPrediction(projectileId: string): boolean;
  diagnostics(): OutpostClientProjectilePredictionDiagnostics;
  dispose(): void;
};

export type OutpostClientProjectilePredictionDiagnostics = {
  authorityTick: number;
  preventedTimelineRewinds: number;
  acceptedAuthorityTimelines: number;
  correctedTrajectories: number;
  activeCorrections: number;
  lastAuthorityFireTickOffset?: number | undefined;
};

type ActorProxy = {
  signature: string;
  bodyId: string;
  colliderIds: string[];
};

type ProjectileSpawnBinding = {
  authorityProjectileId: string;
  predictedProjectileId?: string | undefined;
};

const UNBOUND_GENERATION = "outpost.unbound";
const OUTPOST_PROJECTILE_SPAWN_KIND = "combat.kinematic-projectile";
const LOCAL_FIRE_POSITION_TOLERANCE = 32;
const LOCAL_FIRE_SPEED_TOLERANCE = 1;
const LOCAL_FIRE_DIRECTION_TOLERANCE_RADIANS = (4 * Math.PI) / 180;
const MIN_TRAJECTORY_CORRECTION_MS = 100;
const MAX_TRAJECTORY_CORRECTION_MS = 260;
const REMOTE_PROJECTILE_PRESENTATION_DELAY_MS = 100;

export function createOutpostClientProjectilePrediction(options: {
  dataRegistry: DataRegistry;
  physicsBackend: PhysicsBackendAdapter;
  id: string;
}): OutpostClientProjectilePrediction {
  const scene = createPredictionScene(options);
  const queries: PhysicsKinematicSweepQueries = {
    raycast(origin, direction, query) {
      return raycastPhysicsScene(scene, origin, direction, query);
    },
    shapeCast(shape, position, direction, query) {
      return shapeCastPhysicsScene(scene, shape, position, direction, query);
    }
  };
  const actorProxies = new Map<string, ActorProxy>();
  const actorIdByColliderId = new Map<string, string>();
  const predictedIdByCorrelation = new Map<string, string>();
  const spawnBindings = new Map<string, ProjectileSpawnBinding>();
  const authorityTimeline = createMultiplayerAuthorityTimeline({
    stepMs: OUTPOST_PROJECTILE_FIXED_DELTA_MS
  });
  const spawnRegistry = createMultiplayerPredictedSpawnRegistry<
    CombatKinematicProjectileRecord,
    CombatKinematicProjectileRecord
  >({
    generation: UNBOUND_GENERATION,
    maxPending: 16,
    maxResolved: OUTPOST_PROJECTILE_RECORD_LIMIT,
    maxAgeTicks: Math.ceil(1_000 / OUTPOST_PROJECTILE_FIXED_DELTA_MS),
    clonePredicted: cloneCombatKinematicProjectileRecord,
    cloneAuthority: cloneCombatKinematicProjectileRecord
  });
  const presentationTransition = createStandardCombatKinematicProjectilePresentationTransition({
    reconciliation: {
      timeline: "shot-relative",
      firePositionTolerance: LOCAL_FIRE_POSITION_TOLERANCE,
      fireSpeedTolerance: LOCAL_FIRE_SPEED_TOLERANCE,
      fireDirectionToleranceRadians: LOCAL_FIRE_DIRECTION_TOLERANCE_RADIANS,
      finishPositionTolerance: LOCAL_FIRE_POSITION_TOLERANCE,
      finishTickTolerance: 2
    },
    minCorrectionMs: MIN_TRAJECTORY_CORRECTION_MS,
    maxCorrectionMs: MAX_TRAJECTORY_CORRECTION_MS,
    maxEntries: OUTPOST_PROJECTILE_RECORD_LIMIT
  });
  const authorityRecords = createCombatKinematicProjectileRecordBuffer({
    generation: UNBOUND_GENERATION,
    capacity: OUTPOST_PROJECTILE_RECORD_LIMIT
  });
  const localRuntime = createCombatKinematicProjectileRuntime({
    queries,
    generation: UNBOUND_GENERATION,
    fixedDeltaMs: OUTPOST_PROJECTILE_FIXED_DELTA_MS,
    maxActiveProjectiles: 16,
    maxRecords: OUTPOST_PROJECTILE_RECORD_LIMIT,
    maxCatchUpTicksPerAdvance: 12,
    resolveDefinition(definitionId, definitionVersion) {
      return resolveOutpostRifleKinematicProjectileDefinition(
        options.dataRegistry,
        definitionId,
        definitionVersion
      );
    },
    resolveSubject(hit) {
      const actorId = actorIdByColliderId.get(hit.colliderId);
      return actorId === undefined
        ? {
            ...(hit.bodyId === undefined ? {} : { bodyId: hit.bodyId }),
            colliderId: hit.colliderId
          }
        : {
            actorId,
            ...(hit.bodyId === undefined ? {} : { bodyId: hit.bodyId }),
            colliderId: hit.colliderId
          };
    }
  });
  let generation = UNBOUND_GENERATION;
  let disposed = false;

  return {
    sync(frame, elapsed) {
      assertActive();
      if (frame === undefined) {
        return;
      }
      if (frame.generation !== generation) {
        generation = frame.generation;
        localRuntime.reset(generation);
        authorityRecords.reset(generation);
        authorityTimeline.reset();
        spawnRegistry.reset(generation);
        presentationTransition.reset();
        predictedIdByCorrelation.clear();
        spawnBindings.clear();
      }
      authorityTimeline.sync(frame.authorityElapsedMs, elapsed);
      syncActorProxies(frame.actors);
      scene.step(0);
      authorityRecords.reset(generation);
      const authorityRecordIds = new Set<string>();
      for (const record of frame.records) {
        if (String(record.generation) === generation) {
          authorityRecordIds.add(record.projectileId);
          authorityRecords.upsert(record);
          matchAuthoritySpawn(record);
        }
      }
      pruneSpawnBindings(authorityRecordIds);
      expirePredictedSpawns(authorityTimelineTick(elapsed));
      prunePredictedCorrelationIds();
      localRuntime.advanceTo(authorityTimelineTick(elapsed));
    },
    anticipate(input) {
      assertActive();
      if (generation === UNBOUND_GENERATION) {
        return undefined;
      }
      const direction = normalizedDirection({
        x: input.aim.x - input.position.x,
        y: input.aim.y - input.position.y
      });
      if (direction === undefined) {
        return undefined;
      }
      const projectile = options.dataRegistry.getValue<CombatProjectileDefinition>(
        "combat.projectile",
        OUTPOST_RIFLE_PROJECTILE_DEFINITION_ID
      );
      const origin = outpostRifleProjectileFirePosition(input.position, direction);
      const projectileId = `${input.correlationId}.projectile`;
      const result = localRuntime.fire({
        projectileId,
        correlationId: input.correlationId,
        generation,
        definitionId: OUTPOST_RIFLE_PROJECTILE_DEFINITION_ID,
        definitionVersion: OUTPOST_RIFLE_PROJECTILE_DEFINITION_VERSION,
        fireTick: authorityTimelineTick(input.elapsed),
        firePosition: origin,
        fireVelocity: {
          x: direction.x * (projectile.speed ?? 0),
          y: direction.y * (projectile.speed ?? 0)
        }
      });
      if (result.record !== undefined) {
        const registered = spawnRegistry.register({
          kind: OUTPOST_PROJECTILE_SPAWN_KIND,
          correlationId: input.correlationId,
          generation,
          localId: projectileId,
          tick: result.record.fireTick,
          value: result.record
        });
        if (registered.status === "registered" || registered.status === "duplicate") {
          predictedIdByCorrelation.delete(input.correlationId);
          predictedIdByCorrelation.set(input.correlationId, projectileId);
          trimCorrelationMap(predictedIdByCorrelation);
        }
        if (registered.evicted !== undefined) {
          predictedIdByCorrelation.delete(registered.evicted.correlationId);
          localRuntime.cancel(
            registered.evicted.localId,
            authorityTimelineTick(input.elapsed),
            "prediction-capacity"
          );
        }
      }
      return result.record;
    },
    cancel(correlationId, elapsed, reason = "rejected") {
      assertActive();
      spawnRegistry.reject(
        { kind: OUTPOST_PROJECTILE_SPAWN_KIND, correlationId, generation },
        reason
      );
      const projectileId = predictedIdByCorrelation.get(correlationId);
      if (projectileId !== undefined) {
        localRuntime.cancel(projectileId, authorityTimelineTick(elapsed), reason);
      }
    },
    sample(projectileId, elapsed) {
      assertActive();
      return sampleProjectile(projectileId, elapsed);
    },
    listAuthoritySamples(elapsed) {
      assertActive();
      return authorityRecords.list().flatMap((record) => {
        const sample = sampleProjectile(record.projectileId, elapsed);
        return sample === undefined ? [] : [{ record, sample }];
      });
    },
    correlationId(projectileId) {
      assertActive();
      const direct =
        localRuntime.getRecord(projectileId)?.correlationId ??
        authorityRecords.get(projectileId)?.correlationId;
      if (direct !== undefined) {
        return direct;
      }
      for (const [correlationId, predictedId] of predictedIdByCorrelation) {
        if (predictedId === projectileId) {
          return correlationId;
        }
      }
      return undefined;
    },
    hasLocalPrediction(projectileId) {
      assertActive();
      if (localRuntime.getRecord(projectileId) !== undefined) {
        return true;
      }
      const correlationId = authorityRecords.get(projectileId)?.correlationId;
      return (
        correlationId !== undefined &&
        localRuntime.getRecord(predictedIdByCorrelation.get(correlationId) ?? "") !== undefined
      );
    },
    diagnostics() {
      assertActive();
      const timelineDiagnostics = authorityTimeline.diagnostics();
      const transitionDiagnostics = presentationTransition.diagnostics();
      return {
        authorityTick: timelineDiagnostics.authorityTick,
        preventedTimelineRewinds: timelineDiagnostics.preventedRewinds,
        acceptedAuthorityTimelines: transitionDiagnostics.confirmedTrajectories,
        correctedTrajectories: transitionDiagnostics.correctedTrajectories,
        activeCorrections: transitionDiagnostics.activeCorrections,
        ...(transitionDiagnostics.lastFireTickOffset === undefined
          ? {}
          : { lastAuthorityFireTickOffset: transitionDiagnostics.lastFireTickOffset })
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const objectId of actorProxies.keys()) {
        removeActorProxy(objectId);
      }
      localRuntime.dispose();
      authorityRecords.dispose();
      spawnRegistry.dispose();
      presentationTransition.dispose();
      predictedIdByCorrelation.clear();
      spawnBindings.clear();
      scene.dispose();
    }
  };

  function authorityTimelineTick(elapsed: number): number {
    return authorityTimeline.tick(elapsed);
  }

  function sampleProjectile(
    projectileId: string,
    elapsed: number
  ): CombatKinematicProjectileSample | undefined {
    let predicted = localRuntime.getRecord(projectileId);
    let authoritative = authorityRecords.get(projectileId);
    const correlationId = predicted?.correlationId ?? authoritative?.correlationId;
    if (correlationId !== undefined) {
      const binding = spawnBindings.get(correlationId);
      predicted ??= localRuntime.getRecord(
        binding?.predictedProjectileId ??
          predictedIdByCorrelation.get(correlationId) ??
          projectileId
      );
      authoritative ??= authorityRecords.get(binding?.authorityProjectileId ?? projectileId);
    }
    const presentationTick = Math.max(
      0,
      authorityTimeline.sampleTick(elapsed) -
        (predicted === undefined
          ? REMOTE_PROJECTILE_PRESENTATION_DELAY_MS / OUTPOST_PROJECTILE_FIXED_DELTA_MS
          : 0)
    );
    return presentationTransition.sample({
      ...(predicted === undefined ? {} : { predicted }),
      ...(authoritative === undefined ? {} : { authoritative }),
      authorityTick: presentationTick,
      elapsedMs: elapsed
    });
  }

  function matchAuthoritySpawn(record: CombatKinematicProjectileRecord): void {
    const existing = spawnBindings.get(record.correlationId);
    if (existing?.authorityProjectileId === record.projectileId) {
      return;
    }
    if (existing !== undefined) {
      presentationTransition.remove(generation, record.correlationId);
    }
    const match = spawnRegistry.match({
      kind: OUTPOST_PROJECTILE_SPAWN_KIND,
      correlationId: record.correlationId,
      generation,
      authorityId: record.projectileId,
      tick: record.fireTick,
      value: record
    });
    if (match.status === "stale-generation") {
      return;
    }
    const predictedProjectileId =
      match.predicted?.localId ?? predictedIdByCorrelation.get(record.correlationId);
    spawnBindings.delete(record.correlationId);
    spawnBindings.set(record.correlationId, {
      authorityProjectileId: record.projectileId,
      ...(predictedProjectileId === undefined ? {} : { predictedProjectileId })
    });
    trimCorrelationMap(spawnBindings);
  }

  function pruneSpawnBindings(authorityRecordIds: ReadonlySet<string>): void {
    for (const [correlationId, binding] of spawnBindings) {
      if (!authorityRecordIds.has(binding.authorityProjectileId)) {
        spawnBindings.delete(correlationId);
        presentationTransition.remove(generation, correlationId);
      }
    }
    trimCorrelationMap(spawnBindings);
  }

  function expirePredictedSpawns(tick: number): void {
    for (const expired of spawnRegistry.expire(tick)) {
      predictedIdByCorrelation.delete(expired.correlationId);
      localRuntime.cancel(expired.localId, tick, "prediction-timeout");
      presentationTransition.remove(generation, expired.correlationId);
    }
  }

  function prunePredictedCorrelationIds(): void {
    for (const [correlationId, projectileId] of predictedIdByCorrelation) {
      if (localRuntime.getRecord(projectileId) === undefined) {
        predictedIdByCorrelation.delete(correlationId);
      }
    }
    trimCorrelationMap(predictedIdByCorrelation);
  }

  function syncActorProxies(actors: readonly OutpostReplicatedActor[]): void {
    const desired = new Set<string>();
    for (const actor of actors) {
      if (actor.kind !== "enemy" || actor.health <= 0) {
        continue;
      }
      desired.add(actor.objectId);
      const signature = `${actor.networkEntityId}:${actor.generation}:${actor.definitionId}`;
      const current = actorProxies.get(actor.objectId);
      if (current?.signature !== signature) {
        if (current !== undefined) {
          removeActorProxy(actor.objectId);
        }
        createActorProxy(actor, signature);
      } else {
        scene.updateBody(current.bodyId, {
          position: { x: actor.x, y: actor.y },
          rotation: actor.facing
        });
      }
    }
    for (const objectId of actorProxies.keys()) {
      if (!desired.has(objectId)) {
        removeActorProxy(objectId);
      }
    }
  }

  function createActorProxy(actor: OutpostReplicatedActor, signature: string): void {
    const bodyData = resolveActorBody(options.dataRegistry, actor);
    const bodyId = `outpost.client-projectile.actor.${safeId(actor.objectId)}.body`;
    const { id: _id, colliders: _colliders, tags: _tags, ...body } = bodyData;
    scene.createBody({
      ...body,
      id: bodyId,
      kind: "kinematic",
      position: { x: actor.x, y: actor.y },
      rotation: actor.facing,
      linearVelocity: { x: 0, y: 0 },
      userData: { ...body.userData, outpostObjectId: actor.objectId }
    });
    const colliderIds: string[] = [];
    try {
      for (const [index, colliderRef] of (bodyData.colliders ?? []).entries()) {
        const colliderData = options.dataRegistry.getValue<PhysicsColliderData>(
          colliderRef.type,
          colliderRef.id
        );
        const colliderId = `outpost.client-projectile.actor.${safeId(actor.objectId)}.${index}.collider`;
        const { id: _colliderId, bodyId: _bodyId, tags: _colliderTags, ...collider } = colliderData;
        scene.createCollider({
          ...collider,
          id: colliderId,
          bodyId,
          userData: { ...collider.userData, outpostObjectId: actor.objectId }
        });
        colliderIds.push(colliderId);
        actorIdByColliderId.set(colliderId, actor.objectId);
      }
      actorProxies.set(actor.objectId, { signature, bodyId, colliderIds });
    } catch (error) {
      for (const colliderId of colliderIds) {
        actorIdByColliderId.delete(colliderId);
        scene.destroyCollider(colliderId);
      }
      scene.destroyBody(bodyId);
      throw error;
    }
  }

  function removeActorProxy(objectId: string): void {
    const proxy = actorProxies.get(objectId);
    if (proxy === undefined) {
      return;
    }
    actorProxies.delete(objectId);
    for (const colliderId of proxy.colliderIds) {
      actorIdByColliderId.delete(colliderId);
      scene.destroyCollider(colliderId);
    }
    scene.destroyBody(proxy.bodyId);
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Outpost client projectile prediction is disposed.");
    }
  }
}

function createPredictionScene(options: {
  dataRegistry: DataRegistry;
  physicsBackend: PhysicsBackendAdapter;
  id: string;
}): PhysicsScene {
  const sceneConfig = createOutpostArenaPhysicsSceneConfig(options.dataRegistry);
  const scene = options.physicsBackend.createScene({
    ...sceneConfig,
    id: `outpost.client-projectile.${safeId(options.id)}`,
    fixedDeltaMs: OUTPOST_PROJECTILE_FIXED_DELTA_MS
  });
  const layout = createPhysicsLayoutDefinitions({
    dataRegistry: options.dataRegistry,
    layoutId: OUTPOST_ARENA_PHYSICS_LAYOUT_ID,
    idPrefix: `outpost.client-projectile.${safeId(options.id)}.arena`
  });
  try {
    for (const body of layout.bodies) {
      if (body.enabled) {
        scene.createBody({
          ...body.definition,
          position: body.position,
          ...(body.rotation === undefined ? {} : { rotation: body.rotation })
        });
      }
    }
    for (const collider of layout.colliders) {
      if (collider.enabled) {
        scene.createCollider(collider.definition);
      }
    }
    scene.step(0);
    return scene;
  } catch (error) {
    scene.dispose();
    throw error;
  }
}

function resolveActorBody(
  dataRegistry: DataRegistry,
  actor: OutpostReplicatedActor
): PhysicsBodyData {
  const ref =
    actor.kind === "player"
      ? dataRegistry.getValue<OutpostPlayerDefinition>(OUTPOST_PLAYER_TYPE, actor.definitionId)
          .physicsBody
      : actor.kind === "enemy"
        ? dataRegistry.getValue<OutpostEnemyDefinition>(OUTPOST_ENEMY_TYPE, actor.definitionId)
            .physicsBody
        : dataRegistry.getValue<OutpostBuildableDefinition>(
            OUTPOST_BUILDABLE_TYPE,
            actor.definitionId
          ).physicsBody;
  return dataRegistry.getValue<PhysicsBodyData>(ref.type, ref.id);
}

function normalizedDirection(vector: {
  x: number;
  y: number;
}): { x: number; y: number } | undefined {
  const length = Math.hypot(vector.x, vector.y);
  return length <= Number.EPSILON ? undefined : { x: vector.x / length, y: vector.y / length };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function trimCorrelationMap<TValue>(values: Map<string, TValue>): void {
  while (values.size > OUTPOST_PROJECTILE_RECORD_LIMIT) {
    const oldest = values.keys().next().value as string | undefined;
    if (oldest === undefined) {
      return;
    }
    values.delete(oldest);
  }
}
