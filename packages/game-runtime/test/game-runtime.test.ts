import { defineGameModule } from "@gamekit/core";
import { createEventBus } from "@gamekit/event-bus";
import { defineComponent, type GameWorld } from "@gamekit/world";
import { describe, expect, it } from "vitest";
import { createGame, type GameInstallContext } from "../src/index";

const Counter = defineComponent({
  id: "test.counter",
  create: (data?: Partial<{ value: number }>) => ({ value: data?.value ?? 0 })
});

function createMemoryWorld(): GameWorld {
  let nextId = 0;
  const componentsByEntity = new Map<string, Map<string, unknown>>();

  return {
    spawn() {
      const id = `entity-${nextId}`;
      nextId += 1;
      componentsByEntity.set(id, new Map());
      return id;
    },
    despawn(entity) {
      componentsByEntity.delete(String(entity));
    },
    has(entity) {
      return componentsByEntity.has(String(entity));
    },
    add(entity, component, data) {
      componentsByEntity.get(String(entity))?.set(component.id, component.create(data));
    },
    get(entity, component) {
      return componentsByEntity.get(String(entity))?.get(component.id) as any;
    },
    set(entity, component, data) {
      const current = this.get(entity, component);
      if (current) {
        Object.assign(current, data);
      }
    },
    remove(entity, component) {
      componentsByEntity.get(String(entity))?.delete(component.id);
    },
    query(components = []) {
      return [...componentsByEntity.entries()]
        .filter(([, entityComponents]) =>
          components.every((component) => entityComponents.has(component.id))
        )
        .map(([entity]) => entity);
    },
    count() {
      return componentsByEntity.size;
    }
  };
}

describe("createGame", () => {
  it("installs modules once and runs systems in registration order", () => {
    const world = createMemoryWorld();
    const eventBus = createEventBus({ clock: () => 0 });
    const calls: string[] = [];
    const entity = world.spawn();
    world.add(entity, Counter, { value: 0 });

    const module = defineGameModule<GameInstallContext>({
      id: "test.module",
      install(ctx) {
        calls.push("install");
        ctx.systems.register({
          id: "a",
          update() {
            calls.push("a");
          }
        });
        ctx.systems.register({
          id: "b",
          update() {
            calls.push("b");
          }
        });
      }
    });

    const runtime = createGame({ modules: [module], world, eventBus, seed: "seed" });
    runtime.start();
    runtime.tick(16);
    runtime.tick(16);

    expect(calls).toEqual(["install", "a", "b", "a", "b"]);
  });

  it("does not update systems while stopped", () => {
    const world = createMemoryWorld();
    const eventBus = createEventBus({ clock: () => 0 });
    let updates = 0;

    const module = defineGameModule<GameInstallContext>({
      id: "test.module",
      install(ctx) {
        ctx.systems.register({
          id: "counter",
          update() {
            updates += 1;
          }
        });
      }
    });

    const runtime = createGame({ modules: [module], world, eventBus, seed: "seed" });
    runtime.tick(16);
    runtime.start();
    runtime.tick(16);
    runtime.stop();
    runtime.tick(16);

    expect(updates).toBe(1);
  });
});
