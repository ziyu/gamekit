import type {
  PhysicsBackendAdapter,
  PhysicsBodyDefinition,
  PhysicsBodyPatch,
  PhysicsBodyState,
  PhysicsColliderDefinition,
  PhysicsSceneConfig,
  PhysicsStepResult
} from "./types";

export type PhysicsBodyPredictionApplyContext<TInput> = {
  sequence: number;
  input: TInput;
  replay: boolean;
  stepMs: number;
  tick?: number;
  timestamp?: number;
};

export type PhysicsBodyPredictionEnvironment = {
  bodies?: readonly PhysicsBodyDefinition[];
  colliders?: readonly PhysicsColliderDefinition[];
};

export type PhysicsBodyPredictionSubject<TState, TInput> = {
  body: PhysicsBodyDefinition;
  colliders?: readonly PhysicsColliderDefinition[];
  readState(state: TState): PhysicsBodyPatch;
  applyInput(
    state: TState,
    input: TInput,
    context: PhysicsBodyPredictionApplyContext<TInput>
  ): PhysicsBodyPatch | undefined;
  writeState(state: TState, body: PhysicsBodyState): TState;
};

export type CreatePhysicsBodyPredictionOptions<TState, TInput> = {
  backend: PhysicsBackendAdapter;
  scene?: PhysicsSceneConfig;
  environment?: PhysicsBodyPredictionEnvironment;
  subject: PhysicsBodyPredictionSubject<TState, TInput>;
  fixedDeltaMs?: number;
  maxSubSteps?: number;
  maxCachedFrames?: number;
  onStep?(result: PhysicsStepResult, context: PhysicsBodyPredictionApplyContext<TInput>): void;
};

export type PhysicsBodyPredictionDiagnostics = {
  backend: string;
  predictedInputs: number;
  replayedInputs: number;
  physicsSteps: number;
  droppedStepTimeMs: number;
  lastSubSteps: number;
  cachedReplays: number;
  replayCacheMisses: number;
  cachedFrames: number;
};

export type PhysicsBodyPredictionTransition<TState, TInput> = {
  apply(state: TState, input: TInput, context: PhysicsBodyPredictionApplyContext<TInput>): TState;
  diagnostics(): PhysicsBodyPredictionDiagnostics;
  dispose(): void;
};

const DEFAULT_FIXED_DELTA_MS = 1000 / 60;
const DEFAULT_MAX_SUB_STEPS = 8;
const DEFAULT_MAX_CACHED_FRAMES = 256;
const STEP_EPSILON_MS = 0.000_001;

type CachedPhysicsPredictionFrame = {
  before: PhysicsBodyState;
  after: PhysicsBodyState;
};

export function createPhysicsBodyPredictionTransition<TState, TInput>(
  options: CreatePhysicsBodyPredictionOptions<TState, TInput>
): PhysicsBodyPredictionTransition<TState, TInput> {
  const fixedDeltaMs = normalizePositive(options.fixedDeltaMs, DEFAULT_FIXED_DELTA_MS);
  const maxSubSteps = normalizePositiveInteger(options.maxSubSteps, DEFAULT_MAX_SUB_STEPS);
  const maxCachedFrames = normalizePositiveInteger(
    options.maxCachedFrames,
    DEFAULT_MAX_CACHED_FRAMES
  );
  const scene = options.backend.createScene({
    ...options.scene,
    fixedDeltaMs
  });
  const subjectBodyId = requireDefinitionId(options.subject.body.id, "prediction subject body");
  const diagnostics: PhysicsBodyPredictionDiagnostics = {
    backend: options.backend.kind,
    predictedInputs: 0,
    replayedInputs: 0,
    physicsSteps: 0,
    droppedStepTimeMs: 0,
    lastSubSteps: 0,
    cachedReplays: 0,
    replayCacheMisses: 0,
    cachedFrames: 0
  };
  const cachedFrames = new Map<number, CachedPhysicsPredictionFrame>();
  const cachedFrameOrder: number[] = [];
  let disposed = false;

  try {
    for (const body of options.environment?.bodies ?? []) {
      scene.createBody(body);
    }
    for (const collider of options.environment?.colliders ?? []) {
      scene.createCollider(collider);
    }
    scene.createBody(options.subject.body);
    for (const collider of options.subject.colliders ?? []) {
      scene.createCollider({ ...collider, bodyId: collider.bodyId ?? subjectBodyId });
    }
  } catch (error) {
    scene.dispose();
    throw error;
  }

  return {
    apply(state, input, context) {
      assertActive(disposed);
      const statePatch = options.subject.readState(state);
      const inputPatch = options.subject.applyInput(state, input, context);
      const cachedFrame = context.replay ? cachedFrames.get(context.sequence) : undefined;
      if (cachedFrame !== undefined && bodyPatchMatchesState(statePatch, cachedFrame.before)) {
        diagnostics.predictedInputs += 1;
        diagnostics.replayedInputs += 1;
        diagnostics.cachedReplays += 1;
        diagnostics.lastSubSteps = 0;
        return options.subject.writeState(state, cloneBodyState(cachedFrame.after));
      }
      if (context.replay) {
        diagnostics.replayCacheMisses += 1;
      }
      const currentBody = scene.getBodyState(subjectBodyId);
      if (currentBody === undefined) {
        throw new Error(`Missing physics prediction subject body: ${subjectBodyId}`);
      }
      scene.updateBody(subjectBodyId, {
        ...omitUnchangedTransform(statePatch, currentBody),
        ...inputPatch,
        sleeping: false
      });
      const before = applyPatchToBodyState(currentBody, statePatch);

      let remainingMs = normalizeNonNegative(context.stepMs);
      let subSteps = 0;
      while (remainingMs > STEP_EPSILON_MS && subSteps < maxSubSteps) {
        const deltaMs = Math.min(fixedDeltaMs, remainingMs);
        const result = scene.step(deltaMs, {
          ...(context.tick === undefined ? {} : { tick: context.tick }),
          ...(context.timestamp === undefined ? {} : { elapsed: context.timestamp })
        });
        options.onStep?.(result, context);
        remainingMs -= deltaMs;
        subSteps += 1;
      }
      diagnostics.predictedInputs += 1;
      diagnostics.replayedInputs += context.replay ? 1 : 0;
      diagnostics.physicsSteps += subSteps;
      diagnostics.lastSubSteps = subSteps;
      if (remainingMs > STEP_EPSILON_MS) {
        diagnostics.droppedStepTimeMs += remainingMs;
      }

      const body = scene.getBodyState(subjectBodyId);
      if (body === undefined) {
        throw new Error(`Missing physics prediction subject body: ${subjectBodyId}`);
      }
      cacheFrame(context.sequence, before, body);
      return options.subject.writeState(state, body);
    },
    diagnostics() {
      return { ...diagnostics };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cachedFrames.clear();
      cachedFrameOrder.length = 0;
      diagnostics.cachedFrames = 0;
      scene.dispose();
    }
  };

  function cacheFrame(sequence: number, before: PhysicsBodyState, after: PhysicsBodyState): void {
    if (!cachedFrames.has(sequence)) {
      cachedFrameOrder.push(sequence);
    }
    cachedFrames.set(sequence, {
      before: cloneBodyState(before),
      after: cloneBodyState(after)
    });
    while (cachedFrameOrder.length > maxCachedFrames) {
      const expiredSequence = cachedFrameOrder.shift();
      if (expiredSequence !== undefined) {
        cachedFrames.delete(expiredSequence);
      }
    }
    diagnostics.cachedFrames = cachedFrames.size;
  }
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("Physics body prediction transition has been disposed.");
  }
}

