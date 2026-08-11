import type { MultiplayerPredictionGeneration } from "./predicted-spawn";

export type MultiplayerSpeculativeEffect<TValue> = {
  effectId: string;
  generation: MultiplayerPredictionGeneration;
  tick: number;
  value: TValue;
};

export type MultiplayerSpeculativeEffectCancellationReason =
  | "authority-cancelled"
  | "expired"
  | "capacity"
  | "generation-changed"
  | "explicit-reset"
  | "disposed";

export type MultiplayerSpeculativeEffectResolution<TAuthority> =
  | {
      effectId: string;
      generation: MultiplayerPredictionGeneration;
      tick: number;
      outcome: "confirm";
      authority?: TAuthority | undefined;
    }
  | {
      effectId: string;
      generation: MultiplayerPredictionGeneration;
      tick: number;
      outcome: "cancel";
      reason?: string | undefined;
    }
  | {
      effectId: string;
      generation: MultiplayerPredictionGeneration;
      tick: number;
      outcome: "replace";
      authority: TAuthority;
    };

export type MultiplayerSpeculativeEffectHookPhase = "anticipate" | "confirm" | "cancel" | "replace";

export type MultiplayerSpeculativeEffectJournalHooks<TPredicted, TAuthority> = {
  onAnticipate?(effect: MultiplayerSpeculativeEffect<TPredicted>): void;
  onConfirm?(event: {
    effect: MultiplayerSpeculativeEffect<TPredicted>;
    authority?: TAuthority | undefined;
    tick: number;
  }): void;
  onCancel?(event: {
    effect: MultiplayerSpeculativeEffect<TPredicted>;
    reason: MultiplayerSpeculativeEffectCancellationReason;
    tick: number;
    detail?: string | undefined;
  }): void;
  onReplace?(event: {
    effect: MultiplayerSpeculativeEffect<TPredicted>;
    authority: TAuthority;
    tick: number;
  }): void;
  onHookError?(event: {
    phase: MultiplayerSpeculativeEffectHookPhase;
    effectId: string;
    error: unknown;
  }): void;
};

export type MultiplayerSpeculativeEffectJournalOptions<TPredicted, TAuthority> = {
  generation: MultiplayerPredictionGeneration;
  maxPending?: number | undefined;
  maxResolved?: number | undefined;
  maxAgeTicks?: number | undefined;
  clonePredicted?(value: TPredicted): TPredicted;
  cloneAuthority?(value: TAuthority): TAuthority;
  hooks?: MultiplayerSpeculativeEffectJournalHooks<TPredicted, TAuthority> | undefined;
};

export type MultiplayerSpeculativeEffectAnticipateResult<TPredicted> = {
  status: "anticipated" | "duplicate" | "resolved";
  effect?: MultiplayerSpeculativeEffect<TPredicted> | undefined;
  evicted?: MultiplayerSpeculativeEffect<TPredicted> | undefined;
};

export type MultiplayerSpeculativeEffectResolveResult<TPredicted, TAuthority> = {
  status: "confirmed" | "cancelled" | "replaced" | "duplicate" | "unmatched" | "stale-generation";
  effect?: MultiplayerSpeculativeEffect<TPredicted> | undefined;
  resolution?: MultiplayerSpeculativeEffectResolution<TAuthority> | undefined;
};

export type MultiplayerSpeculativeEffectJournalDiagnostics = {
  generation: MultiplayerPredictionGeneration;
  anticipated: number;
  confirmed: number;
  cancelled: number;
  replaced: number;
  duplicates: number;
  unmatched: number;
  staleGenerations: number;
  expired: number;
  evicted: number;
  resets: number;
  hookErrors: number;
  pending: number;
  resolved: number;
  disposed: boolean;
};

export type MultiplayerSpeculativeEffectJournal<TPredicted, TAuthority> = {
  generation(): MultiplayerPredictionGeneration;
  anticipate(
    effect: Omit<MultiplayerSpeculativeEffect<TPredicted>, "generation">
  ): MultiplayerSpeculativeEffectAnticipateResult<TPredicted>;
  resolve(
    resolution: MultiplayerSpeculativeEffectResolution<TAuthority>
  ): MultiplayerSpeculativeEffectResolveResult<TPredicted, TAuthority>;
  expire(atTick: number): MultiplayerSpeculativeEffect<TPredicted>[];
  pending(): MultiplayerSpeculativeEffect<TPredicted>[];
  reset(generation: MultiplayerPredictionGeneration): void;
  diagnostics(): MultiplayerSpeculativeEffectJournalDiagnostics;
  dispose(): void;
};

type ResolvedEffect = {
  tick: number;
  outcome: "confirm" | "cancel" | "replace";
};

