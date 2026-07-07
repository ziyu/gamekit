import { defineGameModule, type GameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { ComponentDef, EntityId, GameWorld, WorldSystemContext } from "@gamekit/world";
import {
  PhysicsBodyComponent,
  PhysicsColliderComponent,
  PhysicsContactsComponent,
  PhysicsTransformComponent,
  PhysicsVelocityComponent,
  type PhysicsBodyComponentState,
  type PhysicsColliderComponentState,
  type PhysicsContactsComponentState,
  type PhysicsTransformComponentState,
  type PhysicsVelocityComponentState
} from "../components";
import type {
  PhysicsBackendAdapter,
  PhysicsBodyId,
  PhysicsColliderId,
  PhysicsContactEvent,
  PhysicsHandle,
  PhysicsScene,
  PhysicsSceneConfig,
  PhysicsTraceStore
} from "./types";
import { bindPhysicsHandle, unbindPhysicsHandle } from "./create-physics-handle";

export type PhysicsWorldBindings = {
  body?: ComponentDef<PhysicsBodyComponentState>;
  collider?: ComponentDef<PhysicsColliderComponentState>;
  transform?: ComponentDef<PhysicsTransformComponentState>;
  velocity?: ComponentDef<PhysicsVelocityComponentState>;
  contacts?: ComponentDef<PhysicsContactsComponentState>;
};

export type PhysicsEventPolicy = {
  emitContacts?: boolean;
};

export type PhysicsModuleOptions = {
  id?: string;
  backend: PhysicsBackendAdapter;
  scene?: PhysicsSceneConfig;
  fixedDeltaMs?: number;
  maxSubSteps?: number;
  bindings?: PhysicsWorldBindings;
  eventPolicy?: PhysicsEventPolicy;
  traceStore?: PhysicsTraceStore;
  handle?: PhysicsHandle;
};

type ResolvedPhysicsBindings = {
  body: ComponentDef<PhysicsBodyComponentState>;
  collider: ComponentDef<PhysicsColliderComponentState>;
  transform: ComponentDef<PhysicsTransformComponentState>;
  velocity: ComponentDef<PhysicsVelocityComponentState>;
  contacts: ComponentDef<PhysicsContactsComponentState>;
};

export function createPhysicsModule(options: PhysicsModuleOptions): GameModule<GameInstallContext> {
  const moduleId = options.id ?? "physics";
  const fixedDeltaMs = options.fixedDeltaMs ?? options.scene?.fixedDeltaMs ?? 1000 / 60;
  const maxSubSteps = options.maxSubSteps ?? 5;
  const bindings = resolveBindings(options.bindings);
  const emitContacts = options.eventPolicy?.emitContacts ?? true;
  let scene: PhysicsScene | undefined;
  let accumulator = 0;

  return defineGameModule<GameInstallContext>({
    id: moduleId,
    install(ctx: GameInstallContext) {
      const nextScene = options.backend.createScene(options.scene);
      try {
        if (options.handle !== undefined) {
          bindPhysicsHandle(options.handle, nextScene, moduleId);
        }
      } catch (error) {
        nextScene.dispose();
        throw error;
      }
      scene = nextScene;
      ctx.systems.register({
        id: `${moduleId}.step`,
        update(systemCtx: WorldSystemContext) {
          if (!scene) {
            return;
          }

          syncWorldToScene(systemCtx.world, scene, bindings);
          accumulator += systemCtx.delta;
          let subSteps = 0;
          while (accumulator >= fixedDeltaMs && subSteps < maxSubSteps) {
            const result = scene.step(fixedDeltaMs, {
              tick: systemCtx.tick,
              elapsed: systemCtx.elapsed
            });
            syncSceneToWorld(systemCtx.world, scene, bindings);
            const contacts = withContactEntities(result.contacts, systemCtx.world, bindings);
            writeContacts(systemCtx.world, contacts, bindings);
            if (emitContacts) {
              emitContactEvents(ctx, contacts);
            }
            for (const contact of contacts) {
              options.traceStore?.push({
                kind: "contact",
                tick: systemCtx.tick,
                elapsed: systemCtx.elapsed,
                label: `physics.${contact.kind}.${contact.phase}`,
                colliderId: contact.colliderA,
                ...(contact.entityA === undefined ? {} : { entityId: contact.entityA }),
                payload: {
                  colliderA: contact.colliderA,
                  colliderB: contact.colliderB,
                  bodyA: contact.bodyA,
                  bodyB: contact.bodyB,
                  entityA: contact.entityA,
                  entityB: contact.entityB,
                  sensor: contact.sensor
                }
              });
            }
            options.traceStore?.push({
              kind: "step",
              tick: systemCtx.tick,
              elapsed: systemCtx.elapsed,
              label: "physics.step",
              payload: {
                deltaMs: result.deltaMs,
                contactCount: contacts.length,
                diagnostics: result.diagnostics.length
              }
            });
            accumulator -= fixedDeltaMs;
            subSteps += 1;
          }

          if (subSteps === maxSubSteps && accumulator >= fixedDeltaMs) {
            accumulator = 0;
            options.traceStore?.push({
              kind: "diagnostic",
              tick: systemCtx.tick,
              elapsed: systemCtx.elapsed,
              label: "physics.max_sub_steps_exceeded",
              payload: { fixedDeltaMs, maxSubSteps }
            });
          }
        }
      });

      return {
        dispose() {
          if (options.handle !== undefined) {
            unbindPhysicsHandle(options.handle, moduleId);
          }
          scene?.dispose();
          scene = undefined;
          accumulator = 0;
        }
      };
    }
  });
}

function resolveBindings(bindings: PhysicsWorldBindings = {}): ResolvedPhysicsBindings {
  return {
    body: bindings.body ?? PhysicsBodyComponent,
    collider: bindings.collider ?? PhysicsColliderComponent,
    transform: bindings.transform ?? PhysicsTransformComponent,
    velocity: bindings.velocity ?? PhysicsVelocityComponent,
    contacts: bindings.contacts ?? PhysicsContactsComponent
  };
}

function syncWorldToScene(
  world: GameWorld,
  scene: PhysicsScene,
  bindings: ResolvedPhysicsBindings
): void {
  for (const entity of world.query([bindings.body])) {
    const body = world.get(entity, bindings.body);
    if (!body?.enabled) {
      continue;
    }

    const transform = world.get(entity, bindings.transform);
    const velocity = world.get(entity, bindings.velocity);
    let bodyId = body.bodyId;
    if (!bodyId || !scene.getBodyState(bodyId)) {
      bodyId = scene.createBody({
        ...body.definition,
        ...(body.definition.position !== undefined || transform === undefined
          ? {}
          : { position: transform.position }),
        ...(body.definition.rotation !== undefined || transform?.rotation === undefined
          ? {}
          : { rotation: transform.rotation }),
        ...(body.definition.linearVelocity !== undefined || velocity === undefined
          ? {}
          : { linearVelocity: velocity.linear }),
        ...(body.definition.angularVelocity !== undefined || velocity?.angular === undefined
          ? {}
          : { angularVelocity: velocity.angular })
      });
      world.set(entity, bindings.body, { bodyId });
    }

    const patch =
      body.syncFromWorld && transform
        ? {
            position: transform.position,
            ...(transform.rotation === undefined ? {} : { rotation: transform.rotation })
          }
        : {};
    const velocityPatch =
      body.syncVelocityFromWorld && velocity
        ? {
            linearVelocity: velocity.linear,
            ...(velocity.angular === undefined ? {} : { angularVelocity: velocity.angular })
          }
        : {};
    scene.updateBody(bodyId, { ...patch, ...velocityPatch });
  }

  for (const entity of world.query([bindings.collider])) {
    const collider = world.get(entity, bindings.collider);
    if (!collider?.enabled) {
      continue;
    }
    if (collider.colliderId && scene.getColliderState(collider.colliderId)) {
      scene.updateCollider(collider.colliderId, { enabled: true });
      continue;
    }

    const body = world.get(entity, bindings.body);
    const bodyId = collider.definition.bodyId ?? body?.bodyId;
    const colliderId = scene.createCollider({
      ...collider.definition,
      ...(bodyId === undefined ? {} : { bodyId })
    });
    world.set(entity, bindings.collider, { colliderId });
  }
}

function syncSceneToWorld(
  world: GameWorld,
  scene: PhysicsScene,
  bindings: ResolvedPhysicsBindings
): void {
  for (const entity of world.query([bindings.body])) {
    const body = world.get(entity, bindings.body);
    if (!body?.bodyId || !body.syncToWorld) {
      continue;
    }

    const state = scene.getBodyState(body.bodyId);
    if (!state) {
      continue;
    }

    if (world.get(entity, bindings.transform)) {
      world.set(entity, bindings.transform, {
        position: state.position,
        ...(state.rotation === undefined ? {} : { rotation: state.rotation })
      });
    } else {
      world.add(entity, bindings.transform, {
        position: state.position,
        ...(state.rotation === undefined ? {} : { rotation: state.rotation })
      });
    }

    if (world.get(entity, bindings.velocity)) {
      world.set(entity, bindings.velocity, {
        linear: state.linearVelocity,
        ...(state.angularVelocity === undefined ? {} : { angular: state.angularVelocity })
      });
    } else {
      world.add(entity, bindings.velocity, {
        linear: state.linearVelocity,
        ...(state.angularVelocity === undefined ? {} : { angular: state.angularVelocity })
      });
    }
  }
}

function withContactEntities(
  contacts: PhysicsContactEvent[],
  world: GameWorld,
  bindings: ResolvedPhysicsBindings
): PhysicsContactEvent[] {
  return contacts.map((contact) => ({
    ...contact,
    ...entityPatch("entityA", contact.bodyA, contact.colliderA, world, bindings),
    ...entityPatch("entityB", contact.bodyB, contact.colliderB, world, bindings)
  }));
}

function entityPatch(
  key: "entityA" | "entityB",
  bodyId: PhysicsBodyId | undefined,
  colliderId: PhysicsColliderId,
  world: GameWorld,
  bindings: ResolvedPhysicsBindings
): { entityA?: EntityId; entityB?: EntityId } {
  const entity = findEntityForPhysicsHandle(bodyId, colliderId, world, bindings);
  if (entity === undefined) {
    return {};
  }

  return key === "entityA" ? { entityA: entity } : { entityB: entity };
}

function findEntityForPhysicsHandle(
  bodyId: PhysicsBodyId | undefined,
  colliderId: PhysicsColliderId,
  world: GameWorld,
  bindings: ResolvedPhysicsBindings
): EntityId | undefined {
  for (const entity of world.query([bindings.collider])) {
    const collider = world.get(entity, bindings.collider);
    if (collider?.colliderId === colliderId) {
      return entity;
    }
  }

  if (bodyId !== undefined) {
    for (const entity of world.query([bindings.body])) {
      const body = world.get(entity, bindings.body);
      if (body?.bodyId === bodyId) {
        return entity;
      }
    }
  }

  return undefined;
}

function writeContacts(
  world: GameWorld,
  contacts: PhysicsContactEvent[],
  bindings: ResolvedPhysicsBindings
): void {
  const contactsByEntity = new Map<EntityId, PhysicsContactEvent[]>();
  for (const contact of contacts) {
    if (contact.entityA !== undefined) {
      contactsByEntity.set(contact.entityA, [
        ...(contactsByEntity.get(contact.entityA) ?? []),
        contact
      ]);
    }
    if (contact.entityB !== undefined) {
      contactsByEntity.set(contact.entityB, [
        ...(contactsByEntity.get(contact.entityB) ?? []),
        contact
      ]);
    }
  }

  for (const entity of world.query([bindings.contacts])) {
    if (!contactsByEntity.has(entity)) {
      world.set(entity, bindings.contacts, { contacts: [] });
    }
  }

  for (const [entity, entityContacts] of contactsByEntity.entries()) {
    if (world.get(entity, bindings.contacts)) {
      world.set(entity, bindings.contacts, { contacts: entityContacts });
    } else {
      world.add(entity, bindings.contacts, { contacts: entityContacts });
    }
  }
}

function emitContactEvents(ctx: GameInstallContext, contacts: PhysicsContactEvent[]): void {
  for (const contact of contacts) {
    ctx.eventBus.emit(`physics.${contact.kind}.${contact.phase}`, contact, "physics");
  }
}
