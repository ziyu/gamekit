import { createDataRegistry, type DataPack } from "@gamekit/data";
import { createEventBus } from "@gamekit/event-bus";
import { describe, expect, it } from "vitest";
import {
  createGasDataTypes,
  createGasRuntime,
  createGasTcaDefinitions,
  createGasTraceStore,
  GasActor,
  GasAttributes,
  type GasRuntime
} from "../src";
import type { ComponentDef, EntityId, GameWorld } from "@gamekit/world";

describe("GAS runtime", () => {
  it("stores entity-backed actor state in world components", () => {
    const world = createMemoryWorld();
    const runtime = createTestGasRuntime(world);
    const entity = world.spawn();

    runtime.createActor({
      actorId: "actor.hero",
      definitionId: "actor.scout",
      entityId: entity
    });

    expect(world.get(entity, GasActor)).toMatchObject({
      actorId: "actor.hero",
      definitionId: "actor.scout",
      entityId: entity
    });
    expect(world.get(entity, GasAttributes)?.current.health).toBe(100);
  });

  it("activates abilities, applies effects, emits cues, and records traces", () => {
    const world = createMemoryWorld();
    const eventBus = createEventBus({ clock: () => 10 });
    const events: string[] = [];
    const runtime = createTestGasRuntime(world, eventBus);
    const source = world.spawn();
    const target = world.spawn();
    eventBus.onAny((event) => events.push(event.type));

    runtime.createActor({ actorId: "actor.source", definitionId: "actor.scout", entityId: source });
    runtime.createActor({ actorId: "actor.target", definitionId: "actor.scout", entityId: target });
    const result = runtime.activateAbility({
      actorId: "actor.source",
      abilityId: "ability.strike",
      targetActorId: "actor.target"
    });

    expect(result).toMatchObject({
      status: "activated",
      actorId: "actor.source",
      abilityId: "ability.strike",
      cooldownUntil: 100,
      paidCosts: [{ attribute: "energy", amount: 5 }]
    });
    expect(result.status === "activated" ? result.appliedEffects : []).toEqual([
      {
        effectId: "effect.damage",
        sourceActorId: "actor.source",
        targetActorId: "actor.target"
      }
    ]);
    expect(runtime.getActor("actor.source").attributes.current.energy).toBe(35);
    expect(runtime.getActor("actor.target").attributes.current.health).toBe(88);
    expect(runtime.getActor("actor.target").tags.values).toContain("state.marked");
    expect(events).toContain("gas.ability_activated");
    expect(events).toContain("gas.effect_applied");
    expect(events).toContain("gas.cue");
    expect(runtime.traceStore.list().map((trace) => trace.type)).toContain("ability.activated");
  });

  it("ticks periodic effects and removes granted tags on expiry", () => {
    const world = createMemoryWorld();
    const runtime = createTestGasRuntime(world);

    runtime.createActor({ actorId: "actor.source", definitionId: "actor.scout" });
    runtime.activateAbility({
      actorId: "actor.source",
      abilityId: "ability.regen",
      targetActorId: "actor.source"
    });

    runtime.update(250, 250);
    expect(runtime.getActor("actor.source").attributes.current.energy).toBe(42);
    expect(runtime.getActor("actor.source").tags.values).toContain("state.overcharged");

    runtime.update(800, 1050);
    expect(runtime.getActor("actor.source").tags.values).not.toContain("state.overcharged");
    expect(runtime.getActor("actor.source").effects.active).toHaveLength(0);
  });

  it("returns rejected activation results without paying costs", () => {
    const world = createMemoryWorld();
    const runtime = createTestGasRuntime(world);

    runtime.createActor({ actorId: "actor.source", definitionId: "actor.scout" });
    runtime.createActor({ actorId: "actor.target", definitionId: "actor.scout" });

    expect(
      runtime.activateAbility({
        actorId: "actor.source",
        abilityId: "ability.strike",
        targetActorId: "actor.target"
      }).status
    ).toBe("activated");
    const rejected = runtime.activateAbility({
      actorId: "actor.source",
      abilityId: "ability.strike",
      targetActorId: "actor.target"
    });

    expect(rejected).toMatchObject({
      status: "rejected",
      reason: "ability is on cooldown"
    });
    expect(runtime.getActor("actor.source").attributes.current.energy).toBe(35);
  });

  it("exposes TCA definitions that can drive GAS", () => {
    const world = createMemoryWorld();
    const runtime = createTestGasRuntime(world);
    const definitions = createGasTcaDefinitions({ runtime: () => runtime });
    const activate = definitions.actions?.find((action) => action.type === "gas.activate_ability");
    const compare = definitions.conditions?.find(
      (condition) => condition.type === "gas.attribute.compare"
    );

    runtime.createActor({ actorId: "actor.source", definitionId: "actor.scout" });
    runtime.createActor({ actorId: "actor.target", definitionId: "actor.scout" });

    expect(
      compare?.evaluate(createTcaContext(runtime), {
        type: "gas.attribute.compare",
        args: { actorId: "actor.target", attribute: "health", operator: ">", value: 0 }
      })
    ).toBe(true);

    activate?.execute(createTcaContext(runtime), {
      type: "gas.activate_ability",
      args: {
        actorId: "actor.source",
        abilityId: "ability.strike",
        targetActorId: "actor.target"
      }
    });

    expect(runtime.getActor("actor.target").attributes.current.health).toBe(88);
  });
});

