import { defineComponent } from "@gamekit/world";
import type {
  GasAbilitiesComponentState,
  GasAbilityExecutionsComponentState,
  GasActorComponentState,
  GasAttributesComponentState,
  GasEffectsComponentState,
  GasTagsComponentState
} from "./types";

export const GasActor = defineComponent<GasActorComponentState>({
  id: "gamekit.gas.actor",
  create: (data) => ({
    actorId: data?.actorId ?? "",
    definitionId: data?.definitionId ?? "",
    ...(data?.entityId === undefined ? {} : { entityId: data.entityId })
  })
});

export const GasAttributes = defineComponent<GasAttributesComponentState>({
  id: "gamekit.gas.attributes",
  create: (data) => ({
    base: { ...data?.base },
    current: { ...data?.current }
  })
});

export const GasTags = defineComponent<GasTagsComponentState>({
  id: "gamekit.gas.tags",
  create: (data) => ({
    values: [...(data?.values ?? [])],
    sources: Object.fromEntries(
      Object.entries(data?.sources ?? {}).map(([tag, sources]) => [tag, [...sources]])
    )
  })
});

export const GasAbilities = defineComponent<GasAbilitiesComponentState>({
  id: "gamekit.gas.abilities",
  create: (data) => ({
    ids: [...(data?.ids ?? [])],
    cooldowns: { ...data?.cooldowns },
    disabled: [...(data?.disabled ?? [])]
  })
});

export const GasAbilityExecutions = defineComponent<GasAbilityExecutionsComponentState>({
  id: "gamekit.gas.ability-executions",
  create: (data) => ({
    active: (data?.active ?? []).map((execution) => ({
      ...execution,
      paidCosts: execution.paidCosts.map((cost) => ({ ...cost })),
      appliedEffects: execution.appliedEffects.map((effect) => ({ ...effect }))
    }))
  })
});

export const GasEffects = defineComponent<GasEffectsComponentState>({
  id: "gamekit.gas.effects",
  create: (data) => ({
    active: [...(data?.active ?? [])]
  })
});
