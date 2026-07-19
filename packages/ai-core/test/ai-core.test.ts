import { createDataRegistry, type DataPack, type DataRegistry } from "@gamekit/data";
import { createEventBus } from "@gamekit/event-bus";
import { createGame } from "@gamekit/game-runtime";
import type { ComponentDef, EntityId, GameWorld } from "@gamekit/world";
import { describe, expect, it } from "vitest";
import {
  bindAiHandle,
  createAiDataTypes,
  createAiHandle,
  createAiModule,
  createAiRuntime,
  createAiSaveContributor,
  evaluateAiUtilityCurve,
  runAiRuntimeConformance,
  type AiIntent,
  type AiPerceptionFact,
  type AiTaskExecutor,
  type AiTraceEntry
} from "../src";

describe("AI data types", () => {
  it("validates schedules, references, and utility curves", () => {
    const registry = createRegistry(false);
    const validation = registry.validatePack({
      id: "ai.invalid",
      version: "1.0.0",
      entries: [
        {
          type: "ai.agent",
          id: "agent.invalid",
          data: {
            id: "agent.invalid",
            sensors: [],
            goals: [],
            decisionIntervalMs: 0,
            memoryLimit: 0
          }
        },
        {
          type: "ai.goal",
          id: "goal.invalid",
          data: {
            id: "goal.invalid",
            task: { type: "ai.task", id: "task.missing" },
            considerations: [
              { input: "attack", curve: { type: "points", points: [{ x: 0, y: 0 }] } }
            ]
          }
        }
      ]
    });

    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ai.agent_invalid_decision_interval" }),
        expect.objectContaining({ code: "ai.agent_invalid_memory_limit" }),
        expect.objectContaining({ code: "ai.goal_invalid_curve_points" }),
        expect.objectContaining({ code: "data.missing_reference" })
      ])
    );
  });
});