const DEFAULT_MAX_PENDING = 128;
const DEFAULT_MAX_RESOLVED = 256;
const DEFAULT_MAX_AGE_TICKS = 240;

/**
 * Deduplicates reversible predicted side effects across replay and settles each stable effect id
 * at most once. Gameplay authority commits stay outside this journal.
 */
export function createMultiplayerSpeculativeEffectJournal<TPredicted, TAuthority = never>(
  options: MultiplayerSpeculativeEffectJournalOptions<TPredicted, TAuthority>
): MultiplayerSpeculativeEffectJournal<TPredicted, TAuthority> {
  validateGeneration(options.generation);
  const maxPending = positiveInteger(options.maxPending, DEFAULT_MAX_PENDING, "maxPending");
  const maxResolved = positiveInteger(options.maxResolved, DEFAULT_MAX_RESOLVED, "maxResolved");
  const maxAgeTicks = positiveInteger(options.maxAgeTicks, DEFAULT_MAX_AGE_TICKS, "maxAgeTicks");
  const clonePredicted = options.clonePredicted ?? identityClone;
  const cloneAuthority = options.cloneAuthority ?? identityClone;
  const pending = new Map<string, MultiplayerSpeculativeEffect<TPredicted>>();
  const resolved = new Map<string, ResolvedEffect>();
  let generation = options.generation;
  let disposed = false;
  const metrics = {
    anticipated: 0,
    confirmed: 0,
    cancelled: 0,
    replaced: 0,
    duplicates: 0,
    unmatched: 0,
    staleGenerations: 0,
    expired: 0,
    evicted: 0,
    resets: 0,
    hookErrors: 0
  };

  return {
    generation() {
      return generation;
    },
    anticipate(input) {
      assertActive();
      validateEffectId(input.effectId);
      validateTick(input.tick);
      if (resolved.has(input.effectId)) {
        metrics.duplicates += 1;
        return { status: "resolved" };
      }
      const duplicate = pending.get(input.effectId);
      if (duplicate !== undefined) {
        metrics.duplicates += 1;
        return { status: "duplicate", effect: cloneEffect(duplicate) };
      }

      let evicted: MultiplayerSpeculativeEffect<TPredicted> | undefined;
      if (pending.size >= maxPending) {
        evicted = takeOldest(pending);
        if (evicted !== undefined) {
          metrics.evicted += 1;
          cancelEffect(evicted, "capacity", input.tick);
        }
      }
      const effect: MultiplayerSpeculativeEffect<TPredicted> = {
        ...input,
        generation,
        value: clonePredicted(input.value)
      };
      pending.set(effect.effectId, effect);
      metrics.anticipated += 1;
      callHook("anticipate", effect.effectId, () =>
        options.hooks?.onAnticipate?.(cloneEffect(effect))
      );
      return {
        status: "anticipated",
        effect: cloneEffect(effect),
        ...(evicted === undefined ? {} : { evicted: cloneEffect(evicted) })
      };
    },
    resolve(input) {
      assertActive();
      validateEffectId(input.effectId);
      validateGeneration(input.generation);
      validateTick(input.tick);
      if (input.generation !== generation) {
        metrics.staleGenerations += 1;
        return { status: "stale-generation" };
      }
      if (resolved.has(input.effectId)) {
        metrics.duplicates += 1;
        return { status: "duplicate", resolution: cloneResolution(input) };
      }

      const effect = pending.get(input.effectId);
      pending.delete(input.effectId);
      rememberResolved(input.effectId, input.tick, input.outcome);
      if (effect === undefined) {
        metrics.unmatched += 1;
        return { status: "unmatched", resolution: cloneResolution(input) };
      }

      if (input.outcome === "confirm") {
        metrics.confirmed += 1;
        callHook("confirm", effect.effectId, () =>
          options.hooks?.onConfirm?.({
            effect: cloneEffect(effect),
            ...(input.authority === undefined
              ? {}
              : { authority: cloneAuthority(input.authority) }),
            tick: input.tick
          })
        );
        return {
          status: "confirmed",
          effect: cloneEffect(effect),
          resolution: cloneResolution(input)
        };
      }
      if (input.outcome === "replace") {
        metrics.replaced += 1;
        callHook("replace", effect.effectId, () =>
          options.hooks?.onReplace?.({
            effect: cloneEffect(effect),
            authority: cloneAuthority(input.authority),
            tick: input.tick
          })
        );
        return {
          status: "replaced",
          effect: cloneEffect(effect),
          resolution: cloneResolution(input)
        };
      }

      cancelEffect(effect, "authority-cancelled", input.tick, input.reason);
      return {
        status: "cancelled",
        effect: cloneEffect(effect),
        resolution: cloneResolution(input)
      };
    },
    expire(atTick) {
      assertActive();
      validateTick(atTick);
      const expired: MultiplayerSpeculativeEffect<TPredicted>[] = [];
      for (const effect of pending.values()) {
        if (atTick - effect.tick <= maxAgeTicks) {
          continue;
        }
        pending.delete(effect.effectId);
        metrics.expired += 1;
        cancelEffect(effect, "expired", atTick);
        expired.push(cloneEffect(effect));
      }
      return expired;
    },
    pending() {
      assertActive();
      return [...pending.values()].map(cloneEffect);
    },
    reset(nextGeneration) {
      assertActive();
      validateGeneration(nextGeneration);
      resetInternal(
        nextGeneration,
        nextGeneration === generation ? "explicit-reset" : "generation-changed"
      );
    },
    diagnostics() {
      return {
        generation,
        ...metrics,
        pending: pending.size,
        resolved: resolved.size,
        disposed
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const effects = [...pending.values()];
      pending.clear();
      resolved.clear();
      for (const effect of effects) {
        cancelEffect(effect, "disposed", effect.tick);
      }
    }
  };

  function resetInternal(
    nextGeneration: MultiplayerPredictionGeneration,
    reason: "generation-changed" | "explicit-reset"
  ): void {
    const effects = [...pending.values()];
    pending.clear();
    resolved.clear();
    generation = nextGeneration;
    metrics.resets += 1;
    for (const effect of effects) {
      cancelEffect(effect, reason, effect.tick);
    }
  }

  function cancelEffect(
    effect: MultiplayerSpeculativeEffect<TPredicted>,
    reason: MultiplayerSpeculativeEffectCancellationReason,
    tick: number,
    detail?: string
  ): void {
    metrics.cancelled += 1;
    callHook("cancel", effect.effectId, () =>
      options.hooks?.onCancel?.({
        effect: cloneEffect(effect),
        reason,
        tick,
        ...(detail === undefined ? {} : { detail })
      })
    );
  }

  function rememberResolved(
    effectId: string,
    tick: number,
    outcome: ResolvedEffect["outcome"]
  ): void {
    resolved.set(effectId, { tick, outcome });
    while (resolved.size > maxResolved) {
      const oldest = resolved.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      resolved.delete(oldest);
    }
  }

  function cloneEffect(
    effect: MultiplayerSpeculativeEffect<TPredicted>
  ): MultiplayerSpeculativeEffect<TPredicted> {
    return { ...effect, value: clonePredicted(effect.value) };
  }

  function cloneResolution(
    resolution: MultiplayerSpeculativeEffectResolution<TAuthority>
  ): MultiplayerSpeculativeEffectResolution<TAuthority> {
    return resolution.outcome === "replace"
      ? { ...resolution, authority: cloneAuthority(resolution.authority) }
      : resolution.outcome === "confirm" && resolution.authority !== undefined
        ? { ...resolution, authority: cloneAuthority(resolution.authority) }
        : { ...resolution };
  }

  function callHook(
    phase: MultiplayerSpeculativeEffectHookPhase,
    effectId: string,
    callback: () => void
  ): void {
    try {
      callback();
    } catch (error) {
      metrics.hookErrors += 1;
      try {
        options.hooks?.onHookError?.({ phase, effectId, error });
      } catch {
        // Diagnostics hooks are isolated from the prediction lifecycle as well.
      }
    }
  }

  function assertActive(): void {
    if (disposed) {
      throw new Error("Multiplayer speculative effect journal is disposed.");
    }
  }
}

function takeOldest<TValue>(
  values: Map<string, MultiplayerSpeculativeEffect<TValue>>
): MultiplayerSpeculativeEffect<TValue> | undefined {
  const oldestId = values.keys().next().value as string | undefined;
  if (oldestId === undefined) {
    return undefined;
  }
  const value = values.get(oldestId);
  values.delete(oldestId);
  return value;
}

function validateEffectId(effectId: string): void {
  if (effectId.trim().length === 0) {
    throw new Error("Speculative effect id must not be empty.");
  }
}

function validateGeneration(generation: MultiplayerPredictionGeneration): void {
  if (
    (typeof generation === "string" && generation.trim().length === 0) ||
    (typeof generation === "number" && !Number.isSafeInteger(generation))
  ) {
    throw new Error("Speculative effect generation must be a non-empty string or safe integer.");
  }
}

function validateTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error("Speculative effect tick must be a non-negative safe integer.");
  }
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`Speculative effect ${label} must be a positive safe integer.`);
  }
  return resolved;
}

function identityClone<TValue>(value: TValue): TValue {
  return value;
}
