import { type Rational, compare, gcd, lcm, rational } from "@/lib/math/rational";
import type { Rng } from "../rng";
import type { ArithmeticOperation, Difficulty, RawProblem } from "../types";

/** Proper fraction in lowest terms with the given denominator. */
export function properFraction(rng: Rng, den: number): Rational {
  const candidates: number[] = [];
  for (let num = 1; num < den; num += 1) if (gcd(num, den) === 1) candidates.push(num);
  return rational(rng.pick(candidates), den);
}

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

const EASY_ADDITIVE_POOL = [2, 3, 4, 5, 6, 8, 10, 12];

function divides(a: number, b: number): boolean {
  return b % a === 0 || a % b === 0;
}

/** Denominator pairs whose common denominator is mental-math friendly. */
function additivePairs(difficulty: Difficulty): [number, number][] {
  const pairs: [number, number][] = [];
  switch (difficulty) {
    case "easy":
      // Same denominator, or one divides the other: 1/2 + 1/4, 5/6 − 1/3.
      for (const d1 of EASY_ADDITIVE_POOL) {
        for (const d2 of EASY_ADDITIVE_POOL) if (divides(d1, d2)) pairs.push([d1, d2]);
      }
      return pairs;
    case "medium":
      // Neither divides the other and the LCM stays at or below 24: 3/4 − 1/6.
      for (const d1 of range(2, 12)) {
        for (const d2 of range(2, 12)) if (!divides(d1, d2) && lcm(d1, d2) <= 24) pairs.push([d1, d2]);
      }
      return pairs;
    case "hard":
      // Neither divides the other and the LCM lies between 24 and 90: 5/8 + 3/10.
      for (const d1 of range(3, 16)) {
        for (const d2 of range(3, 16)) {
          const l = lcm(d1, d2);
          if (!divides(d1, d2) && l >= 24 && l <= 90) pairs.push([d1, d2]);
        }
      }
      return pairs;
  }
}

const ADDITIVE_PAIRS: Record<Difficulty, [number, number][]> = {
  easy: additivePairs("easy"),
  medium: additivePairs("medium"),
  hard: additivePairs("hard"),
};

const MULTIPLICATIVE_DENOMINATORS: Record<Difficulty, number[]> = {
  easy: range(2, 6),
  medium: range(2, 9),
  hard: range(3, 12),
};

function additiveOperands(rng: Rng, difficulty: Difficulty): [Rational, Rational] {
  const [d1, d2] = rng.pick(ADDITIVE_PAIRS[difficulty]);
  return [properFraction(rng, d1), properFraction(rng, d2)];
}

function addition(rng: Rng, difficulty: Difficulty): RawProblem {
  return { variant: `frac-add-${difficulty}`, operands: additiveOperands(rng, difficulty) };
}

function subtraction(rng: Rng, difficulty: Difficulty): RawProblem {
  let [a, b] = additiveOperands(rng, difficulty);
  while (compare(a, b) === 0) [a, b] = additiveOperands(rng, difficulty);
  const allowNegative = difficulty === "hard" && rng.chance(0.25);
  if (!allowNegative && compare(b, a) > 0) [a, b] = [b, a];
  return { variant: `frac-sub-${difficulty}${compare(a, b) < 0 ? "-negative" : ""}`, operands: [a, b] };
}

/**
 * Medium avoids the unit-fraction-only corner (1/a × 1/b), and hard requires
 * denominators of at least 4 with a product of at least 40 so that problems
 * such as 2/5 × 1/3 stay in the easy tier.
 */
function acceptableMultiplicative(difficulty: Difficulty, a: Rational, b: Rational): boolean {
  switch (difficulty) {
    case "easy":
      return true;
    case "medium":
      return a.num > 1 || b.num > 1;
    case "hard":
      return Math.min(a.den, b.den) >= 4 && a.den * b.den >= 40 && (a.num > 1 || b.num > 1);
  }
}

function multiplicativeOperands(rng: Rng, difficulty: Difficulty): [Rational, Rational] {
  const pool = MULTIPLICATIVE_DENOMINATORS[difficulty];
  for (;;) {
    const a = properFraction(rng, rng.pick(pool));
    const b = properFraction(rng, rng.pick(pool));
    if (acceptableMultiplicative(difficulty, a, b)) return [a, b];
  }
}

function multiplication(rng: Rng, difficulty: Difficulty): RawProblem {
  return { variant: `frac-mul-${difficulty}`, operands: multiplicativeOperands(rng, difficulty) };
}

function division(rng: Rng, difficulty: Difficulty): RawProblem {
  let operands = multiplicativeOperands(rng, difficulty);
  // Avoid x ÷ x = 1, which teaches nothing.
  while (compare(operands[0], operands[1]) === 0) operands = multiplicativeOperands(rng, difficulty);
  return { variant: `frac-div-${difficulty}`, operands };
}

export function generateFractionProblem(rng: Rng, operation: ArithmeticOperation, difficulty: Difficulty): RawProblem {
  switch (operation) {
    case "addition":
      return addition(rng, difficulty);
    case "subtraction":
      return subtraction(rng, difficulty);
    case "multiplication":
      return multiplication(rng, difficulty);
    case "division":
      return division(rng, difficulty);
  }
}