describe("AI runtime", () => {
  it("evaluates supported utility curves deterministically", () => {
    expect(evaluateAiUtilityCurve({ type: "linear", min: 0, max: 10 }, 5)).toBe(0.5);
    expect(evaluateAiUtilityCurve({ type: "inverse", min: 0, max: 10 }, 2)).toBe(0.8);
    expect(evaluateAiUtilityCurve({ type: "step", threshold: 3 }, 3)).toBe(1);
    expect(evaluateAiUtilityCurve({ type: "power", exponent: 2 }, 0.5)).toBe(0.25);
    expect(
      evaluateAiUtilityCurve(
        {
          type: "points",
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 1 }
          ]
        },
        2.5
      )
    ).toBe(0.25);
  });

  it("samples perception, scores goals, and emits intents from tasks", () => {
    let observerErrors = 0;
    const fixture = createFixture({
      onTrace() {
        throw new Error("observer failed");
      },
      onTraceError() {
        observerErrors += 1;
      }
    });
    fixture.runtime.bind({ agentId: "agent.one", definitionId: "agent.standard" });
    fixture.runtime.setBlackboard("agent.one", "attack", 0.9);
    fixture.runtime.setBlackboard("agent.one", "flee", 0.1);

    fixture.runtime.update(1_000, 1_000);

    expect(fixture.runtime.getAgent("agent.one")).toMatchObject({
      goalId: "goal.attack",
      memorySize: 1,
      task: { taskId: "task.attack", status: "running" }
    });
    expect(fixture.intents).toContainEqual(
      expect.objectContaining({
        type: "action",
        agentId: "agent.one",
        actionId: "attack",
        source: "ai:task.attack"
      })
    );
    expect(fixture.runtime.traces()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "ai.sensor_sampled" }),
        expect.objectContaining({ label: "ai.goal_selected" }),
        expect.objectContaining({ label: "ai.intent_emitted" })
      ])
    );
    expect(observerErrors).toBeGreaterThan(0);
  });

  it("honors goal commitment before switching to a better goal", () => {
    const fixture = createFixture();
    fixture.runtime.bind({ agentId: "agent.commit", definitionId: "agent.standard" });
    fixture.runtime.setBlackboard("agent.commit", "attack", 0.8);
    fixture.runtime.setBlackboard("agent.commit", "flee", 0.2);
    fixture.runtime.update(1_000, 1_000);
    expect(fixture.runtime.getAgent("agent.commit")?.goalId).toBe("goal.attack");

    fixture.runtime.setBlackboard("agent.commit", "attack", 0.1);
    fixture.runtime.setBlackboard("agent.commit", "flee", 1);
    fixture.runtime.update(100, 1_100);
    expect(fixture.runtime.getAgent("agent.commit")?.goalId).toBe("goal.attack");

    fixture.runtime.update(500, 1_600);
    expect(fixture.runtime.getAgent("agent.commit")?.goalId).toBe("goal.flee");
  });

  it("bounds memory and expires stale facts", () => {
    const fixture = createFixture();
    fixture.runtime.bind({ agentId: "agent.memory", definitionId: "agent.tiny-memory" });
    fixture.runtime.observe("agent.memory", [
      fact("first", 1),
      fact("second", 2),
      fact("third", 3, 20)
    ]);
    expect(fixture.runtime.getAgent("agent.memory")?.memorySize).toBe(2);

    fixture.runtime.update(25, 25);
    expect(fixture.runtime.getAgent("agent.memory")?.memorySize).toBe(1);
  });

  it("delays decisions beyond the configured per-tick budget", () => {
    const fixture = createFixture({ maxDecisionsPerTick: 1, maxSensorSamplesPerTick: 1 });
    for (const agentId of ["agent.a", "agent.b", "agent.c"]) {
      fixture.runtime.bind({ agentId, definitionId: "agent.standard" });
      fixture.runtime.setBlackboard(agentId, "attack", 1);
    }

    fixture.runtime.update(1_000, 1_000);

    expect(fixture.runtime.snapshot()).toMatchObject({ delayedDecisions: 2, activeTasks: 1 });
    expect(
      fixture.runtime.listAgents().filter((agent) => agent.delayedDecisions === 1)
    ).toHaveLength(2);

    fixture.runtime.update(1_000, 2_000);
    fixture.runtime.update(1_000, 3_000);
    expect(
      new Set(
        fixture.runtime
          .traces()
          .filter((entry) => entry.label === "ai.goal_selected")
          .map((entry) => entry.agentId)
      )
    ).toEqual(new Set(["agent.a", "agent.b", "agent.c"]));
    expect(
      new Set(
        fixture.runtime
          .traces()
          .filter((entry) => entry.label === "ai.sensor_sampled")
          .map((entry) => entry.agentId)
      )
    ).toEqual(new Set(["agent.a", "agent.b", "agent.c"]));
  });

  it("fails timed-out tasks and applies decision backoff", () => {
    const fixture = createFixture();
    fixture.runtime.bind({ agentId: "agent.timeout", definitionId: "agent.standard" });
    fixture.runtime.setBlackboard("agent.timeout", "attack", 1);
    fixture.runtime.update(1_000, 1_000);
    fixture.runtime.update(250, 1_250);

    expect(fixture.runtime.getAgent("agent.timeout")?.task).toBeUndefined();
    expect(fixture.runtime.getAgent("agent.timeout")?.nextDecisionAt).toBe(1_350);
    expect(fixture.runtime.traces()).toContainEqual(
      expect.objectContaining({
        label: "ai.task_failed",
        payload: expect.objectContaining({ reason: "timeout" })
      })
    );
  });

  it("preserves target, path, and ability failure reasons from task executors", () => {
    for (const reason of ["target-lost", "path-failed", "ability-rejected"]) {
      const fixture = createFixture({
        tasks: [
          {
            id: "task.attack",
            start() {
              return { status: "running", safeToInterrupt: true };
            },
            update() {
              return { status: "failed", reason };
            }
          },
          fixtureTasks()[1]!
        ]
      });
      const agentId = `agent.${reason}`;
      fixture.runtime.bind({ agentId, definitionId: "agent.standard" });
      fixture.runtime.setBlackboard(agentId, "attack", 1);
      fixture.runtime.update(1_000, 1_000);
      fixture.runtime.update(1, 1_001);
      expect(fixture.runtime.traces()).toContainEqual(
        expect.objectContaining({
          label: "ai.task_failed",
          agentId,
          payload: expect.objectContaining({ reason })
        })
      );
      fixture.dispose();
    }
  });

  it("captures and restores agents with entity remapping", () => {
    const fixture = createFixture();
    fixture.runtime.bind({
      agentId: "agent.saved",
      definitionId: "agent.standard",
      entityId: "entity.old"
    });
    fixture.runtime.setBlackboard("agent.saved", "attack", 1);
    fixture.runtime.observe("agent.saved", [fact("visible", 10)]);
    fixture.runtime.update(1_000, 1_000);
    const checkpoint = fixture.runtime.captureCheckpoint();

    fixture.runtime.restoreCheckpoint(checkpoint, {
      resolveEntityId(entityId) {
        return entityId === "entity.old" ? "entity.new" : entityId;
      }
    });

    expect(fixture.runtime.getAgent("agent.saved")).toMatchObject({
      binding: { entityId: "entity.new" },
      goalId: "goal.attack",
      memorySize: 2,
      blackboardKeys: ["attack"]
    });
  });

  it("rejects bindings whose configured handlers are absent", () => {
    const runtime = createAiRuntime({
      dataRegistry: createRegistry(),
      world: createMemoryWorld(),
      intentSink: { emit() {} },
      sensors: [],
      inputs: [],
      tasks: []
    });
    expect(() =>
      runtime.bind({ agentId: "agent.invalid", definitionId: "agent.standard" })
    ).toThrowError(expect.objectContaining({ code: "ai.definition_missing" }));
  });

  it("compiles registry definitions once per agent definition outside the update path", () => {
    const registry = createRegistry();
    const originalGetValue = registry.getValue.bind(registry);
    let definitionReads = 0;
    registry.getValue = ((...args: Parameters<DataRegistry["getValue"]>) => {
      definitionReads += 1;
      return originalGetValue(...args);
    }) as DataRegistry["getValue"];
    const runtime = createAiRuntime({
      dataRegistry: registry,
      world: createMemoryWorld(),
      intentSink: { emit() {} },
      sensors: fixtureSensors(),
      inputs: fixtureInputs(),
      tasks: fixtureTasks()
    });

    runtime.bind({ agentId: "agent.compiled.one", definitionId: "agent.standard" });
    const readsAfterFirstBind = definitionReads;
    runtime.bind({ agentId: "agent.compiled.two", definitionId: "agent.standard" });
    runtime.setBlackboard("agent.compiled.one", "attack", 1);
    runtime.setBlackboard("agent.compiled.two", "attack", 1);
    runtime.update(1_000, 1_000);
    runtime.update(100, 1_100);

    expect(readsAfterFirstBind).toBeGreaterThan(0);
    expect(definitionReads).toBe(readsAfterFirstBind);
    runtime.dispose();
    expect(runtime.snapshot()).toMatchObject({
      disposed: true,
      compiledDefinitions: 0,
      agents: []
    });
  });

  it("passes the reusable runtime conformance suite", () => {
    const report = runAiRuntimeConformance(() => {
      const fixture = createFixture();
      const binding = { agentId: "agent.conformance", definitionId: "agent.standard" };
      const originalBind = fixture.runtime.bind.bind(fixture.runtime);
      fixture.runtime.bind = (nextBinding) => {
        originalBind(nextBinding);
        fixture.runtime.setBlackboard(nextBinding.agentId, "attack", 1);
      };
      return { runtime: fixture.runtime, binding, dispose: fixture.dispose };
    });

    expect(report.checks).toHaveLength(5);
    expect(report.selectedGoalId).toBe("goal.attack");
  });
});

