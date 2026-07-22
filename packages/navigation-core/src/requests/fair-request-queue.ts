export type FairQueuedRequest = {
  request: { requesterId: string };
  state: "queued" | "submitted" | "terminal";
};

export type FairRequestQueue<TRequest extends FairQueuedRequest> = {
  enqueue(request: TRequest): void;
  dequeue(): TRequest | undefined;
  size(): number;
  clear(): void;
};

export function createFairRequestQueue<
  TRequest extends FairQueuedRequest
>(): FairRequestQueue<TRequest> {
  const queues = new Map<string, TRequest[]>();
  const requesterOrder: string[] = [];
  let cursor = 0;
  let count = 0;

  return {
    enqueue(request) {
      let queue = queues.get(request.request.requesterId);
      if (queue === undefined) {
        queue = [];
        queues.set(request.request.requesterId, queue);
        requesterOrder.push(request.request.requesterId);
      }
      queue.push(request);
      count += 1;
    },
    dequeue() {
      while (requesterOrder.length > 0) {
        cursor %= requesterOrder.length;
        const requesterId = requesterOrder[cursor];
        if (requesterId === undefined) {
          return undefined;
        }
        const queue = queues.get(requesterId);
        if (queue === undefined || queue.length === 0) {
          removeRequester(requesterId);
          continue;
        }
        const request = queue.shift();
        count = Math.max(0, count - 1);
        cursor = (cursor + 1) % requesterOrder.length;
        if (queue.length === 0) {
          removeRequester(requesterId);
        }
        if (request !== undefined && request.state === "queued") {
          return request;
        }
      }
      return undefined;
    },
    size: () => count,
    clear() {
      queues.clear();
      requesterOrder.length = 0;
      cursor = 0;
      count = 0;
    }
  };

  function removeRequester(requesterId: string): void {
    queues.delete(requesterId);
    const index = requesterOrder.indexOf(requesterId);
    if (index < 0) {
      return;
    }
    requesterOrder.splice(index, 1);
    if (requesterOrder.length === 0) {
      cursor = 0;
    } else {
      cursor %= requesterOrder.length;
    }
  }
}
