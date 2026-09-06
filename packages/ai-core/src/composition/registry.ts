import { createAiError } from "../contracts/errors";

export function createAiRegistry<TValue extends { id: string }>(
  values: TValue[],
  category: string
): Map<string, TValue> {
  const result = new Map<string, TValue>();
  for (const value of values) {
    if (!value.id || result.has(value.id)) {
      throw createAiError(
        "ai.duplicate_registry_entry",
        `Duplicate AI ${category} registry entry: ${value.id}`
      );
    }
    result.set(value.id, value);
  }
  return result;
}
