/**
 * Small seeded PRNG (mulberry32). Deterministic given its state, which keeps
 * the session reducer pure and makes generator tests reproducible.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  /** Current internal state, safe to store and pass back to `createRng`. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const rng: Rng = {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      if (max < min) throw new RangeError(`empty range [${min}, ${max}]`);
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new RangeError("cannot pick from an empty list");
      return items[rng.int(0, items.length - 1)] as (typeof items)[number];
    },
    chance(probability) {
      return rng.next() < probability;
    },
    get state() {
      return state;
    },
  };
  return rng;
}

/** Fresh seed from the platform's randomness, for real sessions. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
