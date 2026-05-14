import { defineComponent } from "@gamekit/world";
import type {
  GasAbilitiesComponentState,
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
    values: [...(data?.values ?? [])]
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

export const GasEffects = defineComponent<GasEffectsComponentState>({
  id: "gamekit.gas.effects",
  create: (data) => ({
    active: [...(data?.active ?? [])]
  })
});
