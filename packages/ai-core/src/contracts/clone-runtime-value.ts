export function cloneAiRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneAiRuntimeValue(item)])
  );
}

export function cloneAiRuntimeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneAiRuntimeValue(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneAiRuntimeValue(item)
      ])
    ) as T;
  }
  return value;
}
