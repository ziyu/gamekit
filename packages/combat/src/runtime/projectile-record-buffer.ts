import type {
  CombatKinematicProjectileRecord,
  CombatKinematicProjectileRecordBufferDiagnostics
} from "./projectile-network-types";

export type CombatKinematicProjectileRecordUpsertResult = {
  status: "inserted" | "updated" | "duplicate" | "conflict" | "stale-generation";
  record?: CombatKinematicProjectileRecord | undefined;
  evicted?: CombatKinematicProjectileRecord | undefined;
};

export type CombatKinematicProjectileRecordBufferOptions = {
  generation: string | number;
  capacity?: number | undefined;
};

export type CombatKinematicProjectileRecordBuffer = {
  upsert(record: CombatKinematicProjectileRecord): CombatKinematicProjectileRecordUpsertResult;
  get(projectileId: string): CombatKinematicProjectileRecord | undefined;
  list(): CombatKinematicProjectileRecord[];
  reset(generation: string | number): void;
  diagnostics(): CombatKinematicProjectileRecordBufferDiagnostics;
  dispose(): void;
};

const DEFAULT_CAPACITY = 256;

export function createCombatKinematicProjectileRecordBuffer(
  options: CombatKinematicProjectileRecordBufferOptions
): CombatKinematicProjectileRecordBuffer {
  const capacity = normalizePositiveInteger(options.capacity, DEFAULT_CAPACITY);
  const records = new Map<string, CombatKinematicProjectileRecord>();
  const order: string[] = [];
  let generation = options.generation;
  let disposed = false;
  const diagnostics: Omit<
    CombatKinematicProjectileRecordBufferDiagnostics,
    "generation" | "records"
  > = {
    inserted: 0,
    updated: 0,
    duplicates: 0,
    conflicts: 0,
    staleGenerations: 0,
    evicted: 0,
    resets: 0
  };

  return {
    upsert(record) {
      assertActive();
      validateRecord(record);
      if (record.generation !== generation) {
        diagnostics.staleGenerations += 1;
        return { status: "stale-generation" };
      }
      const key = recordKey(record.generation, record.projectileId);
      const existing = records.get(key);
      if (existing !== undefined) {
        if (!sameFire(existing, record)) {
          diagnostics.conflicts += 1;
          return { status: "conflict", record: cloneRecord(existing) };
        }
        if (record.finish === undefined || sameFinish(existing.finish, record.finish)) {
          diagnostics.duplicates += 1;
          return { status: "duplicate", record: cloneRecord(existing) };
        }
        if (existing.finish !== undefined) {
          diagnostics.conflicts += 1;
          return { status: "conflict", record: cloneRecord(existing) };
        }
        const updated = cloneRecord(record);
        records.set(key, updated);
        diagnostics.updated += 1;
        return { status: "updated", record: cloneRecord(updated) };
      }

      const inserted = cloneRecord(record);
      records.set(key, inserted);
      order.push(key);
      diagnostics.inserted += 1;
      const evicted = trimToCapacity();
      return {
        status: "inserted",
        record: cloneRecord(inserted),
        ...(evicted === undefined ? {} : { evicted })
      };
    },
    get(projectileId) {
      assertActive();
      const record = records.get(recordKey(generation, projectileId));
      return record === undefined ? undefined : cloneRecord(record);
    },
    list() {
      assertActive();
      return order
        .map((key) => records.get(key))
        .filter((record): record is CombatKinematicProjectileRecord => record !== undefined)
        .map(cloneRecord);
    },
    reset(nextGeneration) {
      assertActive();
      generation = nextGeneration;
      records.clear();
      order.length = 0;
      diagnostics.resets += 1;
    },
    diagnostics() {
      return {
        ...diagnostics,
        generation,
        records: records.size
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      records.clear();
      order.length = 0;
    }
  };

  function trimToCapacity(): CombatKinematicProjectileRecord | undefined {
    let evicted: CombatKinematicProjectileRecord | undefined;
    while (records.size > capacity) {
      const key = order.shift();
      if (key === undefined) {
        break;
      }
      const record = records.get(key);
      if (record === undefined) {
        continue;
      }
      records.delete(key);
      diagnostics.evicted += 1;
      evicted = cloneRecord(record);
    }
    return evicted;
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Combat kinematic projectile record buffer has been disposed.");
    }
  }
}

export function cloneCombatKinematicProjectileRecord(
  record: CombatKinematicProjectileRecord
): CombatKinematicProjectileRecord {
  return cloneRecord(record);
}

