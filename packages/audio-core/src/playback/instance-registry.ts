import type { PlaybackInstanceState, PlaybackTarget } from "../contracts/playback";

type IndexName = "category" | "sourceId" | "busId" | "ownerId" | "emitterId";

export type PlaybackInstanceRegistry = {
  add(instance: PlaybackInstanceState): void;
  delete(instanceId: string): PlaybackInstanceState | undefined;
  get(instanceId: string): PlaybackInstanceState | undefined;
  has(instanceId: string): boolean;
  list(target?: PlaybackTarget): PlaybackInstanceState[];
  size(): number;
  clear(): void;
};

export function createPlaybackInstanceRegistry(): PlaybackInstanceRegistry {
  const instances = new Map<string, PlaybackInstanceState>();
  const indexes: Record<IndexName, Map<string, Set<string>>> = {
    category: new Map(),
    sourceId: new Map(),
    busId: new Map(),
    ownerId: new Map(),
    emitterId: new Map()
  };
  return {
    add(instance) {
      instances.set(instance.id, instance);
      addIndex("category", instance.category, instance.id);
      addIndex("sourceId", instance.sourceId, instance.id);
      addIndex("busId", instance.busId, instance.id);
      addIndex("ownerId", instance.ownerId, instance.id);
      addIndex("emitterId", instance.emitterId, instance.id);
    },
    delete(instanceId) {
      const instance = instances.get(instanceId);
      if (instance === undefined) {
        return undefined;
      }
      instances.delete(instanceId);
      removeIndex("category", instance.category, instanceId);
      removeIndex("sourceId", instance.sourceId, instanceId);
      removeIndex("busId", instance.busId, instanceId);
      removeIndex("ownerId", instance.ownerId, instanceId);
      removeIndex("emitterId", instance.emitterId, instanceId);
      return instance;
    },
    get: (instanceId) => instances.get(instanceId),
    has: (instanceId) => instances.has(instanceId),
    list(target = {}) {
      const candidateSets: Set<string>[] = [];
      if (target.instanceId !== undefined) {
        candidateSets.push(new Set(instances.has(target.instanceId) ? [target.instanceId] : []));
      }
      collect("category", target.category, candidateSets);
      collect("sourceId", target.sourceId, candidateSets);
      collect("busId", target.busId, candidateSets);
      collect("ownerId", target.ownerId, candidateSets);
      collect("emitterId", target.emitterId, candidateSets);
      const ids =
        candidateSets.length === 0
          ? [...instances.keys()]
          : [...(candidateSets.sort((left, right) => left.size - right.size)[0] ?? [])];
      return ids
        .flatMap((id) => {
          const instance = instances.get(id);
          return instance !== undefined && matches(instance, target) ? [instance] : [];
        })
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    size: () => instances.size,
    clear() {
      instances.clear();
      for (const index of Object.values(indexes)) {
        index.clear();
      }
    }
  };

  function collect(name: IndexName, value: string | undefined, result: Set<string>[]): void {
    if (value !== undefined) {
      result.push(indexes[name].get(value) ?? new Set());
    }
  }

  function addIndex(name: IndexName, value: string | undefined, instanceId: string): void {
    if (value === undefined) {
      return;
    }
    const entries = indexes[name].get(value) ?? new Set<string>();
    entries.add(instanceId);
    indexes[name].set(value, entries);
  }

  function removeIndex(name: IndexName, value: string | undefined, instanceId: string): void {
    if (value === undefined) {
      return;
    }
    const entries = indexes[name].get(value);
    entries?.delete(instanceId);
    if (entries?.size === 0) {
      indexes[name].delete(value);
    }
  }
}

function matches(instance: PlaybackInstanceState, target: PlaybackTarget): boolean {
  return (
    (target.instanceId === undefined || instance.id === target.instanceId) &&
    (target.category === undefined || instance.category === target.category) &&
    (target.sourceId === undefined || instance.sourceId === target.sourceId) &&
    (target.busId === undefined || instance.busId === target.busId) &&
    (target.ownerId === undefined || instance.ownerId === target.ownerId) &&
    (target.emitterId === undefined || instance.emitterId === target.emitterId)
  );
}
