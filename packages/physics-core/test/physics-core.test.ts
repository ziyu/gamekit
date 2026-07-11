import { GameError } from "@gamekit/core";
import { createDataRegistry } from "@gamekit/data";
import { createEventBus } from "@gamekit/event-bus";
import { createGame } from "@gamekit/game-runtime";
import { type ComponentDef, type EntityId, type GameWorld } from "@gamekit/world";
import { describe, expect, it } from "vitest";
import {
  PhysicsBodyComponent,
  PhysicsColliderComponent,
  PhysicsTransformComponent,
  PhysicsVelocityComponent,
  createMemoryPhysicsBackend,
  createPhysicsHandle,
  createPhysicsDataTypes,
  createPhysicsModule,
  createPhysicsTraceStore,
  checkCollision,
  checkOverlap,
  overlapShape,
  queryBounds,
  queryPoint,
  raycast,
  shapeCast,
  type PhysicsContactEvent
} from "../src";

describe("Physics data types", () => {
  it("validates physics documents and tracks references", () => {
    const registry = createDataRegistry();
    for (const definition of createPhysicsDataTypes()) {
      registry.registerType(definition);
    }

    const validation = registry.registerPack({
      id: "physics",
      version: "1.0.0",
      entries: [
        {
          type: "physics.material",
          id: "mat.stone",
          data: { id: "mat.stone", density: 1 }
        },
        {
          type: "physics.collider",
          id: "collider.hero",
          data: { shape: { type: "circle", radius: 1 }, material: "mat.stone" }
        },
        {
          type: "physics.body",
          id: "body.hero",
          data: {
            kind: "dynamic",
            colliders: [{ type: "physics.collider", id: "collider.hero" }]
          }
        }
      ]
    });

    expect(validation.diagnostics).toEqual([]);
    expect(registry.referencesFrom({ type: "physics.body", id: "body.hero" })).toMatchObject([
      { to: { type: "physics.collider", id: "collider.hero" } }
    ]);
    expect(
      registry.referencesFrom({ type: "physics.collider", id: "collider.hero" })
    ).toMatchObject([{ to: { type: "physics.material", id: "mat.stone" } }]);
  });
});

