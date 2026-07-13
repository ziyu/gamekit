import { defineGameModule, type GameModule } from "@gamekit/core";
import type { DataRegistry } from "@gamekit/data";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { ComponentDef, EntityId, GameWorld } from "@gamekit/world";
import {
  PhysicsBodyComponent,
  PhysicsColliderComponent,
  PhysicsTransformComponent,
  type PhysicsBodyComponentState,
  type PhysicsColliderComponentState,
  type PhysicsTransformComponentState
} from "../components";
import type {
  PhysicsBodyData,
  PhysicsBodyDefinition,
  PhysicsColliderData,
  PhysicsColliderDefinition,
  PhysicsLayoutBodyInstanceData,
  PhysicsLayoutColliderInstanceData,
  PhysicsLayoutData
} from "./types";

export type PhysicsLayoutWorldBindings = {
  body?: ComponentDef<PhysicsBodyComponentState>;
  collider?: ComponentDef<PhysicsColliderComponentState>;
  transform?: ComponentDef<PhysicsTransformComponentState>;
};

export type PhysicsLayoutBodyMaterialization = {
  instanceId: string;
  entityId: EntityId;
  bodyId: string;
};

export type PhysicsLayoutColliderMaterialization = {
  instanceId: string;
  bodyInstanceId: string;
  entityId: EntityId;
  colliderId: string;
};

export type PhysicsLayoutMaterialization = {
  layoutId: string;
  bodyEntities: PhysicsLayoutBodyMaterialization[];
  colliderEntities: PhysicsLayoutColliderMaterialization[];
  dispose(): void;
};

export type MaterializePhysicsLayoutOptions = {
  dataRegistry: DataRegistry;
  layoutId: string;
  world: GameWorld;
  idPrefix?: string;
  bindings?: PhysicsLayoutWorldBindings;
};

export type PhysicsLayoutModuleOptions = Omit<MaterializePhysicsLayoutOptions, "world"> & {
  id?: string;
};

type ResolvedBindings = {
  body: ComponentDef<PhysicsBodyComponentState>;
  collider: ComponentDef<PhysicsColliderComponentState>;
  transform: ComponentDef<PhysicsTransformComponentState>;
};

export function createPhysicsLayoutModule(
  options: PhysicsLayoutModuleOptions
): GameModule<GameInstallContext> {
  return defineGameModule<GameInstallContext>({
    id: options.id ?? `physics.layout.${options.layoutId}`,
    install(ctx) {
      return materializePhysicsLayout({ ...options, world: ctx.world }).dispose;
    }
  });
}

