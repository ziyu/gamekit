import type { SaveEntityMap } from "./types";

export function createSaveEntityMap(
  entries: Array<[string | number, string | number]> = []
): SaveEntityMap {
  const map = new Map<string | number, string | number>(entries);

  return {
    get(oldEntityId) {
      return map.get(oldEntityId);
    },
    set(oldEntityId, newEntityId) {
      map.set(oldEntityId, newEntityId);
    },
    entries() {
      return [...map.entries()];
    }
  };
}
