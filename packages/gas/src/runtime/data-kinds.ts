import type { DataDiagnostic, DataKindDefinition } from "@gamekit/data";
import type {
  GasAbilityDefinition,
  GasActorDefinition,
  GasAttributeDefinition,
  GasCueDefinition,
  GasEffectDefinition,
  GasTagDefinition
} from "./types";

export const GAS_ACTOR_KIND = "gas.actor";
export const GAS_ATTRIBUTE_KIND = "gas.attribute";
export const GAS_ABILITY_KIND = "gas.ability";
export const GAS_EFFECT_KIND = "gas.effect";
export const GAS_TAG_KIND = "gas.tag";
export const GAS_CUE_KIND = "gas.cue";

export function createGasDataKinds(): Array<DataKindDefinition<any>> {
  return [
    createGasActorDataKind(),
    createGasAttributeDataKind(),
    createGasAbilityDataKind(),
    createGasEffectDataKind(),
    createGasTagDataKind(),
    createGasCueDataKind()
  ];
}

export function createGasActorDataKind(): DataKindDefinition<GasActorDefinition> {
  return {
    kind: GAS_ACTOR_KIND,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return (document.value.abilities ?? []).map((id, index) => ({
        kind: GAS_ABILITY_KIND,
        id,
        path: `abilities[${index}]`
      }));
    },
    validate(document) {
      return validateStringId(document.value.id, "gas.actor_missing_id", "Gas actor requires id");
    }
  };
}

export function createGasAttributeDataKind(): DataKindDefinition<GasAttributeDefinition> {
  return {
    kind: GAS_ATTRIBUTE_KIND,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      const diagnostics = validateStringId(
        document.value.id,
        "gas.attribute_missing_id",
        "Gas attribute requires id"
      );

      if (
        document.value.min !== undefined &&
        document.value.max !== undefined &&
        document.value.min > document.value.max
      ) {
        diagnostics.push({
          code: "gas.attribute_invalid_range",
          message: "Gas attribute min cannot be greater than max",
          severity: "error",
          key: document
        });
      }

      return diagnostics;
    }
  };
}

export function createGasAbilityDataKind(): DataKindDefinition<GasAbilityDefinition> {
  return {
    kind: GAS_ABILITY_KIND,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        ...(document.value.effects ?? []).map((effect, index) => ({
          kind: GAS_EFFECT_KIND,
          id: effect.effectId,
          path: `effects[${index}].effectId`
        })),
        ...(document.value.cues ?? []).map((id, index) => ({
          kind: GAS_CUE_KIND,
          id,
          path: `cues[${index}]`,
          optional: true
        }))
      ];
    },
    validate(document) {
      const diagnostics = validateStringId(
        document.value.id,
        "gas.ability_missing_id",
        "Gas ability requires id"
      );

      if ((document.value.cooldownMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.ability_invalid_cooldown",
          message: "Gas ability cooldown cannot be negative",
          severity: "error",
          key: document
        });
      }

      for (const [index, cost] of (document.value.costs ?? []).entries()) {
        if (cost.amount < 0) {
          diagnostics.push({
            code: "gas.ability_invalid_cost",
            message: "Gas ability cost cannot be negative",
            severity: "error",
            key: document,
            path: `costs[${index}]`
          });
        }
      }

      return diagnostics;
    }
  };
}

export function createGasEffectDataKind(): DataKindDefinition<GasEffectDefinition> {
  return {
    kind: GAS_EFFECT_KIND,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return (document.value.cues ?? []).map((id, index) => ({
        kind: GAS_CUE_KIND,
        id,
        path: `cues[${index}]`,
        optional: true
      }));
    },
    validate(document) {
      const diagnostics = validateStringId(
        document.value.id,
        "gas.effect_missing_id",
        "Gas effect requires id"
      );

      if ((document.value.durationMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.effect_invalid_duration",
          message: "Gas effect duration cannot be negative",
          severity: "error",
          key: document
        });
      }
      if ((document.value.periodMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.effect_invalid_period",
          message: "Gas effect period cannot be negative",
          severity: "error",
          key: document
        });
      }

      return diagnostics;
    }
  };
}

export function createGasTagDataKind(): DataKindDefinition<GasTagDefinition> {
  return {
    kind: GAS_TAG_KIND,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      return validateStringId(document.value.id, "gas.tag_missing_id", "Gas tag requires id");
    }
  };
}

export function createGasCueDataKind(): DataKindDefinition<GasCueDefinition> {
  return {
    kind: GAS_CUE_KIND,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      const diagnostics = validateStringId(
        document.value.id,
        "gas.cue_missing_id",
        "Gas cue requires id"
      );

      if (!document.value.type) {
        diagnostics.push({
          code: "gas.cue_missing_type",
          message: "Gas cue requires type",
          severity: "error",
          key: document
        });
      }

      return diagnostics;
    }
  };
}

function validateStringId(id: string, code: string, message: string): DataDiagnostic[] {
  return typeof id === "string" && id.length > 0
    ? []
    : [
        {
          code,
          message,
          severity: "error"
        }
      ];
}
