import { type AdvancedSettings, activeNumberTypes, activeOperations } from "@/lib/engine/advanced";
import type { Rng } from "@/lib/engine/rng";
import { type NumberType, OPERATIONS, type Operation } from "@/lib/engine/types";

/** One question's slot in the mix: which operation, in which number format. */
export interface MixDraw {
  operation: Operation;
  numberType: NumberType;
}

/**
 * Largest-remainder apportionment: split `total` into whole counts
 * proportional to `weights` that sum to exactly `total`. Leftover slots go to
 * the largest fractional parts, and a weight of zero never receives one.
 */
export function apportion(weights: readonly number[], total: number): number[] {
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  const counts = safe.map(() => 0);
  if (total <= 0 || sum <= 0) return counts;

  const exact = safe.map((weight) => (weight / sum) * total);
  exact.forEach((value, index) => {
    counts[index] = Math.floor(value);
  });
  const assigned = counts.reduce((acc, count) => acc + count, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => (safe[index] ?? 0) > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let slot = 0; slot < total - assigned && order.length > 0; slot += 1) {
    const target = order[slot % order.length];
    if (target) counts[target.index] = (counts[target.index] ?? 0) + 1;
  }
  return counts;
}

/** Fisher–Yates driven by the seeded RNG, so a session stays reproducible. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng, fallback: T): T {
  if (items.length === 0) return fallback;
  const total = items.reduce((acc, item) => acc + Math.max(0, weightOf(item)), 0);
  if (total <= 0) return rng.pick(items);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] as T;
}

/** Repeat each item its apportioned number of times, then shuffle the result. */
function expand<T>(items: readonly T[], weightOf: (item: T) => number, total: number, rng: Rng): T[] {
  const counts = apportion(
    items.map((item) => weightOf(item)),
    total,
  );
  const out: T[] = [];
  items.forEach((item, index) => {
    for (let n = 0; n < (counts[index] ?? 0); n += 1) out.push(item);
  });
  return shuffle(out, rng);
}

const operationsOf = (advanced: AdvancedSettings): Operation[] => {
  const active = activeOperations(advanced);
  return active.length > 0 ? active : [...OPERATIONS];
};

const numberTypesOf = (advanced: AdvancedSettings): NumberType[] => {
  const active = activeNumberTypes(advanced);
  return active.length > 0 ? active : ["integer"];
};

/**
 * A fixed schedule for a session of known length, where the operation counts
 * and the number-format counts each match the requested percentages as closely
 * as `count` allows. The two groups are apportioned and shuffled
 * independently, so formats are spread across the operations instead of being
 * tied to them.
 */
export function buildMixSchedule(advanced: AdvancedSettings, count: number, rng: Rng): MixDraw[] {
  const operations = expand(operationsOf(advanced), (op) => advanced.operationMix[op], count, rng);
  const numberTypes = expand(numberTypesOf(advanced), (type) => advanced.formatMix[type], count, rng);
  const fallbackType = numberTypesOf(advanced)[0] ?? "integer";
  return operations.map((operation, index) => ({ operation, numberType: numberTypes[index] ?? fallbackType }));
}

/** Weighted draw for open-ended practice, where the question count is unknown up front. */
export function sampleMix(advanced: AdvancedSettings, rng: Rng): MixDraw {
  return {
    operation: weightedPick(operationsOf(advanced), (op) => advanced.operationMix[op], rng, "addition"),
    numberType: weightedPick(numberTypesOf(advanced), (type) => advanced.formatMix[type], rng, "integer"),
  };
}