function requireDefinitionId(id: string | undefined, label: string): string {
  if (id === undefined || id.length === 0) {
    throw new Error(`${label} requires an id.`);
  }
  return id;
}

function omitUnchangedTransform(
  patch: PhysicsBodyPatch,
  current: PhysicsBodyState
): PhysicsBodyPatch {
  const { position, rotation, ...rest } = patch;
  return {
    ...rest,
    ...(position === undefined || vectorsEqual(position, current.position) ? {} : { position }),
    ...(rotation === undefined || rotationsEqual(rotation, current.rotation) ? {} : { rotation })
  };
}

function vectorsEqual(
  left: { x: number; y: number; z?: number },
  right: { x: number; y: number; z?: number }
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function rotationsEqual(
  left: NonNullable<PhysicsBodyPatch["rotation"]>,
  right: PhysicsBodyState["rotation"]
): boolean {
  if (right === undefined || typeof left !== typeof right) {
    return false;
  }
  if (typeof left === "number" || typeof right === "number") {
    return left === right;
  }
  if (!vectorsEqual(left, right)) {
    return false;
  }
  return !("w" in left) || ("w" in right && left.w === right.w);
}

function bodyPatchMatchesState(patch: PhysicsBodyPatch, state: PhysicsBodyState): boolean {
  return (
    (patch.position === undefined || vectorsEqual(patch.position, state.position)) &&
    (patch.rotation === undefined || rotationsEqual(patch.rotation, state.rotation)) &&
    (patch.linearVelocity === undefined ||
      vectorsEqual(patch.linearVelocity, state.linearVelocity)) &&
    (patch.angularVelocity === undefined ||
      rotationsEqual(patch.angularVelocity, state.angularVelocity)) &&
    (patch.sleeping === undefined || patch.sleeping === state.sleeping)
  );
}

function applyPatchToBodyState(state: PhysicsBodyState, patch: PhysicsBodyPatch): PhysicsBodyState {
  return {
    ...cloneBodyState(state),
    ...(patch.position === undefined ? {} : { position: cloneVector(patch.position) }),
    ...(patch.rotation === undefined ? {} : { rotation: cloneRotation(patch.rotation) }),
    ...(patch.linearVelocity === undefined
      ? {}
      : { linearVelocity: cloneVector(patch.linearVelocity) }),
    ...(patch.angularVelocity === undefined
      ? {}
      : { angularVelocity: cloneRotation(patch.angularVelocity) }),
    ...(patch.sleeping === undefined ? {} : { sleeping: patch.sleeping }),
    ...(patch.userData === undefined ? {} : { userData: { ...patch.userData } })
  };
}

function cloneBodyState(state: PhysicsBodyState): PhysicsBodyState {
  return {
    ...state,
    position: cloneVector(state.position),
    linearVelocity: cloneVector(state.linearVelocity),
    ...(state.rotation === undefined ? {} : { rotation: cloneRotation(state.rotation) }),
    ...(state.angularVelocity === undefined
      ? {}
      : { angularVelocity: cloneRotation(state.angularVelocity) }),
    ...(state.userData === undefined ? {} : { userData: { ...state.userData } })
  };
}

function cloneVector(vector: { x: number; y: number; z?: number }): {
  x: number;
  y: number;
  z?: number;
} {
  return { x: vector.x, y: vector.y, ...(vector.z === undefined ? {} : { z: vector.z }) };
}

function cloneRotation(
  rotation: NonNullable<PhysicsBodyState["rotation"]>
): NonNullable<PhysicsBodyState["rotation"]> {
  return typeof rotation === "number" ? rotation : { ...rotation };
}

function normalizePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

function normalizeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
