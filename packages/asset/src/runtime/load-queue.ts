export function createAssetLoadQueue(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("maxConcurrentLoads must be a positive safe integer");
  }
  let active = 0;
  const queued: Array<() => void> = [];
  return {
    get active() {
      return active;
    },
    get queued() {
      return queued.length;
    },
    run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const cancel = () => {
          const index = queued.indexOf(start);
          if (index >= 0) queued.splice(index, 1);
          reject(signal.reason);
        };
        const start = () => {
          signal.removeEventListener("abort", cancel);
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          active++;
          Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              active--;
              queued.shift()?.();
            });
        };
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        if (active < limit) start();
        else {
          queued.push(start);
          signal.addEventListener("abort", cancel, { once: true });
        }
      });
    }
  };
}
