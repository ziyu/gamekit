export type MultiplayerPredictionGeneration = string | number;

export type MultiplayerPredictedSpawnIdentity = {
  kind: string;
  correlationId: string;
  generation: MultiplayerPredictionGeneration;
};

export type MultiplayerPredictedSpawn<TValue> = MultiplayerPredictedSpawnIdentity & {
  localId: string;
  tick: number;
  value: TValue;
};

export type MultiplayerAuthoritativeSpawn<TValue> = MultiplayerPredictedSpawnIdentity & {
  authorityId: string;
  tick: number;
  value: TValue;
};

export type MultiplayerPredictedSpawnRegisterResult<TValue> = {
  status: "registered" | "duplicate" | "conflict" | "stale-generation";
  spawn?: MultiplayerPredictedSpawn<TValue> | undefined;
  evicted?: MultiplayerPredictedSpawn<TValue> | undefined;
};

export type MultiplayerPredictedSpawnMatchResult<TPredicted, TAuthority> = {
  status: "matched" | "unmatched" | "duplicate" | "stale-generation";
  predicted?: MultiplayerPredictedSpawn<TPredicted> | undefined;
  authority?: MultiplayerAuthoritativeSpawn<TAuthority> | undefined;
};

export type MultiplayerPredictedSpawnRejectResult<TValue> = {
  status: "rejected" | "missing" | "duplicate" | "stale-generation";
  predicted?: MultiplayerPredictedSpawn<TValue> | undefined;
  reason?: string | undefined;
};

export type MultiplayerPredictedSpawnRegistryDiagnostics = {
  generation: MultiplayerPredictionGeneration;
  registered: number;
  matched: number;
  unmatched: number;
  rejected: number;
  duplicates: number;
  conflicts: number;
  staleGenerations: number;
  expired: number;
  evicted: number;
  resets: number;
  pending: number;
  resolved: number;
  pendingOrderEntries: number;
  resolvedOrderEntries: number;
};

export type MultiplayerPredictedSpawnRegistryOptions<TPredicted, TAuthority> = {
  generation: MultiplayerPredictionGeneration;
  maxPending?: number | undefined;
  maxResolved?: number | undefined;
  maxAgeTicks?: number | undefined;
  clonePredicted?(value: TPredicted): TPredicted;
  cloneAuthority?(value: TAuthority): TAuthority;
};

export type MultiplayerPredictedSpawnRegistry<TPredicted, TAuthority> = {
  register(
    spawn: MultiplayerPredictedSpawn<TPredicted>
  ): MultiplayerPredictedSpawnRegisterResult<TPredicted>;
  match(
    spawn: MultiplayerAuthoritativeSpawn<TAuthority>
  ): MultiplayerPredictedSpawnMatchResult<TPredicted, TAuthority>;
  reject(
    identity: MultiplayerPredictedSpawnIdentity,
    reason?: string
  ): MultiplayerPredictedSpawnRejectResult<TPredicted>;
  expire(tick: number): MultiplayerPredictedSpawn<TPredicted>[];
  pending(): MultiplayerPredictedSpawn<TPredicted>[];
  reset(generation: MultiplayerPredictionGeneration): void;
  diagnostics(): MultiplayerPredictedSpawnRegistryDiagnostics;
  dispose(): void;
};

type ResolvedSpawn = {
  tick: number;
  status: "matched" | "unmatched" | "rejected";
};

const DEFAULT_MAX_PENDING = 256;
const DEFAULT_MAX_RESOLVED = 512;
const DEFAULT_MAX_AGE_TICKS = 240;

