import type {
  PhysicsBackendAdapter,
  PhysicsBodyState,
  PhysicsDimension,
  PhysicsRotation,
  PhysicsVector
} from "../runtime/types";

export type PhysicsBodyCommandConformanceReport = {
  dimension: PhysicsDimension;
  checks: string[];
  linearVelocity: PhysicsVector;
  angularVelocity?: PhysicsRotation | undefined;
};

export function runPhysicsBodyCommandConformance(input: {
  createBackend(): PhysicsBackendAdapter;
  dimension: PhysicsDimension;
}): PhysicsBodyCommandConformanceReport {
  const backend = input.createBackend();
  const capability = backend.capabilities().bodyCommands;
  assertConformance(capability?.linearImpulse === true, "linear impulse capability is declared");
  assertConformance(
    capability.applicationPoint === true,
    "application point capability is declared"
  );
  assertConformance(capability.angularImpulse === true, "angular impulse capability is declared");
  assertConformance(capability.wakePolicy === true, "wake policy capability is declared");

  const scene = backend.createScene({
    id: `physics.body-command.${input.dimension}`,
    dimension: input.dimension,
    gravity: vector(input.dimension, 0, 0, 0)
  });
  try {
    assertConformance(scene.applyBodyCommand !== undefined, "scene exposes body command method");
    const dynamicId = scene.createBody({
      id: "body.dynamic",
      kind: "dynamic",
      position: vector(input.dimension, 0, 0, 0),
      linearVelocity: vector(input.dimension, 0, 0, 0),
      angularVelocity: angular(input.dimension, 0)
    });
    scene.createCollider({
      id: "body.dynamic.collider",
      bodyId: dynamicId,
      shape:
        input.dimension === "2d" ? { type: "circle", radius: 0.5 } : { type: "sphere", radius: 0.5 }
    });
    const staticId = scene.createBody({ id: "body.static", kind: "static" });

    expectStatus(
      scene.applyBodyCommand({
        type: "linear-impulse",
        bodyId: "body.missing",
        impulse: vector(input.dimension, 1, 0, 0)
      }),
      "body-missing"
    );
    expectStatus(
      scene.applyBodyCommand({
        type: "linear-impulse",
        bodyId: staticId,
        impulse: vector(input.dimension, 1, 0, 0)
      }),
      "body-kind-mismatch"
    );

    scene.updateBody(dynamicId, { sleeping: true });
    expectStatus(
      scene.applyBodyCommand({
        type: "linear-impulse",
        bodyId: dynamicId,
        impulse: vector(input.dimension, 2, 0, 0),
        wake: "preserve"
      }),
      "applied"
    );
    const preserved = requireBody(scene.getBodyState(dynamicId));
    assertConformance(preserved.sleeping, "preserve keeps a sleeping body asleep");
    assertConformance(preserved.linearVelocity.x > 0, "linear impulse changes velocity");

    expectStatus(
      scene.applyBodyCommand({
        type: "linear-impulse",
        bodyId: dynamicId,
        impulse: vector(input.dimension, 0.5, 0, 0),
        wake: "wake"
      }),
      "applied"
    );
    assertConformance(!requireBody(scene.getBodyState(dynamicId)).sleeping, "wake wakes the body");

    scene.updateBody(dynamicId, {
      linearVelocity: vector(input.dimension, 0, 0, 0),
      angularVelocity: angular(input.dimension, 0)
    });
    expectStatus(
      scene.applyBodyCommand({
        type: "linear-impulse",
        bodyId: dynamicId,
        impulse: vector(input.dimension, 1, 0, 0),
        point: vector(input.dimension, 0, 1, 0)
      }),
      "applied"
    );
    const pointApplied = requireBody(scene.getBodyState(dynamicId));
    assertConformance(
      angularMagnitude(pointApplied.angularVelocity) > 0,
      "off-center impulse changes angular velocity"
    );

    expectStatus(
      scene.applyBodyCommand({
        type: "angular-impulse",
        bodyId: dynamicId,
        impulse: angular(input.dimension, -0.5)
      }),
      "applied"
    );
    const angularApplied = requireBody(scene.getBodyState(dynamicId));
    assertConformance(
      angularMagnitude(angularApplied.angularVelocity) >
        angularMagnitude(pointApplied.angularVelocity),
      "angular impulse accumulates angular velocity"
    );

    assertConformance(
      scene.captureCheckpoint !== undefined && scene.restoreCheckpoint !== undefined,
      "backend exposes checkpoint replay for command conformance"
    );
    scene.updateBody(dynamicId, {
      linearVelocity: vector(input.dimension, 0, 0, 0),
      angularVelocity: angular(input.dimension, 0)
    });
    const checkpoint = scene.captureCheckpoint();
    const replayCommand = {
      type: "linear-impulse" as const,
      bodyId: dynamicId,
      impulse: vector(input.dimension, 1.25, 0.5, 0)
    };
    expectStatus(scene.applyBodyCommand(replayCommand), "applied");
    const first = requireBody(scene.getBodyState(dynamicId));
    scene.restoreCheckpoint(checkpoint);
    expectStatus(scene.applyBodyCommand(replayCommand), "applied");
    const replayed = requireBody(scene.getBodyState(dynamicId));
    assertVectorClose(first.linearVelocity, replayed.linearVelocity, "checkpoint replay is stable");

    return {
      dimension: input.dimension,
      checks: [
        "capabilities",
        "missing body rejection",
        "body kind rejection",
        "linear impulse",
        "wake policy",
        "application point",
        "angular impulse",
        "checkpoint replay"
      ],
      linearVelocity: structuredClone(replayed.linearVelocity),
      ...(replayed.angularVelocity === undefined
        ? {}
        : { angularVelocity: structuredClone(replayed.angularVelocity) })
    };
  } finally {
    scene.dispose();
  }
}

function expectStatus(
  result: { status: string } | undefined,
  expected: string
): asserts result is { status: string } {
  assertConformance(
    result?.status === expected,
    `expected ${expected}, received ${result?.status}`
  );
}

function requireBody(state: PhysicsBodyState | undefined): PhysicsBodyState {
  assertConformance(state !== undefined, "body state is available");
  return state;
}

function vector(dimension: PhysicsDimension, x: number, y: number, z: number): PhysicsVector {
  return dimension === "2d" ? { x, y } : { x, y, z };
}

function angular(dimension: PhysicsDimension, value: number): PhysicsRotation {
  return dimension === "2d" ? value : { x: 0, y: 0, z: value };
}

function angularMagnitude(value: PhysicsRotation | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return Math.abs(value);
  if ("w" in value) return Math.hypot(value.x, value.y, value.z, value.w);
  return Math.hypot(value.x, value.y, value.z ?? 0);
}

function assertVectorClose(actual: PhysicsVector, expected: PhysicsVector, message: string): void {
  assertConformance(Math.abs(actual.x - expected.x) < 1e-6, message);
  assertConformance(Math.abs(actual.y - expected.y) < 1e-6, message);
  assertConformance(Math.abs((actual.z ?? 0) - (expected.z ?? 0)) < 1e-6, message);
}

function assertConformance(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Physics body command conformance failed: ${message}`);
}
