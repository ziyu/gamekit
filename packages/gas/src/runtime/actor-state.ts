import type { GasActorRuntimeState } from "./types";

export function cloneGasActorState(state: GasActorRuntimeState): GasActorRuntimeState {
  return {
    actor: { ...state.actor },
    attributes: cloneGasAttributes(state.attributes),
    tags: cloneGasTags(state.tags),
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

export function cloneGasAttributes(
  attributes: GasActorRuntimeState["attributes"]
): GasActorRuntimeState["attributes"] {
  return {
    base: { ...attributes.base },
    current: { ...attributes.current }
  };
}

export function cloneGasTags(tags: GasActorRuntimeState["tags"]): GasActorRuntimeState["tags"] {
  return {
    values: [...tags.values],
    sources: Object.fromEntries(
      Object.entries(tags.sources ?? {}).map(([tag, sources]) => [tag, [...sources]])
    )
  };
}

export function uniqueGasValues(values: string[]): string[] {
  return [...new Set(values)];
}