describe("Memory physics backend", () => {
  it("steps bodies, tracks contacts, and supports overlap queries", () => {
    const backend = createMemoryPhysicsBackend();
    const scene = backend.createScene({ gravity: { x: 0, y: 0 } });
    const bodyA = scene.createBody({
      kind: "dynamic",
      position: { x: 0, y: 0 },
      linearVelocity: { x: 2, y: 0 }
    });
    const bodyB = scene.createBody({
      kind: "static",
      position: { x: 2, y: 0 }
    });
    const colliderA = scene.createCollider({
      bodyId: bodyA,
      shape: { type: "circle", radius: 0.5 }
    });
    scene.createCollider({
      bodyId: bodyB,
      shape: { type: "circle", radius: 0.5 },
      sensor: true
    });

    const result = scene.step(1000);

    expect(scene.getBodyState(bodyA)?.position).toMatchObject({ x: 2, y: 0 });
    expect(result.contacts).toMatchObject([{ phase: "enter", kind: "trigger", colliderA }]);
    expect(
      scene.query({
        type: "overlap",
        shape: { type: "circle", radius: 1 },
        position: { x: 2, y: 0 }
      })
    ).toHaveLength(2);
  });

  it("supports query families, trigger interaction, filters, sorting, and ignore lists", () => {
    const backend = createMemoryPhysicsBackend({ dimension: "3d" });
    const scene = backend.createScene({ dimension: "3d", gravity: { x: 0, y: 0, z: 0 } });
    const actorBody = scene.createBody({ kind: "static", position: { x: 1, y: 0, z: 0 } });
    const wallBody = scene.createBody({ kind: "static", position: { x: 3, y: 0, z: 0 } });
    const sensorBody = scene.createBody({ kind: "static", position: { x: 5, y: 0, z: 0 } });
    const actorCollider = scene.createCollider({
      bodyId: actorBody,
      shape: { type: "sphere", radius: 0.45 },
      filter: { groups: ["actor"], collidesWith: ["query"] }
    });
    const wallCollider = scene.createCollider({
      bodyId: wallBody,
      shape: { type: "box", width: 1, height: 1, depth: 1 },
      filter: { groups: ["wall"], collidesWith: ["query"] }
    });
    const sensorCollider = scene.createCollider({
      bodyId: sensorBody,
      shape: { type: "sphere", radius: 0.5 },
      sensor: true,
      filter: { groups: ["sensor"], collidesWith: ["query"] }
    });

    expect(
      raycast(
        scene,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        {
          maxDistance: 10,
          mode: "closest",
          sort: "distance",
          filter: { groups: ["query"], collidesWith: ["wall"] }
        }
      ).map((hit) => hit.colliderId)
    ).toEqual([wallCollider]);
    expect(
      raycast(
        scene,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        {
          maxDistance: 10,
          triggerInteraction: "exclude",
          ignoreColliders: [actorCollider],
          sort: "distance"
        }
      ).map((hit) => hit.colliderId)
    ).toEqual([wallCollider]);
    expect(
      overlapShape(
        scene,
        { type: "sphere", radius: 0.6 },
        { x: 5, y: 0, z: 0 },
        {
          triggerInteraction: "only"
        }
      ).map((hit) => hit.colliderId)
    ).toEqual([sensorCollider]);
    expect(
      shapeCast(
        scene,
        { type: "sphere", radius: 0.25 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        {
          maxDistance: 2,
          mode: "any"
        }
      )
    ).toHaveLength(1);
    expect(
      checkOverlap(scene, { type: "box", width: 1, height: 1, depth: 1 }, { x: 3, y: 0, z: 0 })
    ).toBe(true);
    expect(
      queryBounds(scene, {
        min: { x: 4.4, y: -1, z: -1 },
        max: { x: 5.6, y: 1, z: 1 }
      }).map((hit) => hit.colliderId)
    ).toEqual([sensorCollider]);
    expect(scene.getColliderState(sensorCollider)).toMatchObject({ sensor: true });
  });

  it("honors collider offsets, include lists, bit masks, and max result limits", () => {
    const backend = createMemoryPhysicsBackend({ dimension: "3d" });
    const scene = backend.createScene({ dimension: "3d", gravity: { x: 0, y: 0, z: 0 } });
    const offsetBody = scene.createBody({ kind: "static", position: { x: 0, y: 0, z: 0 } });
    const bodyB = scene.createBody({ kind: "static", position: { x: 2.75, y: 0, z: 0 } });
    const bodyC = scene.createBody({ kind: "static", position: { x: 4.2, y: 0, z: 0 } });
    const offsetCollider = scene.createCollider({
      bodyId: offsetBody,
      shape: { type: "sphere", radius: 0.5 },
      offset: { position: { x: 2, y: 0, z: 0 } },
      filter: { categoryBits: 0b0001, maskBits: 0b0100 }
    });
    const colliderB = scene.createCollider({
      bodyId: bodyB,
      shape: { type: "sphere", radius: 0.5 },
      filter: { categoryBits: 0b0010, maskBits: 0b0100 }
    });
    const colliderC = scene.createCollider({
      bodyId: bodyC,
      shape: { type: "sphere", radius: 0.5 },
      filter: { categoryBits: 0b1000, maskBits: 0b0010 }
    });

    expect(queryPoint(scene, { x: 2, y: 0, z: 0 }).map((hit) => hit.colliderId)).toEqual([
      offsetCollider
    ]);
    expect(checkCollision(scene, offsetCollider)).toBe(true);
    expect(
      queryBounds(
        scene,
        {
          min: { x: 0, y: -1, z: -1 },
          max: { x: 5, y: 1, z: 1 }
        },
        { includeBodies: [bodyB] }
      ).map((hit) => hit.colliderId)
    ).toEqual([colliderB]);
    expect(
      queryBounds(
        scene,
        {
          min: { x: 0, y: -1, z: -1 },
          max: { x: 5, y: 1, z: 1 }
        },
        { includeColliders: [offsetCollider] }
      ).map((hit) => hit.colliderId)
    ).toEqual([offsetCollider]);
    expect(
      queryBounds(
        scene,
        {
          min: { x: 0, y: -1, z: -1 },
          max: { x: 5, y: 1, z: 1 }
        },
        { filter: { categoryBits: 0b0100, maskBits: 0b0001 } }
      ).map((hit) => hit.colliderId)
    ).toEqual([offsetCollider]);
    const limitedRayHits = raycast(
      scene,
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      {
        maxDistance: 10,
        sort: "distance",
        maxResults: 2
      }
    ).map((hit) => hit.colliderId);
    expect(limitedRayHits).toEqual([offsetCollider, colliderB]);
    expect(limitedRayHits).not.toContain(colliderC);
  });
});

describe("Physics module", () => {
  it("syncs world components, emits contact events, and writes trace entries", () => {
    const world = createMemoryWorld();
    const mover = world.spawn();
    const wall = world.spawn();
    world.add(mover, PhysicsBodyComponent, {
      definition: { kind: "dynamic" }
    });
    world.add(mover, PhysicsTransformComponent, {
      position: { x: 0, y: 0 }
    });
    world.add(mover, PhysicsVelocityComponent, {
      linear: { x: 1, y: 0 }
    });
    world.add(mover, PhysicsColliderComponent, {
      definition: { shape: { type: "circle", radius: 0.5 } }
    });
    world.add(wall, PhysicsBodyComponent, {
      definition: { kind: "static" }
    });
    world.add(wall, PhysicsTransformComponent, {
      position: { x: 1, y: 0 }
    });
    world.add(wall, PhysicsColliderComponent, {
      definition: { shape: { type: "circle", radius: 0.5 }, sensor: true }
    });

    const eventBus = createEventBus({ clock: () => 1 });
    const contacts: PhysicsContactEvent[] = [];
    eventBus.on<PhysicsContactEvent>("physics.trigger.enter", (event) => {
      contacts.push(event.payload);
    });
    const traceStore = createPhysicsTraceStore();
    const runtime = createGame({
      modules: [
        createPhysicsModule({
          backend: createMemoryPhysicsBackend(),
          fixedDeltaMs: 1000,
          scene: { gravity: { x: 0, y: 0 } },
          traceStore
        })
      ],
      world,
      eventBus,
      seed: "physics"
    });

    runtime.start();
    runtime.tick(1000);

    expect(world.get(mover, PhysicsTransformComponent)?.position).toMatchObject({ x: 1, y: 0 });
    expect(world.get(mover, PhysicsBodyComponent)?.bodyId).toBeDefined();
    expect(world.get(mover, PhysicsColliderComponent)?.colliderId).toBeDefined();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      phase: "enter",
      kind: "trigger",
      entityA: mover,
      entityB: wall
    });
    expect(traceStore.list().map((entry) => entry.kind)).toEqual(["contact", "step"]);

    runtime.dispose();
  });

  it("binds an injected physics handle for gameplay queries", () => {
    const world = createMemoryWorld();
    const actor = world.spawn();
    world.add(actor, PhysicsBodyComponent, {
      definition: { kind: "static" }
    });
    world.add(actor, PhysicsTransformComponent, {
      position: { x: 2, y: 0 }
    });
    world.add(actor, PhysicsColliderComponent, {
      definition: {
        shape: { type: "circle", radius: 0.5 },
        filter: { groups: ["actor"], collidesWith: ["query"] }
      }
    });

    const physics = createPhysicsHandle({ id: "test.physics" });
    expect(physics.isBound()).toBe(false);

    const runtime = createGame({
      modules: [
        createPhysicsModule({
          backend: createMemoryPhysicsBackend(),
          fixedDeltaMs: 1000,
          scene: { gravity: { x: 0, y: 0 } },
          handle: physics
        })
      ],
      world,
      eventBus: createEventBus({ clock: () => 1 }),
      seed: "physics-handle"
    });

    expect(physics.isBound()).toBe(true);
    runtime.start();
    runtime.tick(1000);

    const colliderId = world.get(actor, PhysicsColliderComponent)?.colliderId;
    expect(colliderId).toBeDefined();
    expect(
      physics
        .raycast(
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          {
            maxDistance: 4,
            filter: { groups: ["query"], collidesWith: ["actor"] }
          }
        )
        .map((hit) => hit.colliderId)
    ).toEqual([colliderId]);
    expect(physics.checkOverlap({ type: "circle", radius: 0.25 }, { x: 2, y: 0 })).toBe(true);
    expect(physics.snapshot()).toMatchObject({
      backend: "memory-physics",
      bodyCount: 1,
      colliderCount: 1
    });

    runtime.dispose();
    expect(physics.isBound()).toBe(false);
    expectPhysicsError(() => physics.queryPoint({ x: 2, y: 0 }), "physics.handle_unbound");
  });

  it("rejects unbound and duplicate physics handle access", () => {
    const physics = createPhysicsHandle({ id: "duplicate.physics" });
    expectPhysicsError(() => physics.snapshot(), "physics.handle_unbound");

    const runtime = createGame({
      modules: [
        createPhysicsModule({
          backend: createMemoryPhysicsBackend(),
          handle: physics
        })
      ],
      world: createMemoryWorld(),
      eventBus: createEventBus({ clock: () => 1 }),
      seed: "physics-handle-owner"
    });

    expectPhysicsError(
      () =>
        createGame({
          modules: [
            createPhysicsModule({
              backend: createMemoryPhysicsBackend(),
              handle: physics
            })
          ],
          world: createMemoryWorld(),
          eventBus: createEventBus({ clock: () => 1 }),
          seed: "physics-handle-duplicate"
        }),
      "physics.handle_bound"
    );

    runtime.dispose();
  });
});

