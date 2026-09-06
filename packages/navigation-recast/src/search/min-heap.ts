type RecastFieldHeapEntry = {
  polygonRef: number;
  distance: number;
};

export type RecastFieldMinHeap = {
  push(entry: RecastFieldHeapEntry): void;
  pop(): RecastFieldHeapEntry | undefined;
};

export function createRecastFieldMinHeap(): RecastFieldMinHeap {
  const entries: RecastFieldHeapEntry[] = [];

  return {
    push(entry) {
      entries.push(entry);
      bubbleUp(entries.length - 1);
    },
    pop() {
      const first = entries[0];
      const last = entries.pop();
      if (first === undefined || last === undefined) {
        return first;
      }
      if (entries.length > 0) {
        entries[0] = last;
        bubbleDown(0);
      }
      return first;
    }
  };

  function bubbleUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(entries[parent]!, entries[index]!) <= 0) {
        return;
      }
      [entries[parent], entries[index]] = [entries[index]!, entries[parent]!];
      index = parent;
    }
  }

  function bubbleDown(startIndex: number): void {
    let index = startIndex;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < entries.length && compare(entries[left]!, entries[smallest]!) < 0) {
        smallest = left;
      }
      if (right < entries.length && compare(entries[right]!, entries[smallest]!) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      [entries[index], entries[smallest]] = [entries[smallest]!, entries[index]!];
      index = smallest;
    }
  }
}

function compare(left: RecastFieldHeapEntry, right: RecastFieldHeapEntry): number {
  return left.distance - right.distance || left.polygonRef - right.polygonRef;
}
