import type { DataRegistry } from "@gamekit/data";
import { GAS_EFFECT_TYPE } from "./data-types";
import { activeEffectContext, childGasContext } from "./operation-context";
import type {
  GasActiveEffectState,
  GasActorRuntimeState,
  GasAttributeModifier,
  GasEffectApplication,
  GasEffectApplicationResult,
  GasEffectDefinition,
  GasOperationContext,
  GasTraceEntry
} from "./types";

type GasTraceDetails = Pick<
  GasTraceEntry,
  "actorId" | "abilityId" | "effectId" | "message" | "details"
>;

type GasEffectRuntimeOptions = {
  dataRegistry: DataRegistry;
  now(): number;
  requireActor(actorId: string): GasActorRuntimeState;
  persistActor(state: GasActorRuntimeState): void;
  modifyAttribute(
    state: GasActorRuntimeState,
    modifier: GasAttributeModifier,
    source?: string,
    context?: GasOperationContext
  ): void;
  addTag(
    state: GasActorRuntimeState,
    tag: string,
    source?: string,
    context?: GasOperationContext
  ): void;
  removeTag(
    state: GasActorRuntimeState,
    tag: string,
    source?: string,
    context?: GasOperationContext
  ): void;
  emitCues(
    cueIds: string[],
    sourceActorId?: string,
    targetActorId?: string,
    context?: GasOperationContext
  ): void;
  trace(
    type: GasTraceEntry["type"],
    entry: GasTraceDetails,
    context?: GasOperationContext
  ): GasTraceEntry;
  emit(type: string, payload: unknown, context?: GasOperationContext): void;
};

export type GasEffectRuntime = {
  apply(input: GasEffectApplication): GasEffectApplicationResult;
  updateActor(state: GasActorRuntimeState): void;
};

export function createGasEffectRuntime(options: GasEffectRuntimeOptions): GasEffectRuntime {
  let effectSequence = 0;

  return {
    apply,
    updateActor
  };

  function apply(input: GasEffectApplication): GasEffectApplicationResult {
    const state = options.requireActor(input.targetActorId);
    const effect = options.dataRegistry.getValue<GasEffectDefinition>(
      GAS_EFFECT_TYPE,
      input.effectId
    );
    const hasLifecycle = effect.durationMs !== undefined || effect.periodMs !== undefined;
    const stacking = normalizeStacking(effect);
    const matching = hasLifecycle ? matchingEffects(state, input, stacking.source) : [];
    const oldest = matching[0];

    if (
      hasLifecycle &&
      matching.length >= stacking.limit &&
      stacking.overflow === "reject-newest"
    ) {
      const rejectedTrace = options.trace(
        "effect.rejected",
        {
          actorId: input.targetActorId,
          effectId: input.effectId,
          message: `Rejected GAS effect stack: ${input.effectId}`,
          details: {
            sourceActorId: input.sourceActorId,
            stackLimit: stacking.limit
          }
        },
        input
      );
      const result = effectResult(input, "rejected", {
        reason: "effect stack limit reached"
      });
      options.emit("gas.effect_rejected", result, childGasContext(input, rejectedTrace.id));
      return result;
    }

    let status: GasEffectApplicationResult["status"] = "applied";
    let replacedEffect: GasActiveEffectState | undefined;
    let activeEffectId: string | undefined;

    if (hasLifecycle && oldest && matching.length >= stacking.limit) {
      if (stacking.overflow === "refresh-oldest") {
        status = "refreshed";
        activeEffectId = oldest.id;
      } else {
        status = "replaced";
        replacedEffect = oldest;
        state.effects.active = state.effects.active.filter((active) => active.id !== oldest.id);
      }
    }

    if (hasLifecycle && activeEffectId === undefined) {
      effectSequence += 1;
      activeEffectId = `${input.effectId}:${effectSequence}`;
    }

    const traceType =
      status === "refreshed"
        ? "effect.refreshed"
        : status === "replaced"
          ? "effect.replaced"
          : "effect.applied";
    const effectTrace = options.trace(
      traceType,
      {
        actorId: input.targetActorId,
        effectId: input.effectId,
        message: `${capitalize(status)} GAS effect: ${input.effectId}`,
        details: {
          sourceActorId: input.sourceActorId,
          activeEffectId,
          replacedEffectId: replacedEffect?.id
        }
      },
      input
    );
    const operationContext = childGasContext(input, effectTrace.id);

    if (hasLifecycle && activeEffectId) {
      const active = createActiveEffect(
        activeEffectId,
        effect,
        input,
        operationContext,
        options.now()
      );
      const existingIndex = state.effects.active.findIndex((entry) => entry.id === activeEffectId);
      if (existingIndex >= 0) {
        state.effects.active[existingIndex] = active;
      } else {
        state.effects.active.push(active);
      }
    }

    for (const modifier of effect.attributeModifiers ?? []) {
      options.modifyAttribute(state, modifier, input.effectId, operationContext);
    }
    for (const tag of effect.removedTags ?? []) {
      options.removeTag(state, tag, undefined, operationContext);
    }
    for (const tag of effect.grantedTags ?? []) {
      options.addTag(state, tag, `effect:${activeEffectId ?? effectTrace.id}`, operationContext);
    }
    if (replacedEffect) {
      removeGrantedTags(state, replacedEffect, operationContext);
    }

    options.persistActor(state);
    const result = effectResult(input, status, {
      activeEffectId,
      replacedEffectId: replacedEffect?.id
    });
    options.emit(`gas.effect_${status}`, result, operationContext);
    options.emitCues(effect.cues ?? [], input.sourceActorId, input.targetActorId, operationContext);
    return result;
  }

  function updateActor(state: GasActorRuntimeState): void {
    const remaining: GasActiveEffectState[] = [];
    const expired: GasActiveEffectState[] = [];

    for (const active of state.effects.active) {
      const definition = options.dataRegistry.getValue<GasEffectDefinition>(
        GAS_EFFECT_TYPE,
        active.effectId
      );
      const operationContext = activeEffectContext(active);
      let nextTickAt = active.nextTickAt;
      while (nextTickAt !== undefined && nextTickAt <= options.now()) {
        for (const modifier of definition.periodicModifiers ?? []) {
          options.modifyAttribute(state, modifier, active.effectId, operationContext);
        }
        nextTickAt += definition.periodMs ?? Number.POSITIVE_INFINITY;
      }

      const updated = {
        ...active,
        ...(nextTickAt === undefined ? {} : { nextTickAt })
      };
      if (active.expiresAt !== undefined && active.expiresAt <= options.now()) {
        expired.push(updated);
      } else {
        remaining.push(updated);
      }
    }

    state.effects.active = remaining;
    for (const active of expired) {
      const operationContext = activeEffectContext(active);
      removeGrantedTags(state, active, operationContext);
      const expiredTrace = options.trace(
        "effect.expired",
        {
          actorId: active.targetActorId,
          effectId: active.effectId,
          message: `Expired GAS effect: ${active.effectId}`
        },
        operationContext
      );
      options.emit(
        "gas.effect_expired",
        {
          actorId: active.targetActorId,
          effectId: active.effectId,
          activeEffectId: active.id
        },
        childGasContext(operationContext, expiredTrace.id)
      );
    }
  }

  function removeGrantedTags(
    state: GasActorRuntimeState,
    expired: GasActiveEffectState,
    context: GasOperationContext
  ): void {
    for (const tag of expired.grantedTags) {
      options.removeTag(state, tag, `effect:${expired.id}`, context);
    }
  }
}

