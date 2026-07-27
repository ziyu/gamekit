import type { AiBlackboardValue } from "../contracts/blackboard-value";
import { createAiError } from "../contracts/errors";

export type AiBlackboardValueLimits = {
  maxDepth: number;
  maxNodes: number;
  maxStringLength: number;
};

export type AiBlackboard = {
  readonly limit: number;
  readonly size: number;
  set(key: string, value: AiBlackboardValue): void;
  delete(key: string): void;
  read<TValue extends AiBlackboardValue = AiBlackboardValue>(key: string): TValue | undefined;
  keys(): string[];
  capture(): Record<string, AiBlackboardValue>;
  replace(values: Record<string, AiBlackboardValue>): void;
  clear(): void;
};

export type CreateAiBlackboardOptions = {
  limit: number;
  valueLimits: AiBlackboardValueLimits;
};

export function createAiBlackboard(options: CreateAiBlackboardOptions): AiBlackboard {
  const values = new Map<string, AiBlackboardValue>();

  return {
    limit: options.limit,
    get size() {
      return values.size;
    },
    set(key, value) {
      validateKey(key, options.valueLimits.maxStringLength);
      if (!values.has(key) && values.size >= options.limit) {
        throw createAiError("ai.blackboard_capacity", "AI blackboard capacity is exhausted", {
          key,
          limit: options.limit
        });
      }
      values.set(key, cloneAiBlackboardValue(value, options.valueLimits));
    },
    delete(key) {
      values.delete(key);
    },
    read<TValue extends AiBlackboardValue = AiBlackboardValue>(key: string) {
      const value = values.get(key);
      return value === undefined
        ? undefined
        : (cloneAiBlackboardValue(value, options.valueLimits) as TValue);
    },
    keys() {
      return [...values.keys()].sort();
    },
    capture() {
      return captureValues(values, options.valueLimits);
    },
    replace(nextValues) {
      const entries = Object.entries(nextValues).sort(([left], [right]) =>
        left.localeCompare(right)
      );
      if (entries.length > options.limit) {
        throw createAiError("ai.blackboard_capacity", "AI checkpoint blackboard exceeds capacity", {
          entries: entries.length,
          limit: options.limit
        });
      }
      const replacement = new Map<string, AiBlackboardValue>();
      for (const [key, value] of entries) {
        validateKey(key, options.valueLimits.maxStringLength);
        replacement.set(key, cloneAiBlackboardValue(value, options.valueLimits));
      }
      values.clear();
      for (const [key, value] of replacement) {
        values.set(key, value);
      }
    },
    clear() {
      values.clear();
    }
  };
}

export function cloneAiBlackboardValue(
  value: AiBlackboardValue,
  limits: AiBlackboardValueLimits
): AiBlackboardValue {
  let nodes = 0;
  const ancestors = new Set<object>();

  return visit(value, 0);

  function visit(current: unknown, depth: number): AiBlackboardValue {
    nodes += 1;
    if (nodes > limits.maxNodes) {
      throw invalidValue("AI blackboard value exceeds the node limit", {
        maxNodes: limits.maxNodes
      });
    }
    if (depth > limits.maxDepth) {
      throw invalidValue("AI blackboard value exceeds the depth limit", {
        maxDepth: limits.maxDepth
      });
    }
    if (current === null || typeof current === "boolean") {
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw invalidValue("AI blackboard numbers must be finite");
      }
      return current;
    }
    if (typeof current === "string") {
      if (current.length > limits.maxStringLength) {
        throw invalidValue("AI blackboard string exceeds the length limit", {
          maxStringLength: limits.maxStringLength
        });
      }
      return current;
    }
    if (typeof current !== "object") {
      throw invalidValue("AI blackboard values must be JSON-like data");
    }
    if (ancestors.has(current)) {
      throw invalidValue("AI blackboard values cannot contain cycles");
    }
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const result: AiBlackboardValue[] = [];
        for (let index = 0; index < current.length; index += 1) {
          if (!(index in current)) {
            throw invalidValue("AI blackboard arrays cannot contain sparse entries");
          }
          result.push(visit(current[index], depth + 1));
        }
        return result;
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw invalidValue("AI blackboard values cannot contain class or native objects");
      }
      const result: Record<string, AiBlackboardValue> = {};
      const descriptors = Object.getOwnPropertyDescriptors(current);
      for (const key of Object.keys(descriptors).sort()) {
        validateKey(key, limits.maxStringLength);
        const descriptor = descriptors[key];
        if (descriptor === undefined || !("value" in descriptor)) {
          throw invalidValue("AI blackboard values cannot contain accessors", { key });
        }
        if (descriptor.enumerable) {
          Object.defineProperty(result, key, {
            value: visit(descriptor.value, depth + 1),
            enumerable: true,
            configurable: true,
            writable: true
          });
        }
      }
      return result;
    } finally {
      ancestors.delete(current);
    }
  }
}

function captureValues(
  values: Map<string, AiBlackboardValue>,
  limits: AiBlackboardValueLimits
): Record<string, AiBlackboardValue> {
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, cloneAiBlackboardValue(value, limits)])
  );
}

function validateKey(key: string, maxLength: number): void {
  if (typeof key !== "string" || key.trim().length === 0 || key.length > maxLength) {
    throw createAiError(
      "ai.blackboard_invalid_key",
      "AI blackboard keys must be non-empty and within the configured length limit",
      { key, maxLength }
    );
  }
}

function invalidValue(message: string, details?: Record<string, unknown>) {
  return createAiError("ai.blackboard_invalid_value", message, details);
}
