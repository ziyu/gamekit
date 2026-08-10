type HeapEntry = { nodeId: string; distance: number };

export function createMinHeap(): {
  push(entry: HeapEntry): void;
  pop(): HeapEntry | undefined;
} {
  const entries: HeapEntry[] = [];
  return {
    push(entry) {
      entries.push(entry);
      let index = entries.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compare(entries[parent]!, entries[index]!) <= 0) {
          break;
        }
        [entries[parent], entries[index]] = [entries[index]!, entries[parent]!];
        index = parent;
      }
    },
    pop() {
      const first = entries[0];
      const last = entries.pop();
      if (first === undefined || last === undefined) {
        return first;
      }
      if (entries.length > 0) {
        entries[0] = last;
        let index = 0;
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
            break;
          }
          [entries[index], entries[smallest]] = [entries[smallest]!, entries[index]!];
          index = smallest;
        }
      }
      return first;
    }
  };
}

function compare(left: HeapEntry, right: HeapEntry): number {
  return left.distance - right.distance || left.nodeId.localeCompare(right.nodeId);
}
