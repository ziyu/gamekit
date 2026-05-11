import { GameError } from "../errors/game-error";

export type Rng = {
  readonly seed: string;
  next(): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
};

export function createSeededRng(seed: string): Rng {
  let state = hashSeed(seed);

  return {
    seed,
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    int(minInclusive, maxExclusive) {
      if (maxExclusive <= minInclusive) {
        throw new GameError("rng.invalid_range", "maxExclusive must be greater than minInclusive", {
          minInclusive,
          maxExclusive
        });
      }

      return Math.floor(this.next() * (maxExclusive - minInclusive)) + minInclusive;
    },
    pick<T>(items: readonly T[]) {
      if (items.length === 0) {
        throw new GameError("rng.empty_pick", "Cannot pick from an empty collection");
      }

      return items[this.int(0, items.length)] as T;
    }
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
