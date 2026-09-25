import { describe, expect, it } from "vitest";
import { createRng, randomSeed } from "./rng";

describe("seeded rng", () => {
  it("is deterministic for the same seed and diverges for different seeds", () => {
    const a = createRng(123);
    const b = createRng(123);
    const c = createRng(124);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    const seqC = Array.from({ length: 10 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("produces floats in [0, 1) and integers within inclusive bounds", () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it("can be resumed from a saved state", () => {
    const rng = createRng(77);
    rng.next();
    rng.next();
    const resumed = createRng(rng.state);
    expect(resumed.next()).toBe(rng.next());
  });

  it("picks from lists and rejects empty ranges", () => {
    const rng = createRng(9);
    expect(["a", "b"]).toContain(rng.pick(["a", "b"]));
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(0)).toBe(false);
  });

  it("produces 32-bit seeds", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
