import { describe, expect, it } from "vitest";
import { type AdvancedSettings, DEFAULT_ADVANCED_SETTINGS } from "@/lib/engine/advanced";
import { createRng } from "@/lib/engine/rng";
import { NUMBER_TYPES, type NumberType, OPERATIONS, type Operation } from "@/lib/engine/types";
import { apportion, buildMixSchedule, sampleMix, shuffle } from "./mix";

function advanced(overrides: Partial<AdvancedSettings> = {}): AdvancedSettings {
  return { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, ...overrides };
}

/** The brief's example: 40/20/30/10 operations and 75/25 integers vs fractions. */
const EXAMPLE = advanced({
  operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 },
  formatMix: { integer: 75, decimal: 0, fraction: 25 },
});

const countBy = <T extends string>(items: readonly { [K in "operation" | "numberType"]: string }[], key: "operation" | "numberType", keys: readonly T[]) => {
  const counts = {} as Record<T, number>;
  for (const k of keys) counts[k] = 0;
  for (const item of items) counts[item[key] as T] += 1;
  return counts;
};

describe("apportion", () => {
  it("splits a total exactly in proportion to the weights", () => {
    expect(apportion([40, 20, 30, 10], 10)).toEqual([4, 2, 3, 1]);
    expect(apportion([40, 20, 30, 10], 100)).toEqual([40, 20, 30, 10]);
    expect(apportion([75, 25], 20)).toEqual([15, 5]);
  });

  it("always sums to the total, however awkward the division", () => {
    for (const total of [1, 2, 3, 7, 13, 17, 99, 101, 500]) {
      for (const weights of [[40, 20, 30, 10], [75, 25], [33, 33, 34], [1, 1, 1, 97], [25, 25, 25, 25]]) {
        const counts = apportion(weights, total);
        expect(counts.reduce((a, b) => a + b, 0), `${weights} over ${total}`).toBe(total);
      }
    }
  });

  it("gives the leftover slots to the largest remainders", () => {
    // Three equal weights over 10 → 3.33 each; the tie breaks towards the first.
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    // 50/25/25 over 3 → 1.5 / 0.75 / 0.75: the two larger remainders take the
    // spare slots, so the big weight does not round up at their expense.
    expect(apportion([50, 25, 25], 3)).toEqual([1, 1, 1]);
    expect(apportion([50, 25, 25], 4)).toEqual([2, 1, 1]);
  });

  it("never gives a slot to a zero weight", () => {
    expect(apportion([0, 100, 0], 7)).toEqual([0, 7, 0]);
    expect(apportion([0, 1, 0, 1], 5)).toEqual([0, 3, 0, 2]);
  });

  it("handles degenerate inputs without throwing", () => {
    expect(apportion([], 5)).toEqual([]);
    expect(apportion([0, 0], 5)).toEqual([0, 0]);
    expect(apportion([50, 50], 0)).toEqual([0, 0]);
    expect(apportion([50, 50], -3)).toEqual([0, 0]);
    expect(apportion([Number.NaN, 50], 4)).toEqual([0, 4]);
  });
});

describe("shuffle", () => {
  it("keeps every element and is deterministic for a seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const once = shuffle(items, createRng(7));
    expect([...once].sort((a, b) => a - b)).toEqual(items);
    expect(shuffle(items, createRng(7))).toEqual(once);
    expect(shuffle(items, createRng(8))).not.toEqual(once);
  });
});

describe("finite-session schedules", () => {
  it("matches the requested percentages exactly when the count allows", () => {
    const schedule = buildMixSchedule(EXAMPLE, 20, createRng(1));
    expect(schedule).toHaveLength(20);
    expect(countBy(schedule, "operation", OPERATIONS)).toEqual({ addition: 8, subtraction: 4, multiplication: 6, division: 2, finance: 0 });
    expect(countBy(schedule, "numberType", NUMBER_TYPES)).toEqual({ integer: 15, decimal: 0, fraction: 5 });
  });

  it("keeps both groups within one question of target for any length", () => {
    for (const count of [1, 3, 4, 7, 9, 11, 23, 50, 137, 500]) {
      const schedule = buildMixSchedule(EXAMPLE, count, createRng(count));
      expect(schedule).toHaveLength(count);
      const operations = countBy(schedule, "operation", OPERATIONS);
      for (const op of OPERATIONS) {
        const ideal = (EXAMPLE.operationMix[op] / 100) * count;
        expect(Math.abs(operations[op] - ideal), `${op} over ${count}`).toBeLessThan(1);
      }
      const formats = countBy(schedule, "numberType", NUMBER_TYPES);
      for (const type of NUMBER_TYPES) {
        const ideal = (EXAMPLE.formatMix[type] / 100) * count;
        expect(Math.abs(formats[type] - ideal), `${type} over ${count}`).toBeLessThan(1);
      }
    }
  });

  it("never schedules an operation or format set to 0%", () => {
    const settings = advanced({
      operationMix: { addition: 50, subtraction: 0, multiplication: 50, division: 0, finance: 0 },
      formatMix: { integer: 0, decimal: 0, fraction: 100 },
    });
    const schedule = buildMixSchedule(settings, 60, createRng(3));
    expect(schedule.every((slot) => slot.operation === "addition" || slot.operation === "multiplication")).toBe(true);
    expect(schedule.every((slot) => slot.numberType === "fraction")).toBe(true);
  });

  it("spreads formats across operations rather than tying them together", () => {
    // 75% integers over four operations should leave fractions appearing with
    // more than one operation, which a paired draw could not guarantee.
    const schedule = buildMixSchedule(EXAMPLE, 200, createRng(11));
    const fractionOperations = new Set(schedule.filter((slot) => slot.numberType === "fraction").map((slot) => slot.operation));
    expect(fractionOperations.size).toBeGreaterThan(1);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const first = buildMixSchedule(EXAMPLE, 30, createRng(5));
    expect(buildMixSchedule(EXAMPLE, 30, createRng(5))).toEqual(first);
    expect(buildMixSchedule(EXAMPLE, 30, createRng(6))).not.toEqual(first);
  });
});

describe("open-ended sampling", () => {
  it("converges on the requested percentages", () => {
    const rng = createRng(0xbeef);
    const draws = Array.from({ length: 8000 }, () => sampleMix(EXAMPLE, rng));
    const operations = countBy(draws, "operation", OPERATIONS);
    for (const op of OPERATIONS) {
      expect(operations[op] / draws.length, op).toBeCloseTo(EXAMPLE.operationMix[op] / 100, 1);
    }
    const formats = countBy(draws, "numberType", NUMBER_TYPES);
    for (const type of NUMBER_TYPES) {
      expect(formats[type] / draws.length, type).toBeCloseTo(EXAMPLE.formatMix[type] / 100, 1);
    }
  });

  it("never draws something excluded at 0%", () => {
    const settings = advanced({
      operationMix: { addition: 0, subtraction: 0, multiplication: 100, division: 0, finance: 0 },
      formatMix: { integer: 60, decimal: 0, fraction: 40 },
    });
    const rng = createRng(2);
    for (let i = 0; i < 500; i += 1) {
      const draw = sampleMix(settings, rng);
      expect(draw.operation).toBe<Operation>("multiplication");
      expect(draw.numberType).not.toBe<NumberType>("decimal");
    }
  });
});
