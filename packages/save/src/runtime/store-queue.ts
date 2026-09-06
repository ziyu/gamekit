const queues = new WeakMap<object, Promise<unknown>>();

// Serialize mutations sharing the same platform object, including separate store wrappers.
export function serializeStoreMutation<T>(owner: object, operation: () => Promise<T>): Promise<T> {
  const result = (queues.get(owner) ?? Promise.resolve()).then(operation);
  queues.set(
    owner,
    result.catch(() => undefined)
  );
  return result;
}