describe("AI module and save integration", () => {
  it("binds a handle, captures a save section, and invalidates on dispose", async () => {
    const handle = createAiHandle();
    const game = createGame({
      world: createMemoryWorld(),
      eventBus: createEventBus(),
      seed: "ai-module",
      modules: [
        createAiModule({
          dataRegistry: createRegistry(),
          handle,
          intentSink: { emit() {} },
          sensors: fixtureSensors(),
          inputs: fixtureInputs(),
          tasks: fixtureTasks()
        })
      ]
    });

    expect(handle.isBound()).toBe(true);
    handle.bind({
      agentId: "agent.handle",
      definitionId: "agent.standard",
      entityId: "entity.old"
    });
    const contributor = createAiSaveContributor({ handle });
    const section = await contributor.capture({ now: 0 });
    expect(section?.data.agents).toHaveLength(1);
    expect(contributor.validate?.(section!, {})).toEqual({ issues: [] });

    game.dispose();
    expect(handle.isBound()).toBe(false);
    expect(() => handle.hasAgent("agent.handle")).toThrowError(
      expect.objectContaining({ code: "ai.handle_unbound" })
    );
  });

  it("rejects save sections with duplicate agents", () => {
    const handle = createAiHandle();
    const fixture = createFixture();
    bindAiHandle(handle, fixture.runtime, "test");
    fixture.runtime.bind({ agentId: "duplicate", definitionId: "agent.standard" });
    const checkpoint = fixture.runtime.captureCheckpoint();
    checkpoint.agents.push(checkpoint.agents[0]!);
    const contributor = createAiSaveContributor({ handle });

    expect(contributor.validate?.({ id: "ai", version: "1", data: checkpoint }, {})).toEqual({
      issues: [expect.objectContaining({ code: "ai.save_invalid_agent_id" })]
    });
  });
});