export function createMultiplayerPredictedSpawnRegistry<TPredicted, TAuthority>(
  options: MultiplayerPredictedSpawnRegistryOptions<TPredicted, TAuthority>
): MultiplayerPredictedSpawnRegistry<TPredicted, TAuthority> {
  const maxPending = normalizePositiveInteger(options.maxPending, DEFAULT_MAX_PENDING);
  const maxResolved = normalizePositiveInteger(options.maxResolved, DEFAULT_MAX_RESOLVED);
  const maxAgeTicks = normalizePositiveInteger(options.maxAgeTicks, DEFAULT_MAX_AGE_TICKS);
  const clonePredicted = options.clonePredicted ?? identityClone;
  const cloneAuthority = options.cloneAuthority ?? identityClone;
  const pending = new Map<string, MultiplayerPredictedSpawn<TPredicted>>();
  const pendingOrder: string[] = [];
  const resolved = new Map<string, ResolvedSpawn>();
  const resolvedOrder: string[] = [];
  let generation = options.generation;
  let disposed = false;
  const diagnostics: Omit<
    MultiplayerPredictedSpawnRegistryDiagnostics,
    "generation" | "pending" | "resolved" | "pendingOrderEntries" | "resolvedOrderEntries"
  > = {
    registered: 0,
    matched: 0,
    unmatched: 0,
    rejected: 0,
    duplicates: 0,
    conflicts: 0,
    staleGenerations: 0,
    expired: 0,
    evicted: 0,
    resets: 0
  };

  return {
    register(spawn) {
      assertActive();
      validatePredictedSpawn(spawn);
      if (spawn.generation !== generation) {
        diagnostics.staleGenerations += 1;
        return { status: "stale-generation" };
      }
      const key = identityKey(spawn);
      if (resolved.has(key)) {
        diagnostics.duplicates += 1;
        return { status: "duplicate" };
      }
      const existing = pending.get(key);
      if (existing !== undefined) {
        if (existing.localId === spawn.localId && existing.tick === spawn.tick) {
          diagnostics.duplicates += 1;
          return { status: "duplicate", spawn: clonePredictedSpawn(existing) };
        }
        diagnostics.conflicts += 1;
        return { status: "conflict", spawn: clonePredictedSpawn(existing) };
      }

      const entry = clonePredictedSpawn(spawn);
      pending.set(key, entry);
      pendingOrder.push(key);
      diagnostics.registered += 1;
      const evicted = trimPending();
      return {
        status: "registered",
        spawn: clonePredictedSpawn(entry),
        ...(evicted === undefined ? {} : { evicted })
      };
    },
    match(spawn) {
      assertActive();
      validateAuthoritativeSpawn(spawn);
      if (spawn.generation !== generation) {
        diagnostics.staleGenerations += 1;
        return { status: "stale-generation" };
      }
      const key = identityKey(spawn);
      if (resolved.has(key)) {
        diagnostics.duplicates += 1;
        return { status: "duplicate", authority: cloneAuthoritySpawn(spawn) };
      }
      const predicted = takePending(key);
      const status = predicted === undefined ? "unmatched" : "matched";
      diagnostics[status] += 1;
      rememberResolved(key, { tick: spawn.tick, status });
      return {
        status,
        ...(predicted === undefined ? {} : { predicted: clonePredictedSpawn(predicted) }),
        authority: cloneAuthoritySpawn(spawn)
      };
    },
    reject(identity, reason) {
      assertActive();
      validateIdentity(identity);
      if (identity.generation !== generation) {
        diagnostics.staleGenerations += 1;
        return { status: "stale-generation", ...(reason === undefined ? {} : { reason }) };
      }
      const key = identityKey(identity);
      if (resolved.has(key)) {
        diagnostics.duplicates += 1;
        return { status: "duplicate", ...(reason === undefined ? {} : { reason }) };
      }
      const predicted = takePending(key);
      if (predicted === undefined) {
        return { status: "missing", ...(reason === undefined ? {} : { reason }) };
      }
      diagnostics.rejected += 1;
      rememberResolved(key, { tick: predicted.tick, status: "rejected" });
      return {
        status: "rejected",
        predicted: clonePredictedSpawn(predicted),
        ...(reason === undefined ? {} : { reason })
      };
    },
    expire(tick) {
      assertActive();
      if (!Number.isSafeInteger(tick)) {
        throw new Error("Predicted spawn expiry tick must be a safe integer.");
      }
      const expired: MultiplayerPredictedSpawn<TPredicted>[] = [];
      for (const key of pendingOrder) {
        const entry = pending.get(key);
        if (entry === undefined || tick - entry.tick <= maxAgeTicks) {
          continue;
        }
        pending.delete(key);
        expired.push(clonePredictedSpawn(entry));
        diagnostics.expired += 1;
        rememberResolved(key, { tick, status: "rejected" });
      }
      compactOrder(pendingOrder, pending);
      trimResolvedByAge(tick);
      return expired;
    },
    pending() {
      assertActive();
      return pendingOrder
        .map((key) => pending.get(key))
        .filter((entry): entry is MultiplayerPredictedSpawn<TPredicted> => entry !== undefined)
        .map(clonePredictedSpawn);
    },
    reset(nextGeneration) {
      assertActive();
      generation = nextGeneration;
      pending.clear();
      pendingOrder.length = 0;
      resolved.clear();
      resolvedOrder.length = 0;
      diagnostics.resets += 1;
    },
    diagnostics() {
      return {
        ...diagnostics,
        generation,
        pending: pending.size,
        resolved: resolved.size,
        pendingOrderEntries: pendingOrder.length,
        resolvedOrderEntries: resolvedOrder.length
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      pending.clear();
      pendingOrder.length = 0;
      resolved.clear();
      resolvedOrder.length = 0;
    }
  };

  function clonePredictedSpawn(
    spawn: MultiplayerPredictedSpawn<TPredicted>
  ): MultiplayerPredictedSpawn<TPredicted> {
    return { ...spawn, value: clonePredicted(spawn.value) };
  }

  function cloneAuthoritySpawn(
    spawn: MultiplayerAuthoritativeSpawn<TAuthority>
  ): MultiplayerAuthoritativeSpawn<TAuthority> {
    return { ...spawn, value: cloneAuthority(spawn.value) };
  }

  function takePending(key: string): MultiplayerPredictedSpawn<TPredicted> | undefined {
    const entry = pending.get(key);
    if (entry !== undefined) {
      pending.delete(key);
      compactOrder(pendingOrder, pending);
    }
    return entry;
  }

  function trimPending(): MultiplayerPredictedSpawn<TPredicted> | undefined {
    let lastEvicted: MultiplayerPredictedSpawn<TPredicted> | undefined;
    while (pending.size > maxPending) {
      const key = pendingOrder.shift();
      if (key === undefined) {
        break;
      }
      const entry = pending.get(key);
      if (entry === undefined) {
        continue;
      }
      pending.delete(key);
      diagnostics.evicted += 1;
      lastEvicted = clonePredictedSpawn(entry);
      rememberResolved(key, { tick: entry.tick, status: "rejected" });
    }
    return lastEvicted;
  }

  function rememberResolved(key: string, entry: ResolvedSpawn): void {
    if (!resolved.has(key)) {
      resolvedOrder.push(key);
    }
    resolved.set(key, entry);
    while (resolved.size > maxResolved) {
      const expiredKey = resolvedOrder.shift();
      if (expiredKey !== undefined) {
        resolved.delete(expiredKey);
      }
    }
  }

  function trimResolvedByAge(tick: number): void {
    for (const key of resolvedOrder) {
      const entry = resolved.get(key);
      if (entry !== undefined && tick - entry.tick > maxAgeTicks) {
        resolved.delete(key);
      }
    }
    compactOrder(resolvedOrder, resolved);
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Multiplayer predicted spawn registry has been disposed.");
    }
  }
}

