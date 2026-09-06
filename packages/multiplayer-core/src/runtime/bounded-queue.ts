export type BoundedQueue<TValue> = {
  readonly capacity: number;
  readonly length: number;
  enqueue(value: TValue): boolean;
  dequeue(): TValue | undefined;
  removeWhere(predicate: (value: TValue) => boolean, onRemove?: (value: TValue) => void): number;
  clear(onRemove?: (value: TValue) => void): void;
};

export function createBoundedQueue<TValue>(capacity: number): BoundedQueue<TValue> {
  const normalizedCapacity = Math.max(1, Math.floor(capacity));
  const values: Array<TValue | undefined> = new Array(normalizedCapacity);
  let head = 0;
  let length = 0;

  function enqueue(value: TValue): boolean {
    if (length >= normalizedCapacity) {
      return false;
    }

    values[(head + length) % normalizedCapacity] = value;
    length += 1;
    return true;
  }

  function dequeue(): TValue | undefined {
    if (length === 0) {
      return undefined;
    }

    const value = values[head];
    values[head] = undefined;
    head = (head + 1) % normalizedCapacity;
    length -= 1;
    if (length === 0) {
      head = 0;
    }
    return value;
  }

  return {
    capacity: normalizedCapacity,
    get length() {
      return length;
    },
    enqueue,
    dequeue,
    removeWhere(predicate, onRemove) {
      const pending = length;
      let removed = 0;
      for (let index = 0; index < pending; index += 1) {
        const value = dequeue();
        if (value === undefined) {
          continue;
        }
        if (predicate(value)) {
          removed += 1;
          onRemove?.(value);
        } else {
          enqueue(value);
        }
      }
      return removed;
    },
    clear(onRemove) {
      while (length > 0) {
        const value = dequeue();
        if (value !== undefined) {
          onRemove?.(value);
        }
      }
    }
  };
}
