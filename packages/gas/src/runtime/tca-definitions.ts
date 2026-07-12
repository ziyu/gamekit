import { createGasError } from "./errors";
import type {
  CreateGasTcaDefinitionsConfig,
  GasAbilityActivation,
  GasAttributeModifier,
  GasEffectApplication,
  GasTcaDefinitionSet
} from "./types";

export function createGasTcaDefinitions(
  config: CreateGasTcaDefinitionsConfig
): GasTcaDefinitionSet {
  return {
    conditions: [
      {
        type: "gas.actor.has_tag",
        description: "Checks whether a GAS actor has a tag.",
        evaluate(_ctx, condition) {
          const runtime = requireRuntime(config);
          const actorId = readString(condition.args, "actorId");
          const tag = readString(condition.args, "tag");
          if (!actorId || !tag || !runtime.hasActor(actorId)) {
            return false;
          }

          return runtime.getActor(actorId).tags.values.includes(tag);
        }
      },
      {
        type: "gas.attribute.compare",
        description: "Compares a GAS actor attribute value.",
        evaluate(_ctx, condition) {
          const runtime = requireRuntime(config);
          const actorId = readString(condition.args, "actorId");
          const attribute = readString(condition.args, "attribute");
          const operator = readString(condition.args, "operator") ?? ">=";
          const value = readNumber(condition.args, "value");
          if (!actorId || !attribute || value === undefined || !runtime.hasActor(actorId)) {
            return false;
          }

          const actual = runtime.getActor(actorId).attributes.current[attribute] ?? 0;
          return compare(actual, operator, value);
        }
      }
    ],
    actions: [
      {
        type: "gas.activate_ability",
        description: "Activates a GAS ability.",
        execute(ctx, action) {
          requireRuntime(config).activateAbility({
            ...readAbilityActivation(action.args),
            ...correlationFromTca(ctx)
          });
        }
      },
      {
        type: "gas.apply_effect",
        description: "Applies a GAS effect.",
        execute(ctx, action) {
          requireRuntime(config).applyEffect({
            ...readEffectApplication(action.args),
            ...correlationFromTca(ctx)
          });
        }
      },
      {
        type: "gas.modify_attribute",
        description: "Modifies a GAS actor attribute.",
        execute(ctx, action) {
          const actorId = readRequiredString(action.args, "actorId");
          const source = readString(action.args, "source") ?? "tca";
          requireRuntime(config).modifyAttribute(
            actorId,
            readAttributeModifier(action.args),
            source,
            correlationFromTca(ctx)
          );
        }
      }
    ]
  };
}

function correlationFromTca(ctx: { correlationId?: string | undefined; traceId: string }) {
  return {
    ...(ctx.correlationId === undefined ? {} : { correlationId: ctx.correlationId }),
    parentId: ctx.traceId
  };
}

function requireRuntime(config: CreateGasTcaDefinitionsConfig) {
  const runtime = config.runtime();
  if (!runtime) {
    throw createGasError("gas.runtime_unavailable", "GAS runtime is unavailable for TCA action");
  }

  return runtime;
}

function readAbilityActivation(args: Record<string, unknown> | undefined): GasAbilityActivation {
  return {
    actorId: readRequiredString(args, "actorId"),
    abilityId: readRequiredString(args, "abilityId"),
    targetActorId: readString(args, "targetActorId")
  };
}

function readEffectApplication(args: Record<string, unknown> | undefined): GasEffectApplication {
  return {
    effectId: readRequiredString(args, "effectId"),
    targetActorId: readRequiredString(args, "targetActorId"),
    sourceActorId: readString(args, "sourceActorId")
  };
}

function readAttributeModifier(args: Record<string, unknown> | undefined): GasAttributeModifier {
  const operation = readString(args, "operation") ?? "add";
  if (operation !== "add" && operation !== "multiply" && operation !== "set") {
    throw createGasError("gas.invalid_modifier_operation", `Invalid GAS modifier: ${operation}`);
  }

  return {
    attribute: readRequiredString(args, "attribute"),
    operation,
    value: readRequiredNumber(args, "value")
  };
}

function compare(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case "==":
    case "===":
      return actual === expected;
    case "!=":
    case "!==":
      return actual !== expected;
    default:
      throw createGasError("gas.invalid_attribute_operator", `Invalid GAS operator: ${operator}`);
  }
}

function readRequiredString(args: Record<string, unknown> | undefined, key: string): string {
  const value = readString(args, key);
  if (!value) {
    throw createGasError("gas.missing_tca_arg", `Missing GAS TCA string arg: ${key}`);
  }
  return value;
}

function readRequiredNumber(args: Record<string, unknown> | undefined, key: string): number {
  const value = readNumber(args, key);
  if (value === undefined) {
    throw createGasError("gas.missing_tca_arg", `Missing GAS TCA number arg: ${key}`);
  }
  return value;
}

function readString(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(args: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = args?.[key];
  return typeof value === "number" ? value : undefined;
}
