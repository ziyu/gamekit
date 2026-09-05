import {
  createMultiplayerAuthorityTimeline,
  type MultiplayerAuthorityTimelineDiagnostics,
  type MultiplayerAuthorityTimelineSyncResult
} from "./authority-timeline";
import {
  createMultiplayerPredictedSpawnRegistry,
  type MultiplayerAuthoritativeSpawn,
  type MultiplayerPredictedSpawn,
  type MultiplayerPredictedSpawnMatchResult,
  type MultiplayerPredictedSpawnRegisterResult,
  type MultiplayerPredictedSpawnRegistryDiagnostics,
  type MultiplayerPredictedSpawnRejectResult,
  type MultiplayerPredictionGeneration
} from "./predicted-spawn";

export type MultiplayerPredictedLifecycleLocalIdentity = {
  kind: string;
  correlationId: string;
  generation: MultiplayerPredictionGeneration;
  localId: string;
  tick: number;
};

export type MultiplayerPredictedLifecycleBinding = {
  kind: string;
  correlationId: string;
  generation: MultiplayerPredictionGeneration;
  authorityId: string;
  authorityTick: number;
  localId?: string | undefined;
  predictedTick?: number | undefined;
};

export type MultiplayerPredictedLifecyclePredictionRemovalReason =
  | "rejected"
  | "expired"
  | "prediction-capacity";

export type MultiplayerPredictedLifecycleBindingRemovalReason =
  | "authority-removed"
  | "authority-replaced"
  | "binding-capacity";

export type MultiplayerPredictedLifecycleResetReason = "generation-changed" | "explicit";

export type MultiplayerPredictedLifecycleHooks = {
  onPredictionRemoved?(event: {
    prediction: MultiplayerPredictedLifecycleLocalIdentity;
    reason: MultiplayerPredictedLifecyclePredictionRemovalReason;
    atTick: number;
    detail?: string | undefined;
  }): void;
  onBindingRemoved?(event: {
    binding: MultiplayerPredictedLifecycleBinding;
    reason: MultiplayerPredictedLifecycleBindingRemovalReason;
  }): void;
  onReset?(event: {
    previousGeneration: MultiplayerPredictionGeneration;
    generation: MultiplayerPredictionGeneration;
    reason: MultiplayerPredictedLifecycleResetReason;
  }): void;
};

export type MultiplayerPredictedLifecycleDomainOptions<TPredicted, TAuthority> = {
  kind: string;
  generation: MultiplayerPredictionGeneration;
  stepMs?: number | undefined;
  maxPending?: number | undefined;
  maxResolved?: number | undefined;
  maxAgeTicks?: number | undefined;
  maxBindings?: number | undefined;
  clonePredicted?(value: TPredicted): TPredicted;
  cloneAuthority?(value: TAuthority): TAuthority;
  hooks?: MultiplayerPredictedLifecycleHooks | undefined;
};

export type MultiplayerPredictedLifecycleAuthoritySpawn<TAuthority> = Omit<
  MultiplayerAuthoritativeSpawn<TAuthority>,
  "kind" | "generation"
>;

export type MultiplayerPredictedLifecyclePredictedSpawn<TPredicted> = Omit<
  MultiplayerPredictedSpawn<TPredicted>,
  "kind" | "generation"
>;

export type MultiplayerPredictedLifecycleAuthorityMatch<TPredicted, TAuthority> = {
  binding: MultiplayerPredictedLifecycleBinding;
  match: MultiplayerPredictedSpawnMatchResult<TPredicted, TAuthority>;
};

export type MultiplayerPredictedLifecycleSyncInput<TAuthority> = {
  generation: MultiplayerPredictionGeneration;
  authorityTime: number;
  localTime: number;
  authoritySpawns: Iterable<MultiplayerPredictedLifecycleAuthoritySpawn<TAuthority>>;
};

export type MultiplayerPredictedLifecycleSyncResult<TPredicted, TAuthority> = {
  generationChanged: boolean;
  timeline: MultiplayerAuthorityTimelineSyncResult;
  matches: MultiplayerPredictedLifecycleAuthorityMatch<TPredicted, TAuthority>[];
  expired: MultiplayerPredictedLifecycleLocalIdentity[];
  removedBindings: MultiplayerPredictedLifecycleBinding[];
};

export type MultiplayerPredictedLifecycleDomainDiagnostics = {
  generation: MultiplayerPredictionGeneration;
  syncs: number;
  generationResets: number;
  explicitResets: number;
  prunedBindings: number;
  replacedBindings: number;
  evictedBindings: number;
  bindings: number;
  localIdentities: number;
  timeline: MultiplayerAuthorityTimelineDiagnostics;
  spawns: MultiplayerPredictedSpawnRegistryDiagnostics;
};

