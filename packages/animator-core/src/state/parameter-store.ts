import { createAnimatorError } from "../contracts/errors";
import type {
  AnimatorConditionOperator,
  AnimatorParameterDefinition,
  AnimatorTransitionCondition
} from "../graph/graph-definition";
import type { AnimatorParameterValue } from "../contracts/controller-binding";
import { markAnimatorControllerDirty, type AnimatorControllerState } from "./controller-state";

export function createAnimatorParameterStore(
  definitions: Iterable<AnimatorParameterDefinition>
): Map<string, AnimatorParameterValue> {
  const parameters = new Map<string, AnimatorParameterValue>();
  for (const definition of definitions) {
    if (definition.type !== "trigger") {
      parameters.set(definition.id, defaultAnimatorParameterValue(definition));
    }
  }
  return parameters;
}

export function resetAnimatorParameterStore(state: AnimatorControllerState): void {
  state.parameters = createAnimatorParameterStore(state.parameterDefinitions.values());
  state.triggers.clear();
}

export function setAnimatorParameter(
  state: AnimatorControllerState,
  parameterId: string,
  value: AnimatorParameterValue
): boolean {
  const definition = state.parameterDefinitions.get(parameterId);
  if (definition === undefined || definition.type === "trigger") {
    throw createAnimatorError(
      "animator.definition_missing",
      `Animator parameter is missing or is a trigger: ${parameterId}`,
      { controllerId: state.binding.controllerId, parameterId }
    );
  }
  if (!animatorParameterValueMatches(definition, value)) {
    throw createAnimatorError("animator.invalid_config", "Animator parameter type mismatch", {
      controllerId: state.binding.controllerId,
      parameterId,
      expected: definition.type,
      actual: typeof value
    });
  }
  if (Object.is(state.parameters.get(parameterId), value)) {
    return false;
  }
  state.parameters.set(parameterId, value);
  markAnimatorControllerDirty(state, `parameter:${parameterId}`);
  return true;
}

export function animatorConditionMatches(
  state: AnimatorControllerState,
  condition: AnimatorTransitionCondition
): boolean {
  if (condition.operator === "triggered") {
    return state.triggers.has(condition.parameter);
  }
  return compareAnimatorParameter(
    state.parameters.get(condition.parameter),
    condition.operator,
    condition.value
  );
}

function compareAnimatorParameter(
  actual: AnimatorParameterValue | undefined,
  operator: Exclude<AnimatorConditionOperator, "triggered">,
  expected: AnimatorParameterValue | undefined
): boolean {
  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case ">=":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "<":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "<=":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
  }
}

function defaultAnimatorParameterValue(
  definition: AnimatorParameterDefinition
): AnimatorParameterValue {
  if (definition.default !== undefined) {
    return definition.default;
  }
  switch (definition.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return "";
    case "trigger":
      return false;
  }
}

function animatorParameterValueMatches(
  definition: AnimatorParameterDefinition,
  value: AnimatorParameterValue
): boolean {
  switch (definition.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "trigger":
      return false;
  }
}
