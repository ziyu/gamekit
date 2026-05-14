import {
  GAS_ABILITY_TYPE,
  GAS_ACTOR_TYPE,
  GAS_ATTRIBUTE_TYPE,
  GAS_CUE_TYPE,
  GAS_EFFECT_TYPE
} from "./data-types";
import { createGasError } from "./errors";
import { createGasTraceStore } from "./trace-store";
import { GasAbilities, GasActor, GasAttributes, GasEffects, GasTags } from "./components";
import type {
  CreateGasRuntimeConfig,
  GasAbilityDefinition,
  GasAbilityActivation,
  GasActorDefinition,
  GasActorId,
  GasActorRuntimeState,
  GasAttributeDefinition,
  GasAttributeModifier,
  GasCueDefinition,
  GasEffectApplication,
  GasEffectDefinition,
  GasRuntime
} from "./types";

export function createGasRuntime(config: CreateGasRuntimeConfig): GasRuntime {
  const traceStore = config.traceStore ?? createGasTraceStore();
  const actorEntityById = new Map<GasActorId, string | number>();
  const detachedActors = new Map<GasActorId, GasActorRuntimeState>();
  let elapsedNow = 0;
  let disposed = false;
  let effectSequence = 0;

  const runtime: GasRuntime = {
    traceStore,
    createActor(input) {
      assertActive();
      const definition = config.dataRegistry.getValue<GasActorDefinition>(
        GAS_ACTOR_TYPE,
        input.definitionId
      );
      const actorId = input.actorId ?? String(input.entityId ?? input.definitionId);
      const attributes = {
        ...definition.attributes,
        ...input.attributes
      };
      const tags = unique([...(definition.tags ?? []), ...(input.tags ?? [])]);
      const abilities = unique([...(definition.abilities ?? []), ...(input.abilities ?? [])]);
      const state: GasActorRuntimeState = {
        actor: {
          actorId,
          definitionId: input.definitionId,
          ...(input.entityId === undefined ? {} : { entityId: input.entityId })
        },
        attributes: {
          base: { ...attributes },
          current: { ...attributes }
        },
        tags: { values: tags },
        abilities: {
          ids: abilities,
          cooldowns: {},
          disabled: []
        },
        effects: {
          active: []
        }
      };

      if (input.entityId === undefined) {
        detachedActors.set(actorId, state);
      } else {
        config.world.add(input.entityId, GasActor, state.actor);
        config.world.add(input.entityId, GasAttributes, state.attributes);
        config.world.add(input.entityId, GasTags, state.tags);
        config.world.add(input.entityId, GasAbilities, state.abilities);
        config.world.add(input.entityId, GasEffects, state.effects);
        actorEntityById.set(actorId, input.entityId);
      }

      trace("actor.created", {
        actorId,
        message: `Created GAS actor: ${actorId}`,
        details: {
          definitionId: input.definitionId,
          entityId: input.entityId
        }
      });
      emit("gas.actor_created", {
        actorId,
        definitionId: input.definitionId,
        entityId: input.entityId
      });
      return cloneActorState(state);
    },
    hasActor(actorId) {
      return findState(actorId) !== undefined;
    },
    getActor(actorId) {
      const state = findState(actorId);
      if (!state) {
        throw createGasError("gas.missing_actor", `Missing GAS actor: ${actorId}`, { actorId });
      }

      return cloneActorState(state);
    },
    actorForEntity(entityId) {
      const state = readEntityActor(entityId);
      return state ? cloneActorState(state) : undefined;
    },
    activateAbility(input) {
      assertActive();
      activateAbility(input);
    },
    applyEffect(input) {
      assertActive();
      applyEffect(input);
    },
    modifyAttribute(actorId, modifier, source) {
      assertActive();
      const state = requireMutableActor(actorId);
      modifyAttributeState(state, modifier, source);
      persistState(state);
    },
    addTag(actorId, tag, source) {
      assertActive();
      const state = requireMutableActor(actorId);
      addTagState(state, tag, source);
      persistState(state);
    },
    removeTag(actorId, tag, source) {
      assertActive();
      const state = requireMutableActor(actorId);
      removeTagState(state, tag, source);
      persistState(state);
    },
    update(_delta, elapsed) {
      if (disposed) {
        return;
      }

      elapsedNow = elapsed;
      for (const state of mutableStates()) {
        updateActorEffects(state);
        persistState(state);
      }
    },
    snapshot() {
      return {
        actors: mutableStates().map(cloneActorState),
        traces: traceStore.list()
      };
    },
    dispose() {
      disposed = true;
      actorEntityById.clear();
      detachedActors.clear();
    }
  };

  return runtime;

  function activateAbility(input: GasAbilityActivation): void {
    const state = requireMutableActor(input.actorId);
    const ability = config.dataRegistry.getValue<GasAbilityDefinition>(
      GAS_ABILITY_TYPE,
      input.abilityId
    );

    if (!state.abilities.ids.includes(input.abilityId)) {
      rejectAbility(input, "actor does not know ability");
      return;
    }
    if (state.abilities.disabled.includes(input.abilityId)) {
      rejectAbility(input, "ability is disabled");
      return;
    }
    if ((state.abilities.cooldowns[input.abilityId] ?? 0) > elapsedNow) {
      rejectAbility(input, "ability is on cooldown");
      return;
    }
    if (!hasRequiredTags(state, ability)) {
      rejectAbility(input, "required tags are missing");
      return;
    }
    if (hasBlockedTags(state, ability)) {
      rejectAbility(input, "blocked tags are present");
      return;
    }
    if (!canPayCosts(state, ability)) {
      rejectAbility(input, "ability costs cannot be paid");
      return;
    }

    payCosts(state, ability);
    if ((ability.cooldownMs ?? 0) > 0) {
      state.abilities.cooldowns[input.abilityId] = elapsedNow + (ability.cooldownMs ?? 0);
    }
    persistState(state);

    trace("ability.activated", {
      actorId: input.actorId,
      abilityId: input.abilityId,
      message: `Activated GAS ability: ${input.abilityId}`,
      details: {
        targetActorId: input.targetActorId
      }
    });
    emit("gas.ability_activated", {
      actorId: input.actorId,
      abilityId: input.abilityId,
      targetActorId: input.targetActorId
    });

    for (const effect of ability.effects ?? []) {
      const targetActorId = effect.target === "self" ? input.actorId : input.targetActorId;
      if (!targetActorId) {
        throw createGasError(
          "gas.missing_effect_target",
          "GAS effect application requires target",
          {
            abilityId: input.abilityId,
            effectId: effect.effectId
          }
        );
      }
      applyEffect({
        sourceActorId: input.actorId,
        targetActorId,
        effectId: effect.effectId
      });
    }

    emitCues(ability.cues ?? [], input.actorId, input.targetActorId);
  }

  function rejectAbility(input: GasAbilityActivation, reason: string): void {
    trace("ability.rejected", {
      actorId: input.actorId,
      abilityId: input.abilityId,
      message: reason,
      details: {
        targetActorId: input.targetActorId
      }
    });
    emit("gas.ability_rejected", {
      actorId: input.actorId,
      abilityId: input.abilityId,
      targetActorId: input.targetActorId,
      reason
    });
  }

  function applyEffect(input: GasEffectApplication): void {
    const state = requireMutableActor(input.targetActorId);
    const effect = config.dataRegistry.getValue<GasEffectDefinition>(
      GAS_EFFECT_TYPE,
      input.effectId
    );

    for (const modifier of effect.attributeModifiers ?? []) {
      modifyAttributeState(state, modifier, input.effectId);
    }
    for (const tag of effect.removedTags ?? []) {
      removeTagState(state, tag, input.effectId);
    }
    for (const tag of effect.grantedTags ?? []) {
      addTagState(state, tag, input.effectId);
    }

    const hasLifecycle = effect.durationMs !== undefined || effect.periodMs !== undefined;
    if (hasLifecycle) {
      effectSequence += 1;
      state.effects.active.push({
        id: `${input.effectId}:${effectSequence}`,
        effectId: input.effectId,
        sourceActorId: input.sourceActorId,
        targetActorId: input.targetActorId,
        startedAt: elapsedNow,
        ...(effect.durationMs === undefined ? {} : { expiresAt: elapsedNow + effect.durationMs }),
        ...(effect.periodMs === undefined ? {} : { nextTickAt: elapsedNow + effect.periodMs }),
        grantedTags: [...(effect.grantedTags ?? [])]
      });
    }

    persistState(state);
    trace("effect.applied", {
      actorId: input.targetActorId,
      effectId: input.effectId,
      message: `Applied GAS effect: ${input.effectId}`,
      details: {
        sourceActorId: input.sourceActorId
      }
    });
    emit("gas.effect_applied", input);
    emitCues(effect.cues ?? [], input.sourceActorId, input.targetActorId);
  }

  function updateActorEffects(state: GasActorRuntimeState): void {
    const remaining = [];

    for (const active of state.effects.active) {
      const definition = config.dataRegistry.getValue<GasEffectDefinition>(
        GAS_EFFECT_TYPE,
        active.effectId
      );
      let nextTickAt = active.nextTickAt;
      while (nextTickAt !== undefined && nextTickAt <= elapsedNow) {
        for (const modifier of definition.periodicModifiers ?? []) {
          modifyAttributeState(state, modifier, active.effectId);
        }
        nextTickAt += definition.periodMs ?? Number.POSITIVE_INFINITY;
      }

      if (active.expiresAt !== undefined && active.expiresAt <= elapsedNow) {
        for (const tag of active.grantedTags) {
          removeTagState(state, tag, active.effectId);
        }
        trace("effect.expired", {
          actorId: active.targetActorId,
          effectId: active.effectId,
          message: `Expired GAS effect: ${active.effectId}`
        });
        emit("gas.effect_expired", {
          actorId: active.targetActorId,
          effectId: active.effectId
        });
        continue;
      }

      remaining.push({
        ...active,
        ...(nextTickAt === undefined ? {} : { nextTickAt })
      });
    }

    state.effects.active = remaining;
  }

  function canPayCosts(state: GasActorRuntimeState, ability: GasAbilityDefinition): boolean {
    return (ability.costs ?? []).every(
      (cost) => (state.attributes.current[cost.attribute] ?? 0) >= cost.amount
    );
  }

  function payCosts(state: GasActorRuntimeState, ability: GasAbilityDefinition): void {
    for (const cost of ability.costs ?? []) {
      modifyAttributeState(
        state,
        {
          attribute: cost.attribute,
          operation: "add",
          value: -cost.amount
        },
        ability.id
      );
    }
  }

  function hasRequiredTags(state: GasActorRuntimeState, ability: GasAbilityDefinition): boolean {
    return (ability.requiredTags ?? []).every((tag) => state.tags.values.includes(tag));
  }

  function hasBlockedTags(state: GasActorRuntimeState, ability: GasAbilityDefinition): boolean {
    return (ability.blockedTags ?? []).some((tag) => state.tags.values.includes(tag));
  }

  function modifyAttributeState(
    state: GasActorRuntimeState,
    modifier: GasAttributeModifier,
    source?: string
  ): void {
    const previous = state.attributes.current[modifier.attribute] ?? 0;
    const rawNext =
      modifier.operation === "set"
        ? modifier.value
        : modifier.operation === "multiply"
          ? previous * modifier.value
          : previous + modifier.value;
    const next = clampAttribute(modifier.attribute, rawNext);
    state.attributes.current[modifier.attribute] = next;
    trace("attribute.changed", {
      actorId: state.actor.actorId,
      message: `Changed GAS attribute: ${modifier.attribute}`,
      details: {
        attribute: modifier.attribute,
        previous,
        next,
        source
      }
    });
    emit("gas.attribute_changed", {
      actorId: state.actor.actorId,
      attribute: modifier.attribute,
      previous,
      next,
      source
    });
  }

  function addTagState(state: GasActorRuntimeState, tag: string, source?: string): void {
    if (state.tags.values.includes(tag)) {
      return;
    }
    state.tags.values.push(tag);
    trace("tag.added", {
      actorId: state.actor.actorId,
      message: `Added GAS tag: ${tag}`,
      details: { tag, source }
    });
    emit("gas.tag_added", {
      actorId: state.actor.actorId,
      tag,
      source
    });
  }

  function removeTagState(state: GasActorRuntimeState, tag: string, source?: string): void {
    if (!state.tags.values.includes(tag)) {
      return;
    }
    state.tags.values = state.tags.values.filter((value) => value !== tag);
    trace("tag.removed", {
      actorId: state.actor.actorId,
      message: `Removed GAS tag: ${tag}`,
      details: { tag, source }
    });
    emit("gas.tag_removed", {
      actorId: state.actor.actorId,
      tag,
      source
    });
  }

  function emitCues(cueIds: string[], sourceActorId?: string, targetActorId?: string): void {
    for (const cueId of cueIds) {
      const cue = config.dataRegistry.getValue<GasCueDefinition>(GAS_CUE_TYPE, cueId);
      const event = {
        cueId,
        type: cue.type,
        sourceActorId,
        targetActorId,
        payload: cue.payload
      };
      trace("cue.emitted", {
        actorId: targetActorId ?? sourceActorId,
        message: `Emitted GAS cue: ${cueId}`,
        details: event
      });
      emit("gas.cue", event);
    }
  }

  function clampAttribute(attribute: string, value: number): number {
    if (!config.dataRegistry.has(GAS_ATTRIBUTE_TYPE, attribute)) {
      return value;
    }

    const definition = config.dataRegistry.getValue<GasAttributeDefinition>(
      GAS_ATTRIBUTE_TYPE,
      attribute
    );
    const min = definition.min ?? Number.NEGATIVE_INFINITY;
    const max = definition.max ?? Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(min, value));
  }

  function requireMutableActor(actorId: string): GasActorRuntimeState {
    const state = findState(actorId);
    if (!state) {
      throw createGasError("gas.missing_actor", `Missing GAS actor: ${actorId}`, { actorId });
    }
    return state;
  }

  function findState(actorId: string): GasActorRuntimeState | undefined {
    const entityId = actorEntityById.get(actorId);
    if (entityId !== undefined) {
      return readEntityActor(entityId);
    }
    return detachedActors.get(actorId);
  }

  function readEntityActor(entityId: string | number): GasActorRuntimeState | undefined {
    const actor = config.world.get(entityId, GasActor);
    const attributes = config.world.get(entityId, GasAttributes);
    const tags = config.world.get(entityId, GasTags);
    const abilities = config.world.get(entityId, GasAbilities);
    const effects = config.world.get(entityId, GasEffects);

    return actor && attributes && tags && abilities && effects
      ? { actor, attributes, tags, abilities, effects }
      : undefined;
  }

  function mutableStates(): GasActorRuntimeState[] {
    return [
      ...config.world
        .query([GasActor, GasAttributes, GasTags, GasAbilities, GasEffects])
        .map(readEntityActor)
        .filter((state): state is GasActorRuntimeState => state !== undefined),
      ...detachedActors.values()
    ];
  }

  function persistState(state: GasActorRuntimeState): void {
    const entityId = state.actor.entityId;
    if (entityId === undefined) {
      detachedActors.set(state.actor.actorId, cloneActorState(state));
      return;
    }

    config.world.set(entityId, GasAttributes, cloneAttributes(state.attributes));
    config.world.set(entityId, GasTags, { values: [...state.tags.values] });
    config.world.set(entityId, GasAbilities, {
      ids: [...state.abilities.ids],
      cooldowns: { ...state.abilities.cooldowns },
      disabled: [...state.abilities.disabled]
    });
    config.world.set(entityId, GasEffects, {
      active: state.effects.active.map((effect) => ({ ...effect }))
    });
  }

  function trace(
    type: Parameters<typeof traceStore.add>[0]["type"],
    entry: Omit<Parameters<typeof traceStore.add>[0], "type" | "timestamp">
  ): void {
    traceStore.add({
      type,
      timestamp: elapsedNow,
      ...entry
    });
  }

  function emit(type: string, payload: unknown): void {
    config.eventBus?.emit(type, payload, "gas");
  }

  function assertActive(): void {
    if (disposed) {
      throw createGasError("gas.disposed", "GAS runtime is disposed");
    }
  }
}

function cloneActorState(state: GasActorRuntimeState): GasActorRuntimeState {
  return {
    actor: { ...state.actor },
    attributes: cloneAttributes(state.attributes),
    tags: { values: [...state.tags.values] },
    abilities: {
      ids: [...state.abilities.ids],
      cooldowns: { ...state.abilities.cooldowns },
      disabled: [...state.abilities.disabled]
    },
    effects: {
      active: state.effects.active.map((effect) => ({ ...effect }))
    }
  };
}

function cloneAttributes(
  attributes: GasActorRuntimeState["attributes"]
): GasActorRuntimeState["attributes"] {
  return {
    base: { ...attributes.base },
    current: { ...attributes.current }
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