export function materializePhysicsLayout(
  options: MaterializePhysicsLayoutOptions
): PhysicsLayoutMaterialization {
  const layout = options.dataRegistry.getValue<PhysicsLayoutData>(
    "physics.layout",
    options.layoutId
  );
  const bindings = resolveBindings(options.bindings);
  const idPrefix = options.idPrefix ?? layout.id;
  const spawnedEntities: EntityId[] = [];
  const bodyEntities: PhysicsLayoutBodyMaterialization[] = [];
  const colliderEntities: PhysicsLayoutColliderMaterialization[] = [];

  try {
    for (const bodyInstance of layout.bodies) {
      const bodyData = options.dataRegistry.getValue<PhysicsBodyData>(
        bodyInstance.body.type,
        bodyInstance.body.id
      );
      const bodyId = `${idPrefix}.${bodyInstance.id}.body`;
      const bodyEntity = options.world.spawn();
      spawnedEntities.push(bodyEntity);
      bodyEntities.push({ instanceId: bodyInstance.id, entityId: bodyEntity, bodyId });
      options.world.add(bodyEntity, bindings.transform, {
        position: bodyInstance.position ?? bodyData.position ?? { x: 0, y: 0 },
        ...(bodyInstance.rotation === undefined && bodyData.rotation === undefined
          ? {}
          : { rotation: bodyInstance.rotation ?? bodyData.rotation })
      });
      options.world.add(bodyEntity, bindings.body, {
        definition: createBodyDefinition(layout.id, bodyInstance, bodyData, bodyId),
        enabled: bodyInstance.enabled ?? true
      });

      const colliderInstances = resolveColliderInstances(bodyInstance, bodyData);
      for (const colliderInstance of colliderInstances) {
        const colliderData = options.dataRegistry.getValue<PhysicsColliderData>(
          colliderInstance.collider.type,
          colliderInstance.collider.id
        );
        const colliderId = `${idPrefix}.${bodyInstance.id}.${colliderInstance.id}.collider`;
        const colliderEntity = options.world.spawn();
        spawnedEntities.push(colliderEntity);
        colliderEntities.push({
          instanceId: colliderInstance.id,
          bodyInstanceId: bodyInstance.id,
          entityId: colliderEntity,
          colliderId
        });
        options.world.add(colliderEntity, bindings.collider, {
          definition: createColliderDefinition(
            layout.id,
            bodyInstance.id,
            colliderInstance,
            colliderData,
            bodyId,
            colliderId
          ),
          enabled: colliderInstance.enabled ?? true
        });
      }
    }
  } catch (error) {
    despawnAll(options.world, spawnedEntities);
    throw error;
  }

  let disposed = false;
  return {
    layoutId: layout.id,
    bodyEntities,
    colliderEntities,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      despawnAll(options.world, spawnedEntities);
    }
  };
}

function createBodyDefinition(
  layoutId: string,
  instance: PhysicsLayoutBodyInstanceData,
  data: PhysicsBodyData,
  bodyId: string
): PhysicsBodyDefinition {
  const {
    id: _id,
    position: _position,
    rotation: _rotation,
    colliders: _colliders,
    tags: _tags,
    ...definition
  } = data;
  const overrides = instance.overrides ?? {};
  return {
    ...definition,
    ...overrides,
    id: bodyId,
    userData: {
      ...definition.userData,
      ...overrides.userData,
      physicsLayoutId: layoutId,
      physicsLayoutBodyInstanceId: instance.id
    }
  };
}

function createColliderDefinition(
  layoutId: string,
  bodyInstanceId: string,
  instance: PhysicsLayoutColliderInstanceData,
  data: PhysicsColliderData,
  bodyId: string,
  colliderId: string
): PhysicsColliderDefinition {
  const { id: _id, bodyId: _bodyId, tags: _tags, ...definition } = data;
  const overrides = instance.overrides ?? {};
  return {
    ...definition,
    ...overrides,
    id: colliderId,
    bodyId,
    userData: {
      ...definition.userData,
      ...overrides.userData,
      physicsLayoutId: layoutId,
      physicsLayoutBodyInstanceId: bodyInstanceId,
      physicsLayoutColliderInstanceId: instance.id
    }
  };
}

function resolveColliderInstances(
  bodyInstance: PhysicsLayoutBodyInstanceData,
  bodyData: PhysicsBodyData
): PhysicsLayoutColliderInstanceData[] {
  if (bodyInstance.colliders !== undefined) {
    return bodyInstance.colliders;
  }
  return (bodyData.colliders ?? []).map((collider, index) => ({
    id: `${index}.${collider.id}`,
    collider
  }));
}

function resolveBindings(bindings: PhysicsLayoutWorldBindings = {}): ResolvedBindings {
  return {
    body: bindings.body ?? PhysicsBodyComponent,
    collider: bindings.collider ?? PhysicsColliderComponent,
    transform: bindings.transform ?? PhysicsTransformComponent
  };
}

function despawnAll(world: GameWorld, entities: EntityId[]): void {
  for (let index = entities.length - 1; index >= 0; index -= 1) {
    const entity = entities[index];
    if (entity !== undefined && world.has(entity)) {
      world.despawn(entity);
    }
  }
}