function cloneRecord(record: CombatKinematicProjectileRecord): CombatKinematicProjectileRecord {
  return {
    ...record,
    firePosition: cloneVector(record.firePosition),
    fireVelocity: cloneVector(record.fireVelocity),
    ...(record.finish === undefined
      ? {}
      : {
          finish: {
            ...record.finish,
            position: cloneVector(record.finish.position),
            ...(record.finish.normal === undefined
              ? {}
              : { normal: cloneVector(record.finish.normal) }),
            ...(record.finish.subject === undefined
              ? {}
              : { subject: { ...record.finish.subject } })
          }
        })
  };
}

function sameFire(
  left: CombatKinematicProjectileRecord,
  right: CombatKinematicProjectileRecord
): boolean {
  return (
    left.projectileId === right.projectileId &&
    left.correlationId === right.correlationId &&
    left.generation === right.generation &&
    left.definitionId === right.definitionId &&
    left.definitionVersion === right.definitionVersion &&
    left.fireTick === right.fireTick &&
    left.fixedDeltaMs === right.fixedDeltaMs &&
    left.expiresTick === right.expiresTick &&
    vectorsEqual(left.firePosition, right.firePosition) &&
    vectorsEqual(left.fireVelocity, right.fireVelocity)
  );
}

function sameFinish(
  left: CombatKinematicProjectileRecord["finish"],
  right: NonNullable<CombatKinematicProjectileRecord["finish"]>
): boolean {
  if (left === undefined) {
    return false;
  }
  return (
    left.tick === right.tick &&
    left.reason === right.reason &&
    vectorsEqual(left.position, right.position) &&
    optionalVectorsEqual(left.normal, right.normal) &&
    subjectsEqual(left.subject, right.subject)
  );
}

function subjectsEqual(
  left: NonNullable<CombatKinematicProjectileRecord["finish"]>["subject"],
  right: NonNullable<CombatKinematicProjectileRecord["finish"]>["subject"]
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.actorId === right.actorId &&
    left.entityId === right.entityId &&
    left.bodyId === right.bodyId &&
    left.colliderId === right.colliderId
  );
}

function optionalVectorsEqual(
  left: { x: number; y: number; z?: number } | undefined,
  right: { x: number; y: number; z?: number } | undefined
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return vectorsEqual(left, right);
}

function vectorsEqual(
  left: { x: number; y: number; z?: number },
  right: { x: number; y: number; z?: number }
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function cloneVector(vector: { x: number; y: number; z?: number }): {
  x: number;
  y: number;
  z?: number;
} {
  return {
    x: vector.x,
    y: vector.y,
    ...(vector.z === undefined ? {} : { z: vector.z })
  };
}

function validateRecord(record: CombatKinematicProjectileRecord): void {
  if (
    record.projectileId.length === 0 ||
    record.correlationId.length === 0 ||
    record.definitionId.length === 0 ||
    record.definitionVersion.length === 0
  ) {
    throw new Error("Combat kinematic projectile record requires stable identity and definition.");
  }
  if (
    !Number.isSafeInteger(record.fireTick) ||
    !Number.isSafeInteger(record.expiresTick) ||
    record.expiresTick <= record.fireTick ||
    !Number.isFinite(record.fixedDeltaMs) ||
    record.fixedDeltaMs <= 0
  ) {
    throw new Error("Combat kinematic projectile record has an invalid timeline.");
  }
  validateGeneration(record.generation);
  validateVector(record.firePosition, "firePosition");
  validateVector(record.fireVelocity, "fireVelocity");
  if (record.finish !== undefined) {
    if (
      !Number.isSafeInteger(record.finish.tick) ||
      record.finish.tick < record.fireTick ||
      record.finish.tick > record.expiresTick ||
      record.finish.reason.length === 0
    ) {
      throw new Error("Combat kinematic projectile finish has an invalid timeline or reason.");
    }
    validateVector(record.finish.position, "finish.position");
    if (record.finish.normal !== undefined) {
      validateVector(record.finish.normal, "finish.normal");
    }
  }
}

function validateGeneration(generation: string | number): void {
  if (
    (typeof generation === "string" && generation.length === 0) ||
    (typeof generation === "number" && !Number.isSafeInteger(generation))
  ) {
    throw new Error("Combat kinematic projectile generation is invalid.");
  }
}

function validateVector(vector: { x: number; y: number; z?: number }, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    (vector.z !== undefined && !Number.isFinite(vector.z))
  ) {
    throw new Error(`Combat kinematic projectile ${label} must be finite.`);
  }
}

function recordKey(generation: string | number, projectileId: string): string {
  return `${String(generation)}\u0000${projectileId}`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}