function createTestGasRuntime(world: GameWorld, eventBus = createEventBus()): GasRuntime {
  const registry = createDataRegistry();
  for (const type of createGasDataTypes()) {
    registry.registerType(type);
  }
  registry.registerPack(testPack);

  return createGasRuntime({
    world,
    dataRegistry: registry,
    eventBus,
    traceStore: createGasTraceStore({ limit: 50 })
  });
}

const testPack: DataPack = {
  id: "gas.test",
  version: "1.0.0",
  entries: [
    {
      type: "gas.attribute",
      id: "health",
      data: { id: "health", min: 0, max: 100, defaultValue: 100 }
    },
    {
      type: "gas.attribute",
      id: "energy",
      data: { id: "energy", min: 0, max: 50, defaultValue: 40 }
    },
    { type: "gas.tag", id: "state.marked", data: { id: "state.marked" } },
    { type: "gas.tag", id: "state.overcharged", data: { id: "state.overcharged" } },
    {
      type: "gas.cue",
      id: "cue.hit",
      data: { id: "cue.hit", type: "ui.floating_text", payload: { text: "hit" } }
    },
    {
      type: "gas.effect",
      id: "effect.damage",
      data: {
        id: "effect.damage",
        attributeModifiers: [{ attribute: "health", operation: "add", value: -12 }],
        grantedTags: ["state.marked"],
        durationMs: 500,
        cues: ["cue.hit"]
      }
    },
    {
      type: "gas.effect",
      id: "effect.regen",
      data: {
        id: "effect.regen",
        durationMs: 1000,
        periodMs: 250,
        periodicModifiers: [{ attribute: "energy", operation: "add", value: 2 }],
        grantedTags: ["state.overcharged"]
      }
    },
    {
      type: "gas.ability",
      id: "ability.strike",
      data: {
        id: "ability.strike",
        costs: [{ attribute: "energy", amount: 5 }],
        cooldownMs: 100,
        effects: [{ effectId: "effect.damage", target: "target" }]
      }
    },
    {
      type: "gas.ability",
      id: "ability.regen",
      data: {
        id: "ability.regen",
        effects: [{ effectId: "effect.regen", target: "self" }]
      }
    },
    {
      type: "gas.actor",
      id: "actor.scout",
      data: {
        id: "actor.scout",
        attributes: { health: 100, energy: 40 },
        tags: [],
        abilities: ["ability.strike", "ability.regen"]
      }
    }
  ]
};

function createTcaContext(runtime: GasRuntime) {
  const eventBus = createEventBus();
  return {
    event: { type: "test", payload: {}, timestamp: 0 },
    eventBus,
    rule: {
      id: "rule.test",
      trigger: { type: "event.type", args: { eventType: "test" } },
      actions: []
    },
    game: {
      world: createMemoryWorld(),
      eventBus,
      rng: {} as never,
      systems: {} as never
    },
    dataRegistry: undefined,
    runtime
  };
}

function createMemoryWorld(): GameWorld {
  const componentData = new Map<EntityId, Map<string, unknown>>();
  let nextId = 0;

  return {
    spawn() {
      const id = `entity-${nextId}`;
      nextId += 1;
      componentData.set(id, new Map());
      return id;
    },
    despawn(entity) {
      componentData.delete(entity);
    },
    has(entity) {
      return componentData.has(entity);
    },
    add(entity, component, data) {
      requireEntity(componentData, entity).set(component.id, component.create(data));
    },
    get(entity, component) {
      return requireEntity(componentData, entity).get(component.id) as
        | ReturnType<typeof component.create>
        | undefined;
    },
    set(entity, component, data) {
      const components = requireEntity(componentData, entity);
      const current =
        (components.get(component.id) as ReturnType<typeof component.create>) ?? component.create();
      components.set(component.id, { ...current, ...data });
    },
    remove(entity, component) {
      requireEntity(componentData, entity).delete(component.id);
    },
    query(components: Array<ComponentDef<any>> = []) {
      return [...componentData.entries()]
        .filter(([, values]) => components.every((component) => values.has(component.id)))
        .map(([entity]) => entity);
    },
    count() {
      return componentData.size;
    }
  };
}

function requireEntity(
  componentData: Map<EntityId, Map<string, unknown>>,
  entity: EntityId
): Map<string, unknown> {
  const components = componentData.get(entity);
  if (!components) {
    throw new Error(`Missing entity: ${String(entity)}`);
  }

  return components;
}