export type MultiplayerPredictedLifecycleDomain<TPredicted, TAuthority> = {
  generation(): MultiplayerPredictionGeneration;
  sync(
    input: MultiplayerPredictedLifecycleSyncInput<TAuthority>
  ): MultiplayerPredictedLifecycleSyncResult<TPredicted, TAuthority>;
  register(
    spawn: MultiplayerPredictedLifecyclePredictedSpawn<TPredicted>
  ): MultiplayerPredictedSpawnRegisterResult<TPredicted>;
  reject(
    correlationId: string,
    atTick: number,
    reason?: string
  ): MultiplayerPredictedSpawnRejectResult<TPredicted>;
  expire(atTick: number): MultiplayerPredictedLifecycleLocalIdentity[];
  binding(reference: string): MultiplayerPredictedLifecycleBinding | undefined;
  localIdentity(reference: string): MultiplayerPredictedLifecycleLocalIdentity | undefined;
  correlationId(reference: string): string | undefined;
  hasLocalPrediction(reference: string): boolean;
  authorityTime(localTime: number): number;
  authorityTick(localTime: number): number;
  authoritySampleTick(localTime: number): number;
  reset(generation: MultiplayerPredictionGeneration): void;
  diagnostics(): MultiplayerPredictedLifecycleDomainDiagnostics;
  dispose(): void;
};

const DEFAULT_MAX_BINDINGS = 512;

/**
 * Owns the common lifecycle for event-started prediction and predicted entities. Domain-specific
 * simulation and presentation stay in Combat, Physics, or the app; Multiplayer Core owns the
 * generation, monotonic authority time, identity matching, binding, expiry, reset, and budgets.
 */