function createFixture(
  options: {
    maxDecisionsPerTick?: number;
    maxSensorSamplesPerTick?: number;
    onTrace?: (entry: AiTraceEntry) => void;
    onTraceError?: (error: unknown, entry: AiTraceEntry) => void;
    tasks?: AiTaskExecutor[];
  } = {}
) {
  const intents: AiIntent[] = [];
  const runtime = createAiRuntime({
    dataRegistry: createRegistry(),
    world: createMemoryWorld(),
    intentSink: {
      emit(intent) {
        intents.push(intent);
      }
    },
    sensors: fixtureSensors(),
    inputs: fixtureInputs(),
    tasks: options.tasks ?? fixtureTasks(),
    ...(options.maxDecisionsPerTick === undefined
      ? {}
      : { maxDecisionsPerTick: options.maxDecisionsPerTick }),
    ...(options.maxSensorSamplesPerTick === undefined
      ? {}
      : { maxSensorSamplesPerTick: options.maxSensorSamplesPerTick }),
    ...(options.onTrace === undefined ? {} : { onTrace: options.onTrace }),
    ...(options.onTraceError === undefined ? {} : { onTraceError: options.onTraceError }),
    failureBackoffMs: 100,
    traceLimit: 200
  });
  return { runtime, intents, dispose: () => runtime.dispose() };
}

function fixtureSensors() {
  return [
    {
      id: "sensor.fixture",
      sample(context: { elapsed: number }) {
        return [fact("sensor.sample", context.elapsed, context.elapsed + 500)];
      }
    }
  ];
}

function fixtureInputs() {
  return ["attack", "flee"].map((id) => ({
    id,
    read(context: { blackboard<T = unknown>(key: string): T | undefined }) {
      return context.blackboard<number>(id) ?? 0;
    }
  }));
}

