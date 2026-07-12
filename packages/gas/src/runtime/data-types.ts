import type { DataDiagnostic, DataTypeDefinition } from "@gamekit/data";
import type {
  GasAbilityDefinition,
  GasActorDefinition,
  GasAttributeDefinition,
  GasCueDefinition,
  GasEffectDefinition,
  GasTagDefinition
} from "./types";

export const GAS_ACTOR_TYPE = "gas.actor";
export const GAS_ATTRIBUTE_TYPE = "gas.attribute";
export const GAS_ABILITY_TYPE = "gas.ability";
export const GAS_EFFECT_TYPE = "gas.effect";
export const GAS_TAG_TYPE = "gas.tag";
export const GAS_CUE_TYPE = "gas.cue";

export function createGasDataTypes(): Array<DataTypeDefinition<any>> {
  return [
    createGasActorDataType(),
    createGasAttributeDataType(),
    createGasAbilityDataType(),
    createGasEffectDataType(),
    createGasTagDataType(),
    createGasCueDataType()
  ];
}

export function createGasActorDataType(): DataTypeDefinition<GasActorDefinition> {
  return {
    type: GAS_ACTOR_TYPE,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return (document.data.abilities ?? []).map((id, index) => ({
        type: GAS_ABILITY_TYPE,
        id,
        path: `abilities[${index}]`
      }));
    },
    validate(document) {
      return validateStringId(document.data.id, "gas.actor_missing_id", "Gas actor requires id");
    }
  };
}

export function createGasAttributeDataType(): DataTypeDefinition<GasAttributeDefinition> {
  return {
    type: GAS_ATTRIBUTE_TYPE,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      const diagnostics = validateStringId(
        document.data.id,
        "gas.attribute_missing_id",
        "Gas attribute requires id"
      );

      if (
        document.data.min !== undefined &&
        document.data.max !== undefined &&
        document.data.min > document.data.max
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

export function createGasAbilityDataType(): DataTypeDefinition<GasAbilityDefinition> {
  return {
    type: GAS_ABILITY_TYPE,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return [
        ...(document.data.effects ?? []).map((effect, index) => ({
          type: GAS_EFFECT_TYPE,
          id: effect.effectId,
          path: `effects[${index}].effectId`
        })),
        ...(document.data.cues ?? []).map((id, index) => ({
          type: GAS_CUE_TYPE,
          id,
          path: `cues[${index}]`,
          optional: true
        }))
      ];
    },
    validate(document) {
      const diagnostics = validateStringId(
        document.data.id,
        "gas.ability_missing_id",
        "Gas ability requires id"
      );

      if ((document.data.cooldownMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.ability_invalid_cooldown",
          message: "Gas ability cooldown cannot be negative",
          severity: "error",
          key: document
        });
      }

      for (const [index, cost] of (document.data.costs ?? []).entries()) {
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

export function createGasEffectDataType(): DataTypeDefinition<GasEffectDefinition> {
  return {
    type: GAS_EFFECT_TYPE,
    getTags: (definition) => definition.tags ?? [],
    references(document) {
      return (document.data.cues ?? []).map((id, index) => ({
        type: GAS_CUE_TYPE,
        id,
        path: `cues[${index}]`,
        optional: true
      }));
    },
    validate(document) {
      const diagnostics = validateStringId(
        document.data.id,
        "gas.effect_missing_id",
        "Gas effect requires id"
      );

      if ((document.data.durationMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.effect_invalid_duration",
          message: "Gas effect duration cannot be negative",
          severity: "error",
          key: document
        });
      }
      if ((document.data.periodMs ?? 0) < 0) {
        diagnostics.push({
          code: "gas.effect_invalid_period",
          message: "Gas effect period cannot be negative",
          severity: "error",
          key: document
        });
      }

      if (
        document.data.stacking !== undefined &&
        (!Number.isInteger(document.data.stacking.limit) || document.data.stacking.limit <= 0)
      ) {
        diagnostics.push({
          code: "gas.effect_invalid_stack_limit",
          message: "Gas effect stack limit must be a positive integer",
          severity: "error",
          key: document,
          path: "stacking.limit"
        });
      }

      return diagnostics;
    }
  };
}

export function createGasTagDataType(): DataTypeDefinition<GasTagDefinition> {
  return {
    type: GAS_TAG_TYPE,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      return validateStringId(document.data.id, "gas.tag_missing_id", "Gas tag requires id");
    }
  };
}

export function createGasCueDataType(): DataTypeDefinition<GasCueDefinition> {
  return {
    type: GAS_CUE_TYPE,
    getTags: (definition) => definition.tags ?? [],
    validate(document) {
      const diagnostics = validateStringId(
        document.data.id,
        "gas.cue_missing_id",
        "Gas cue requires id"
      );

      if (!document.data.type) {
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
