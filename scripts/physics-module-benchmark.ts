import { performance } from "node:perf_hooks";
import { createEventBus } from "../packages/event-bus/src";
import { createGame } from "../packages/game-runtime/src";
import {
  PhysicsBodyComponent,
  PhysicsColliderComponent,
  PhysicsTransformComponent,
  createPhysicsInterpolationStore,
  createPhysicsModule,
  type PhysicsBackendAdapter,
  type PhysicsBodyId,
  type PhysicsBodyState,
  type PhysicsColliderId,
  type PhysicsColliderState,
  type PhysicsContactEvent,
  type PhysicsScene
} from "../packages/physics-core/src";
import { createKootaWorld } from "../packages/world-koota/src";

const TICK_MS = 50;
const contactCases = [
  runContactCase(250, 200),
  runContactCase(1_000, 100),
  runContactCase(3_000, 40)
];
const interpolationCase = runInterpolationCase(3_000, 40, 100);
const checkEnabled = process.argv.includes("--check");
const largestContactCase = contactCases.at(-1);
const failures: string[] = [];
if (checkEnabled && largestContactCase && largestContactCase.msPerTick > 50) {
  failures.push(
    `3,000 entity physics module frame exceeded 50ms: ${largestContactCase.msPerTick}ms`
  );
}
if (checkEnabled && interpolationCase.msPerTick > 50) {
  failures.push(
    `3,000 body interpolation tracking frame exceeded 50ms: ${interpolationCase.msPerTick}ms`
  );
}
if (checkEnabled && interpolationCase.microsecondsPerSample > 5) {
  failures.push(
    `Interpolation sampling exceeded 5us: ${interpolationCase.microsecondsPerSample}us`
  );
}
if (checkEnabled && interpolationCase.trackedBodyCount !== interpolationCase.entityCount) {
  failures.push(
    `Interpolation tracked ${interpolationCase.trackedBodyCount}/${interpolationCase.entityCount} bodies`
  );
}
if (checkEnabled && interpolationCase.retainedBodyCountAfterDispose !== 0) {
  failures.push(
    `Interpolation retained ${interpolationCase.retainedBodyCountAfterDispose} bodies after dispose`
  );
}