function expectPhysicsError(callback: () => void, code: string): void {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
    return;
  }

  throw new Error(`Expected physics error: ${code}`);
}

function createMemoryWorld(): GameWorld {
  let nextEntity = 1;
  const components = new Map<EntityId, Map<string, object>>();

  return {
    spawn() {
      const entity = nextEntity;
      nextEntity += 1;
      components.set(entity, new Map());
      return entity;
    },
    despawn(entity) {
      components.delete(entity);
    },
    has(entity) {
      return components.has(entity);
    },
    add<T extends object>(entity: EntityId, component: ComponentDef<T>, data?: Partial<T>) {
      requireEntity(components, entity).set(component.id, component.create(data));
    },
    get<T extends object>(entity: EntityId, component: ComponentDef<T>) {
      return requireEntity(components, entity).get(component.id) as T | undefined;
    },
    set<T extends object>(entity: EntityId, component: ComponentDef<T>, data: Partial<T>) {
      const entityComponents = requireEntity(components, entity);
      const current = entityComponents.get(component.id) as T | undefined;
      entityComponents.set(component.id, { ...(current ?? component.create()), ...data });
    },
    remove(entity, component) {
      requireEntity(components, entity).delete(component.id);
    },
    query(required = []) {
      const result: EntityId[] = [];
      for (const [entity, entityComponents] of components.entries()) {
        if (required.every((component) => entityComponents.has(component.id))) {
          result.push(entity);
        }
      }

      return result;
    },
    count() {
      return components.size;
    }
  };
}

function requireEntity(
  components: Map<EntityId, Map<string, object>>,
  entity: EntityId
): Map<string, object> {
  const entityComponents = components.get(entity);
  if (!entityComponents) {
    throw new Error(`Missing entity: ${String(entity)}`);
  }

  return entityComponents;
}