function fixtureTasks(): AiTaskExecutor[] {
  return [
    {
      id: "task.attack",
      start(context) {
        context.emit({ type: "action", actionId: "attack" });
        return { status: "running", state: { updates: 0 }, safeToInterrupt: true };
      },
      update(context) {
        const updates = Number(context.state.updates ?? 0) + 1;
        return { status: "running", state: { updates }, safeToInterrupt: true };
      }
    },
    {
      id: "task.flee",
      start(context) {
        context.emit({ type: "movement", desiredVelocity: { x: -1, y: 0 } });
        return { status: "running", safeToInterrupt: true };
      },
      update() {
        return { status: "running", safeToInterrupt: true };
      }
    }
  ];
}

function createRegistry(withPack = true): DataRegistry {
  const registry = createDataRegistry();
  for (const type of createAiDataTypes()) {
    registry.registerType(type);
  }
  if (withPack) {
    const validation = registry.registerPack(AI_PACK);
    if (validation.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      throw new Error(JSON.stringify(validation.diagnostics));
    }
  }
  return registry;
}

const AI_PACK: DataPack = {
  id: "ai.test",
  version: "1.0.0",
  entries: [
    {
      type: "ai.sensor",
      id: "sensor.visible",
      data: { id: "sensor.visible", sampler: "sensor.fixture", intervalMs: 100 }
    },
    {
      type: "ai.task",
      id: "task.attack",
      data: {
        id: "task.attack",
        executor: "task.attack",
        interruptPolicy: "always",
        timeoutMs: 200
      }
    },
    {
      type: "ai.task",
      id: "task.flee",
      data: { id: "task.flee", executor: "task.flee", interruptPolicy: "always" }
    },
    {
      type: "ai.goal",
      id: "goal.attack",
      data: {
        id: "goal.attack",
        task: { type: "ai.task", id: "task.attack" },
        considerations: [{ input: "attack", curve: { type: "linear" } }],
        commitmentMs: 500,
        switchThreshold: 0.1
      }
    },
    {
      type: "ai.goal",
      id: "goal.flee",
      data: {
        id: "goal.flee",
        task: { type: "ai.task", id: "task.flee" },
        considerations: [{ input: "flee", curve: { type: "linear" } }]
      }
    },
    {
      type: "ai.agent",
      id: "agent.standard",
      data: {
        id: "agent.standard",
        sensors: [{ type: "ai.sensor", id: "sensor.visible" }],
        goals: [
          { type: "ai.goal", id: "goal.attack" },
          { type: "ai.goal", id: "goal.flee" }
        ],
        decisionIntervalMs: 100,
        memoryLimit: 8
      }
    },
    {
      type: "ai.agent",
      id: "agent.tiny-memory",
      data: {
        id: "agent.tiny-memory",
        sensors: [],
        goals: [{ type: "ai.goal", id: "goal.attack" }],
        decisionIntervalMs: 100,
        memoryLimit: 2
      }
    }
  ]
};

function fact(key: string, observedAt: number, expiresAt?: number): AiPerceptionFact {
  return { key, observedAt, ...(expiresAt === undefined ? {} : { expiresAt }) };
}

function createMemoryWorld(): GameWorld {
  const componentData = new Map<EntityId, Map<string, unknown>>();
  let nextId = 0;
  const requireEntity = (entity: EntityId) => {
    const components = componentData.get(entity);
    if (components === undefined) {
      throw new Error(`Missing entity: ${String(entity)}`);
    }
    return components;
  };
  return {
    spawn() {
      const entity = `entity-${nextId}`;
      nextId += 1;
      componentData.set(entity, new Map());
      return entity;
    },
    despawn(entity) {
      componentData.delete(entity);
    },
    has(entity) {
      return componentData.has(entity);
    },
    add(entity, component, data) {
      requireEntity(entity).set(component.id, component.create(data));
    },
    get(entity, component) {
      return requireEntity(entity).get(component.id) as any;
    },
    set(entity, component, data) {
      const components = requireEntity(entity);
      const current = components.get(component.id) ?? component.create();
      components.set(component.id, { ...(current as object), ...data });
    },
    remove(entity, component) {
      requireEntity(entity).delete(component.id);
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