console.log(
  JSON.stringify(
    {
      benchmark: "physics-module-hot-paths",
      contactCases,
      interpolationCase,
      ...(checkEnabled ? { check: { passed: failures.length === 0, failures } } : {})
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exitCode = 1;
}

function runContactCase(entityCount: number, ticks: number) {
  const world = createKootaWorld();
  for (let index = 0; index < entityCount; index += 1) {
    const entity = world.spawn();
    world.add(entity, PhysicsBodyComponent, {
      definition: { kind: "static", position: { x: index, y: 0 } }
    });
    world.add(entity, PhysicsTransformComponent, {
      position: { x: index, y: 0 }
    });
    world.add(entity, PhysicsColliderComponent, {
      definition: { shape: { type: "circle", radius: 0.5 } }
    });
  }

  const runtime = createGame({
    modules: [
      createPhysicsModule({
        backend: createContactBenchmarkBackend(),
        fixedDeltaMs: TICK_MS,
        eventPolicy: { emitContacts: false }
      })
    ],
    world,
    eventBus: createEventBus({ clock: () => 0 }),
    seed: `physics-benchmark-${entityCount}`
  });
  runtime.start();
  for (let tick = 0; tick < 5; tick += 1) {
    runtime.tick(TICK_MS);
  }

  const start = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    runtime.tick(TICK_MS);
  }
  const durationMs = performance.now() - start;
  runtime.dispose();

  return {
    entityCount,
    contactsPerTick: Math.floor(entityCount / 2),
    ticks,
    durationMs: round(durationMs),
    msPerTick: round(durationMs / ticks),
    microsecondsPerEntity: round((durationMs * 1000) / (ticks * entityCount))
  };
}

function runInterpolationCase(entityCount: number, ticks: number, sampleIterations: number) {
  const world = createKootaWorld();
  const entities: number[] = [];
  for (let index = 0; index < entityCount; index += 1) {
    const entity = world.spawn();
    entities.push(entity);
    world.add(entity, PhysicsBodyComponent, {
      definition: { kind: "dynamic", position: { x: index, y: 0 } }
    });
    world.add(entity, PhysicsTransformComponent, {
      position: { x: index, y: 0 }
    });
  }

  const interpolation = createPhysicsInterpolationStore({ id: "physics-benchmark" });
  const runtime = createGame({
    modules: [
      createPhysicsModule({
        backend: createContactBenchmarkBackend(),
        fixedDeltaMs: TICK_MS,
        eventPolicy: { emitContacts: false },
        interpolationStore: interpolation
      })
    ],
    world,
    eventBus: createEventBus({ clock: () => 0 }),
    seed: `physics-interpolation-benchmark-${entityCount}`
  });
  runtime.start();
  for (let tick = 0; tick < 5; tick += 1) {
    runtime.tick(TICK_MS);
  }

  const bodyIds = entities.map((entity) => {
    const bodyId = world.get(entity, PhysicsBodyComponent)?.bodyId;
    if (!bodyId) {
      throw new Error(`Physics benchmark body was not created for entity ${entity}`);
    }
    return bodyId;
  });
  const tickStart = performance.now();
  for (let tick = 0; tick < ticks; tick += 1) {
    runtime.tick(TICK_MS);
  }
  const tickDurationMs = performance.now() - tickStart;

  const reusable = { position: { x: 0, y: 0 } };
  const sampleStart = performance.now();
  for (let iteration = 0; iteration < sampleIterations; iteration += 1) {
    for (const bodyId of bodyIds) {
      interpolation.sample(bodyId, reusable);
    }
  }
  const sampleDurationMs = performance.now() - sampleStart;
  const trackedBodyCount = interpolation.snapshot().trackedBodyCount;
  runtime.dispose();

  return {
    entityCount,
    ticks,
    sampleCount: entityCount * sampleIterations,
    tickDurationMs: round(tickDurationMs),
    msPerTick: round(tickDurationMs / ticks),
    sampleDurationMs: round(sampleDurationMs),
    microsecondsPerSample: round((sampleDurationMs * 1_000) / (entityCount * sampleIterations)),
    trackedBodyCount,
    retainedBodyCountAfterDispose: interpolation.snapshot().trackedBodyCount
  };
}

function createContactBenchmarkBackend(): PhysicsBackendAdapter {
  return {
    id: "physics-contact-benchmark",
    kind: "benchmark",
    dimension: "2d",
    createScene() {
      return createContactBenchmarkScene();
    },
    capabilities() {
      return {
        dimension: "2d",
        bodies: true,
        colliders: true,
        sensors: true,
        queries: []
      };
    }
  };
}

function createContactBenchmarkScene(): PhysicsScene {
  const bodies = new Map<PhysicsBodyId, PhysicsBodyState>();
  const colliders = new Map<PhysicsColliderId, PhysicsColliderState>();
  let nextBodyId = 0;
  let nextColliderId = 0;

  return {
    id: "physics-contact-benchmark",
    createBody(definition) {
      const id = definition.id ?? `body-${++nextBodyId}`;
      bodies.set(id, {
        id,
        kind: definition.kind,
        position: { ...(definition.position ?? { x: 0, y: 0 }) },
        linearVelocity: { ...(definition.linearVelocity ?? { x: 0, y: 0 }) },
        sleeping: false,
        ...(definition.rotation === undefined ? {} : { rotation: definition.rotation }),
        ...(definition.angularVelocity === undefined
          ? {}
          : { angularVelocity: definition.angularVelocity })
      });
      return id;
    },
    updateBody(id, patch) {
      const state = bodies.get(id);
      if (!state) {
        return;
      }
      bodies.set(id, {
        ...state,
        ...(patch.position === undefined ? {} : { position: { ...patch.position } }),
        ...(patch.linearVelocity === undefined
          ? {}
          : { linearVelocity: { ...patch.linearVelocity } }),
        ...(patch.rotation === undefined ? {} : { rotation: patch.rotation }),
        ...(patch.angularVelocity === undefined ? {} : { angularVelocity: patch.angularVelocity }),
        ...(patch.sleeping === undefined ? {} : { sleeping: patch.sleeping })
      });
    },
    destroyBody(id) {
      bodies.delete(id);
      for (const [colliderId, collider] of colliders) {
        if (collider.bodyId === id) {
          colliders.delete(colliderId);
        }
      }
    },
    createCollider(definition) {
      const id = definition.id ?? `collider-${++nextColliderId}`;
      colliders.set(id, {
        id,
        ...(definition.bodyId === undefined ? {} : { bodyId: definition.bodyId }),
        shape: definition.shape,
        sensor: definition.sensor ?? false,
        enabled: true,
        ...(definition.material === undefined ? {} : { material: definition.material }),
        ...(definition.filter === undefined ? {} : { filter: definition.filter }),
        ...(definition.offset === undefined ? {} : { offset: definition.offset })
      });
      return id;
    },
    updateCollider(id, patch) {
      const state = colliders.get(id);
      if (state) {
        colliders.set(id, { ...state, ...patch });
      }
    },
    destroyCollider(id) {
      colliders.delete(id);
    },
    step() {
      const colliderStates = [...colliders.values()];
      const contacts: PhysicsContactEvent[] = [];
      for (let index = 0; index + 1 < colliderStates.length; index += 2) {
        const a = colliderStates[index];
        const b = colliderStates[index + 1];
        if (a && b) {
          contacts.push({
            phase: "enter",
            kind: "contact",
            colliderA: a.id,
            colliderB: b.id,
            ...(a.bodyId === undefined ? {} : { bodyA: a.bodyId }),
            ...(b.bodyId === undefined ? {} : { bodyB: b.bodyId }),
            sensor: a.sensor || b.sensor
          });
        }
      }
      return { deltaMs: TICK_MS, contacts, diagnostics: [] };
    },
    getBodyState(id) {
      return bodies.get(id);
    },
    getColliderState(id) {
      return colliders.get(id);
    },
    query() {
      return [];
    },
    snapshot() {
      return {
        id: "physics-contact-benchmark",
        backend: "benchmark",
        dimension: "2d",
        gravity: { x: 0, y: 0 },
        bodyCount: bodies.size,
        colliderCount: colliders.size,
        activeContactCount: Math.floor(colliders.size / 2),
        disposed: false
      };
    },
    dispose() {
      bodies.clear();
      colliders.clear();
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