function createActiveEffect(
  id: string,
  effect: GasEffectDefinition,
  input: GasEffectApplication,
  context: GasOperationContext,
  elapsed: number
): GasActiveEffectState {
  return {
    id,
    effectId: input.effectId,
    sourceActorId: input.sourceActorId,
    targetActorId: input.targetActorId,
    startedAt: elapsed,
    ...(effect.durationMs === undefined ? {} : { expiresAt: elapsed + effect.durationMs }),
    ...(effect.periodMs === undefined ? {} : { nextTickAt: elapsed + effect.periodMs }),
    grantedTags: [...(effect.grantedTags ?? [])],
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    ...(context.parentId === undefined ? {} : { parentTraceId: context.parentId })
  };
}

type NormalizedStacking = {
  limit: number;
  overflow: "reject-newest" | "refresh-oldest" | "replace-oldest";
  source: "any" | "same-source";
};

function normalizeStacking(effect: GasEffectDefinition): NormalizedStacking {
  const configuredLimit = effect.stacking?.limit;
  return {
    limit:
      configuredLimit !== undefined && Number.isInteger(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : 1,
    overflow: effect.stacking?.overflow ?? "refresh-oldest",
    source: effect.stacking?.source ?? "any"
  };
}

function matchingEffects(
  state: GasActorRuntimeState,
  input: GasEffectApplication,
  sourceMode: "any" | "same-source"
): GasActiveEffectState[] {
  return state.effects.active.filter(
    (active) =>
      active.effectId === input.effectId &&
      (sourceMode === "any" || active.sourceActorId === input.sourceActorId)
  );
}

function effectResult(
  input: GasEffectApplication,
  status: GasEffectApplicationResult["status"],
  details: Partial<
    Pick<GasEffectApplicationResult, "activeEffectId" | "replacedEffectId" | "reason">
  >
): GasEffectApplicationResult {
  return {
    effectId: input.effectId,
    targetActorId: input.targetActorId,
    ...(input.sourceActorId === undefined ? {} : { sourceActorId: input.sourceActorId }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    status,
    ...(details.activeEffectId === undefined ? {} : { activeEffectId: details.activeEffectId }),
    ...(details.replacedEffectId === undefined
      ? {}
      : { replacedEffectId: details.replacedEffectId }),
    ...(details.reason === undefined ? {} : { reason: details.reason })
  };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