function compactOrder<TValue>(order: string[], values: Map<string, TValue>): void {
  if (order.length <= values.size * 2 + 16) {
    return;
  }
  const compacted = order.filter((key) => values.has(key));
  order.splice(0, order.length, ...compacted);
}

function identityKey(identity: MultiplayerPredictedSpawnIdentity): string {
  return `${String(identity.generation)}\u0000${identity.kind}\u0000${identity.correlationId}`;
}

function validateIdentity(identity: MultiplayerPredictedSpawnIdentity): void {
  if (identity.kind.length === 0 || identity.correlationId.length === 0) {
    throw new Error("Predicted spawn identity requires kind and correlationId.");
  }
  if (
    (typeof identity.generation === "string" && identity.generation.length === 0) ||
    (typeof identity.generation === "number" && !Number.isSafeInteger(identity.generation))
  ) {
    throw new Error("Predicted spawn identity generation is invalid.");
  }
}

function validatePredictedSpawn<TValue>(spawn: MultiplayerPredictedSpawn<TValue>): void {
  validateIdentity(spawn);
  if (spawn.localId.length === 0 || !Number.isSafeInteger(spawn.tick)) {
    throw new Error("Predicted spawn requires a localId and safe integer tick.");
  }
}

function validateAuthoritativeSpawn<TValue>(spawn: MultiplayerAuthoritativeSpawn<TValue>): void {
  validateIdentity(spawn);
  if (spawn.authorityId.length === 0 || !Number.isSafeInteger(spawn.tick)) {
    throw new Error("Authoritative spawn requires an authorityId and safe integer tick.");
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function identityClone<TValue>(value: TValue): TValue {
  return value;
}