export function createMultiplayerPredictedLifecycleDomain<TPredicted, TAuthority>(
  options: MultiplayerPredictedLifecycleDomainOptions<TPredicted, TAuthority>
): MultiplayerPredictedLifecycleDomain<TPredicted, TAuthority> {
  validateKind(options.kind);
  validateGeneration(options.generation);
  const kind = options.kind;
  const maxBindings = normalizePositiveInteger(options.maxBindings, DEFAULT_MAX_BINDINGS);
  const timeline = createMultiplayerAuthorityTimeline({ stepMs: options.stepMs });
  const registry = createMultiplayerPredictedSpawnRegistry<TPredicted, TAuthority>({
    generation: options.generation,
    ...(options.maxPending === undefined ? {} : { maxPending: options.maxPending }),
    ...(options.maxResolved === undefined ? {} : { maxResolved: options.maxResolved }),
    ...(options.maxAgeTicks === undefined ? {} : { maxAgeTicks: options.maxAgeTicks }),
    ...(options.clonePredicted === undefined ? {} : { clonePredicted: options.clonePredicted }),
    ...(options.cloneAuthority === undefined ? {} : { cloneAuthority: options.cloneAuthority })
  });
  const bindingsByCorrelation = new Map<string, MultiplayerPredictedLifecycleBinding>();
  const correlationByAuthorityId = new Map<string, string>();
  const localByCorrelation = new Map<string, MultiplayerPredictedLifecycleLocalIdentity>();
  const correlationByLocalId = new Map<string, string>();
  let generation = options.generation;
  let disposed = false;
  const diagnostics = {
    syncs: 0,
    generationResets: 0,
    explicitResets: 0,
    prunedBindings: 0,
    replacedBindings: 0,
    evictedBindings: 0
  };

  return {
    generation() {
      return generation;
    },
    sync(input) {
      assertActive();
      validateGeneration(input.generation);
      const generationChanged = input.generation !== generation;
      if (generationChanged) {
        resetInternal(input.generation, "generation-changed");
      }
      const timelineResult = timeline.sync(input.authorityTime, input.localTime);
      const authorityIds = new Set<string>();
      const matches: MultiplayerPredictedLifecycleAuthorityMatch<TPredicted, TAuthority>[] = [];
      const removedBindings: MultiplayerPredictedLifecycleBinding[] = [];

      for (const authoritySpawn of input.authoritySpawns) {
        const normalized = normalizeAuthoritySpawn(authoritySpawn);
        authorityIds.add(normalized.authorityId);
        const existing = bindingsByCorrelation.get(normalized.correlationId);
        if (existing?.authorityId === normalized.authorityId) {
          continue;
        }
        if (existing !== undefined) {
          removedBindings.push(removeBinding(existing, "authority-replaced", true));
          diagnostics.replacedBindings += 1;
        }
        const match = registry.match(normalized);
        if (match.status === "stale-generation") {
          continue;
        }
        const local = localByCorrelation.get(normalized.correlationId);
        const binding: MultiplayerPredictedLifecycleBinding = {
          kind,
          correlationId: normalized.correlationId,
          generation,
          authorityId: normalized.authorityId,
          authorityTick: normalized.tick,
          ...(local === undefined ? {} : { localId: local.localId, predictedTick: local.tick })
        };
        putBinding(binding, removedBindings);
        matches.push({ binding: cloneBinding(binding), match });
      }

      for (const binding of bindingsByCorrelation.values()) {
        if (!authorityIds.has(binding.authorityId)) {
          removedBindings.push(removeBinding(binding, "authority-removed"));
          diagnostics.prunedBindings += 1;
        }
      }

      const currentTick = timeline.tick(input.localTime);
      const expired = expirePredictions(currentTick);
      diagnostics.syncs += 1;
      return {
        generationChanged,
        timeline: timelineResult,
        matches,
        expired,
        removedBindings
      };
    },
    register(spawn) {
      assertActive();
      const normalized: MultiplayerPredictedSpawn<TPredicted> = {
        ...spawn,
        kind,
        generation
      };
      const result = registry.register(normalized);
      if (result.status === "registered" || result.spawn !== undefined) {
        const accepted = result.spawn ?? normalized;
        putLocalIdentity(toLocalIdentity(accepted));
      }
      if (result.evicted !== undefined) {
        const local =
          takeLocalIdentity(result.evicted.correlationId) ?? toLocalIdentity(result.evicted);
        options.hooks?.onPredictionRemoved?.({
          prediction: cloneLocalIdentity(local),
          reason: "prediction-capacity",
          atTick: normalized.tick
        });
      }
      return result;
    },
    expire(atTick) {
      assertActive();
      validateTick(atTick, "expiry");
      return expirePredictions(atTick);
    },
    reject(correlationId, atTick, reason = "rejected") {
      assertActive();
      validateCorrelationId(correlationId);
      validateTick(atTick, "rejection");
      const result = registry.reject({ kind, correlationId, generation }, reason);
      const local = takeLocalIdentity(correlationId);
      if (local !== undefined) {
        options.hooks?.onPredictionRemoved?.({
          prediction: cloneLocalIdentity(local),
          reason: "rejected",
          atTick,
          detail: reason
        });
      }
      return result;
    },
    binding(reference) {
      assertActive();
      const correlationId = resolveCorrelationId(reference);
      const binding =
        correlationId === undefined ? undefined : bindingsByCorrelation.get(correlationId);
      return binding === undefined ? undefined : cloneBinding(binding);
    },
    localIdentity(reference) {
      assertActive();
      const correlationId = resolveCorrelationId(reference);
      const local = correlationId === undefined ? undefined : localByCorrelation.get(correlationId);
      return local === undefined ? undefined : cloneLocalIdentity(local);
    },
    correlationId(reference) {
      assertActive();
      return resolveCorrelationId(reference);
    },
    hasLocalPrediction(reference) {
      assertActive();
      const correlationId = resolveCorrelationId(reference);
      return correlationId !== undefined && localByCorrelation.has(correlationId);
    },
    authorityTime(localTime) {
      assertActive();
      return timeline.time(localTime);
    },
    authorityTick(localTime) {
      assertActive();
      return timeline.tick(localTime);
    },
    authoritySampleTick(localTime) {
      assertActive();
      return timeline.sampleTick(localTime);
    },
    reset(nextGeneration) {
      assertActive();
      validateGeneration(nextGeneration);
      resetInternal(nextGeneration, "explicit");
    },
    diagnostics() {
      assertActive();
      return {
        generation,
        ...diagnostics,
        bindings: bindingsByCorrelation.size,
        localIdentities: localByCorrelation.size,
        timeline: timeline.diagnostics(),
        spawns: registry.diagnostics()
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      bindingsByCorrelation.clear();
      correlationByAuthorityId.clear();
      localByCorrelation.clear();
      correlationByLocalId.clear();
      registry.dispose();
    }
  };

  function normalizeAuthoritySpawn(
    spawn: MultiplayerPredictedLifecycleAuthoritySpawn<TAuthority>
  ): MultiplayerAuthoritativeSpawn<TAuthority> {
    return { ...spawn, kind, generation };
  }

  function putLocalIdentity(local: MultiplayerPredictedLifecycleLocalIdentity): void {
    const existing = localByCorrelation.get(local.correlationId);
    if (existing !== undefined && existing.localId !== local.localId) {
      correlationByLocalId.delete(existing.localId);
    }
    localByCorrelation.delete(local.correlationId);
    localByCorrelation.set(local.correlationId, cloneLocalIdentity(local));
    correlationByLocalId.set(local.localId, local.correlationId);
  }

  function expirePredictions(atTick: number): MultiplayerPredictedLifecycleLocalIdentity[] {
    return registry.expire(atTick).map((spawn) => {
      const local = takeLocalIdentity(spawn.correlationId) ?? toLocalIdentity(spawn);
      options.hooks?.onPredictionRemoved?.({
        prediction: cloneLocalIdentity(local),
        reason: "expired",
        atTick
      });
      return cloneLocalIdentity(local);
    });
  }

  function takeLocalIdentity(
    correlationId: string
  ): MultiplayerPredictedLifecycleLocalIdentity | undefined {
    const local = localByCorrelation.get(correlationId);
    if (local === undefined) {
      return undefined;
    }
    localByCorrelation.delete(correlationId);
    correlationByLocalId.delete(local.localId);
    return local;
  }

  function putBinding(
    binding: MultiplayerPredictedLifecycleBinding,
    removedBindings: MultiplayerPredictedLifecycleBinding[]
  ): void {
    bindingsByCorrelation.delete(binding.correlationId);
    bindingsByCorrelation.set(binding.correlationId, binding);
    correlationByAuthorityId.set(binding.authorityId, binding.correlationId);
    while (bindingsByCorrelation.size > maxBindings) {
      const oldest = bindingsByCorrelation.values().next().value as
        | MultiplayerPredictedLifecycleBinding
        | undefined;
      if (oldest === undefined) {
        break;
      }
      removedBindings.push(removeBinding(oldest, "binding-capacity"));
      diagnostics.evictedBindings += 1;
    }
  }

  function removeBinding(
    binding: MultiplayerPredictedLifecycleBinding,
    reason: MultiplayerPredictedLifecycleBindingRemovalReason,
    preserveLocalIdentity = false
  ): MultiplayerPredictedLifecycleBinding {
    bindingsByCorrelation.delete(binding.correlationId);
    correlationByAuthorityId.delete(binding.authorityId);
    if (!preserveLocalIdentity) {
      takeLocalIdentity(binding.correlationId);
    }
    const snapshot = cloneBinding(binding);
    options.hooks?.onBindingRemoved?.({ binding: snapshot, reason });
    return snapshot;
  }

  function resolveCorrelationId(reference: string): string | undefined {
    if (bindingsByCorrelation.has(reference) || localByCorrelation.has(reference)) {
      return reference;
    }
    return correlationByLocalId.get(reference) ?? correlationByAuthorityId.get(reference);
  }

  function resetInternal(
    nextGeneration: MultiplayerPredictionGeneration,
    reason: MultiplayerPredictedLifecycleResetReason
  ): void {
    const previousGeneration = generation;
    generation = nextGeneration;
    bindingsByCorrelation.clear();
    correlationByAuthorityId.clear();
    localByCorrelation.clear();
    correlationByLocalId.clear();
    timeline.reset();
    registry.reset(nextGeneration);
    if (reason === "generation-changed") {
      diagnostics.generationResets += 1;
    } else {
      diagnostics.explicitResets += 1;
    }
    options.hooks?.onReset?.({ previousGeneration, generation: nextGeneration, reason });
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Multiplayer predicted lifecycle domain has been disposed.");
    }
  }
}

