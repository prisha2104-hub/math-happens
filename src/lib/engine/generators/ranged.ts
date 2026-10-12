import { type Rational, compare, fromInteger, gcd, rational } from "@/lib/math/rational";
import {
  type FractionRanges,
  MAX_FRACTION_PART,
  MAX_OPERAND,
  MIN_FRACTION_PART,
  MIN_OPERAND,
  type NumericRange,
} from "../advanced";
import type { Rng } from "../rng";
import type { ArithmeticOperation, Difficulty, RawProblem } from "../types";

/**
 * Generators driven by user-configured ranges rather than difficulty tiers.
 *
 * Every bound is clamped and ordered before use, so a half-typed or invalid
 * range can never make the RNG throw or spin: each generator either finds a
 * question inside the range or returns a degenerate but valid one.
 */
const MAX_TRIES = 64;

function clampRange(range: NumericRange, lowest: number, highest: number): [number, number] {
  const min = Math.max(lowest, Math.min(highest, Math.round(range.min) || lowest));
  const max = Math.max(min, Math.min(highest, Math.round(range.max) || min));
  return [min, max];
}

const operandBounds = (range: NumericRange) => clampRange(range, MIN_OPERAND, MAX_OPERAND);
const fractionBounds = (range: NumericRange) => clampRange(range, MIN_FRACTION_PART, MAX_FRACTION_PART);

function problem(variant: string, a: number, b: number): RawProblem {
  return { variant, operands: [fromInteger(a), fromInteger(b)] };
}

/** Hard difficulty keeps the operands in random order a quarter of the time so negatives appear. */
function allowsNegative(rng: Rng, difficulty: Difficulty): boolean {
  return difficulty === "hard" && rng.chance(0.25);
}

function rangedAddition(rng: Rng, range: NumericRange): RawProblem {
  const [min, max] = operandBounds(range);
  return problem("int-add-custom", rng.int(min, max), rng.int(min, max));
}

function rangedSubtraction(rng: Rng, range: NumericRange, difficulty: Difficulty): RawProblem {
  const [min, max] = operandBounds(range);
  let a = rng.int(min, max);
  let b = rng.int(min, max);
  // A single-value range cannot avoid a === b; after the retries the zero
  // result is accepted rather than looping forever.
  for (let i = 0; i < MAX_TRIES && a === b; i += 1) b = rng.int(min, max);
  if (!allowsNegative(rng, difficulty) && b > a) [a, b] = [b, a];
  return problem(`int-sub-custom${a < b ? "-negative" : ""}`, a, b);
}

/**
 * Both operands come from the same range unless a second range is given, in
 * which case the first operand uses `range` and the second uses `secondRange`
 * — which is how a lopsided product such as four-digit × three-digit is set
 * up. Omitting it keeps the original behaviour exactly.
 */
function rangedMultiplication(rng: Rng, range: NumericRange, secondRange: NumericRange | null): RawProblem {
  const [min, max] = operandBounds(range);
  if (secondRange === null) return problem("int-mul-custom", rng.int(min, max), rng.int(min, max));
  const [secondMin, secondMax] = operandBounds(secondRange);
  return problem("int-mul-custom", rng.int(min, max), rng.int(secondMin, secondMax));
}

/**
 * Division stays exact by building the dividend from divisor × quotient, with
 * both the dividend and the divisor inside the range and a quotient of at
 * least 2. That needs `max >= 2 * min`; narrower ranges (which validation
 * rejects) fall back to `min ÷ min`.
 */
function rangedDivision(rng: Rng, range: NumericRange): RawProblem {
  const [min, max] = operandBounds(range);
  const largestDivisor = Math.floor(max / 2);
  if (largestDivisor < min) return problem("int-div-custom", min, min);
  const divisor = rng.int(min, largestDivisor);
  const quotient = rng.int(Math.max(2, Math.ceil(min / divisor)), Math.floor(max / divisor));
  return problem("int-div-custom", divisor * quotient, divisor);
}

export interface RangedOptions {
  /** Separate bounds for the second multiplication operand; null shares one range. */
  secondRange?: NumericRange | null;
}

export function generateRangedIntegerProblem(
  rng: Rng,
  operation: ArithmeticOperation,
  range: NumericRange,
  difficulty: Difficulty,
  { secondRange = null }: RangedOptions = {},
): RawProblem {
  switch (operation) {
    case "addition":
      return rangedAddition(rng, range);
    case "subtraction":
      return rangedSubtraction(rng, range, difficulty);
    case "multiplication":
      return rangedMultiplication(rng, range, secondRange);
    case "division":
      return rangedDivision(rng, range);
  }
}

/**
 * A fraction whose numerator and denominator both sit inside the configured
 * ranges. Coprime pairs are preferred so the displayed fraction keeps the
 * numbers that were drawn: 4/6 would reduce to 2/3 and show a numerator
 * outside the range. Improper fractions are allowed — the ranges are honoured
 * literally. Denominators start at 1, so they can never be zero.
 */
export function rangedFraction(rng: Rng, ranges: FractionRanges): Rational {
  const [numMin, numMax] = fractionBounds(ranges.numerator);
  const [denMin, denMax] = fractionBounds(ranges.denominator);
  for (let i = 0; i < MAX_TRIES; i += 1) {
    const num = rng.int(numMin, numMax);
    const den = rng.int(denMin, denMax);
    if (gcd(num, den) === 1) return rational(num, den);
  }
  return rational(rng.int(numMin, numMax), rng.int(denMin, denMax));
}

export function generateRangedFractionProblem(rng: Rng, operation: ArithmeticOperation, ranges: FractionRanges, difficulty: Difficulty): RawProblem {
  const draw = () => rangedFraction(rng, ranges);
  switch (operation) {
    case "addition":
      return { variant: "frac-add-custom", operands: [draw(), draw()] };
    case "multiplication":
      return { variant: "frac-mul-custom", operands: [draw(), draw()] };
    case "subtraction": {
      let a = draw();
      let b = draw();
      for (let i = 0; i < MAX_TRIES && compare(a, b) === 0; i += 1) b = draw();
      if (!allowsNegative(rng, difficulty) && compare(b, a) > 0) [a, b] = [b, a];
      return { variant: `frac-sub-custom${compare(a, b) < 0 ? "-negative" : ""}`, operands: [a, b] };
    }
    case "division": {
      // Avoid x ÷ x = 1, which teaches nothing. Numerators start at 1, so the
      // divisor is never zero.
      const a = draw();
      let b = draw();
      for (let i = 0; i < MAX_TRIES && compare(a, b) === 0; i += 1) b = draw();
      return { variant: "frac-div-custom", operands: [a, b] };
    }
  }
}