function toLocalIdentity<TValue>(
  spawn: MultiplayerPredictedSpawn<TValue>
): MultiplayerPredictedLifecycleLocalIdentity {
  return {
    kind: spawn.kind,
    correlationId: spawn.correlationId,
    generation: spawn.generation,
    localId: spawn.localId,
    tick: spawn.tick
  };
}

function cloneLocalIdentity(
  identity: MultiplayerPredictedLifecycleLocalIdentity
): MultiplayerPredictedLifecycleLocalIdentity {
  return { ...identity };
}

function cloneBinding(
  binding: MultiplayerPredictedLifecycleBinding
): MultiplayerPredictedLifecycleBinding {
  return { ...binding };
}

function validateKind(kind: string): void {
  if (kind.length === 0) {
    throw new Error("Multiplayer predicted lifecycle domain requires a kind.");
  }
}

function validateCorrelationId(correlationId: string): void {
  if (correlationId.length === 0) {
    throw new Error("Multiplayer predicted lifecycle correlationId must not be empty.");
  }
}

function validateGeneration(generation: MultiplayerPredictionGeneration): void {
  if (
    (typeof generation === "string" && generation.length === 0) ||
    (typeof generation === "number" && !Number.isSafeInteger(generation))
  ) {
    throw new Error("Multiplayer predicted lifecycle generation is invalid.");
  }
}

function validateTick(tick: number, label: string): void {
  if (!Number.isSafeInteger(tick)) {
    throw new Error(`Multiplayer predicted lifecycle ${label} tick must be a safe integer.`);
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}
