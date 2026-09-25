import { type Rational, compare, fromInteger, mul, rational } from "@/lib/math/rational";
import type { Rng } from "../rng";
import type { Difficulty, Operation, RawProblem } from "../types";

/**
 * Random decimal with exactly `places` decimal places (final digit non-zero)
 * in the inclusive range [min, max]. Bounds must be representable with
 * `places` places themselves.
 */
export function randomDecimal(rng: Rng, places: number, min: number, max: number): Rational {
  const scale = 10 ** places;
  const lo = Math.round(min * scale);
  const hi = Math.round(max * scale);
  for (let i = 0; i < 100; i += 1) {
    const mantissa = rng.int(lo, hi);
    if (mantissa % 10 !== 0 && mantissa !== 0) return rational(mantissa, scale);
  }
  return rational(lo | 1, scale);
}

function ordered(rng: Rng, variant: string, a: Rational, b: Rational): RawProblem {
  return rng.chance(0.5) ? { variant, operands: [a, b] } : { variant, operands: [b, a] };
}

function additiveOperands(rng: Rng, difficulty: Difficulty): RawProblem {
  switch (difficulty) {
    case "easy":
      return { variant: "dec-additive-1dp-1dp", operands: [randomDecimal(rng, 1, 0.1, 9.9), randomDecimal(rng, 1, 0.1, 9.9)] };
    case "medium":
      return ordered(rng, "dec-additive-1dp-2dp", randomDecimal(rng, 1, 1.1, 19.9), randomDecimal(rng, 2, 0.11, 19.99));
    case "hard":
      return rng.chance(0.6)
        ? { variant: "dec-additive-2dp-2dp", operands: [randomDecimal(rng, 2, 1.01, 99.99), randomDecimal(rng, 2, 1.01, 99.99)] }
        : ordered(rng, "dec-additive-1dp-large-2dp", randomDecimal(rng, 1, 10.1, 999.9), randomDecimal(rng, 2, 1.01, 99.99));
  }
}

function addition(rng: Rng, difficulty: Difficulty): RawProblem {
  const base = additiveOperands(rng, difficulty);
  return { ...base, variant: base.variant.replace("additive", "add") };
}

function subtraction(rng: Rng, difficulty: Difficulty): RawProblem {
  let base = additiveOperands(rng, difficulty);
  while (compare(base.operands[0], base.operands[1]) === 0) base = additiveOperands(rng, difficulty);
  let [a, b] = base.operands;
  const allowNegative = difficulty === "hard" && rng.chance(0.25);
  if (!allowNegative && compare(b, a) > 0) [a, b] = [b, a];
  const negative = compare(a, b) < 0;
  return { variant: base.variant.replace("additive", "sub") + (negative ? "-negative" : ""), operands: [a, b] };
}

/**
 * Multiplication difficulty tracks the integer "skeleton" of the digits
 * (easy ≈ 2-digit × 1-digit, medium ≈ 2-digit × 1-digit or small 2 × 2,
 * hard ≈ 2-digit × 2-digit or 3-digit × 1-digit) plus decimal placement.
 */
function multiplication(rng: Rng, difficulty: Difficulty): RawProblem {
  switch (difficulty) {
    case "easy":
      return rng.chance(0.6)
        ? ordered(rng, "dec-mul-1dp-int", randomDecimal(rng, 1, 1.1, 4.9), fromInteger(rng.int(2, 5)))
        : ordered(rng, "dec-mul-tenths-int", randomDecimal(rng, 1, 0.1, 0.9), fromInteger(rng.int(2, 12)));
    case "medium": {
      const roll = rng.next();
      if (roll < 0.4) return ordered(rng, "dec-mul-1dp-hundredths", randomDecimal(rng, 1, 1.1, 9.9), randomDecimal(rng, 2, 0.02, 0.09));
      if (roll < 0.7) return ordered(rng, "dec-mul-1dp-int", randomDecimal(rng, 1, 1.1, 9.9), fromInteger(rng.int(3, 9)));
      // Small 2 × 2 skeleton such as 1.2 × 0.35 (12 × 35) or 2.4 × 1.5 (24 × 15).
      const b = rng.chance(0.5) ? randomDecimal(rng, 2, 0.11, 0.35) : randomDecimal(rng, 1, 1.1, 2.5);
      return ordered(rng, "dec-mul-small-2x2", randomDecimal(rng, 1, 1.1, 2.5), b);
    }
    case "hard": {
      const roll = rng.next();
      if (roll < 0.35) return ordered(rng, "dec-mul-2dp-tenths", randomDecimal(rng, 2, 1.01, 9.99), randomDecimal(rng, 1, 0.2, 0.9));
      if (roll < 0.7) return { variant: "dec-mul-1dp-1dp", operands: [randomDecimal(rng, 1, 2.1, 9.9), randomDecimal(rng, 1, 1.2, 9.9)] };
      return ordered(rng, "dec-mul-2dp-sub1-1dp", randomDecimal(rng, 2, 0.11, 0.99), randomDecimal(rng, 1, 1.1, 9.9));
    }
  }
}

/** dividend ÷ divisor, built from divisor × quotient so the result terminates. */
function quotientProblem(variant: string, divisor: Rational, quotient: Rational): RawProblem {
  return { variant, operands: [mul(divisor, quotient), divisor] };
}

/** Retry until the expression actually shows a decimal (e.g. avoid 2 × 9.5 = 19 ÷ 2). */
function division(rng: Rng, difficulty: Difficulty): RawProblem {
  let candidate = divisionCandidate(rng, difficulty);
  while (candidate.operands.every((operand) => operand.den === 1)) candidate = divisionCandidate(rng, difficulty);
  return candidate;
}

function divisionCandidate(rng: Rng, difficulty: Difficulty): RawProblem {
  switch (difficulty) {
    case "easy":
      return rng.chance(0.5)
        ? quotientProblem("dec-div-by-tenths", randomDecimal(rng, 1, 0.2, 0.9), fromInteger(rng.int(2, 30)))
        : quotientProblem("dec-div-by-int", fromInteger(rng.int(2, 9)), randomDecimal(rng, 1, 1.1, 9.9));
    case "medium":
      return rng.chance(0.5)
        ? quotientProblem("dec-div-by-hundredths", randomDecimal(rng, 2, 0.02, 0.09), fromInteger(rng.int(10, 99)))
        : quotientProblem("dec-div-by-1dp", randomDecimal(rng, 1, 1.1, 9.9), fromInteger(rng.int(3, 12)));
    case "hard": {
      const roll = rng.next();
      if (roll < 0.4) return quotientProblem("dec-div-2dp-to-int", randomDecimal(rng, 2, 0.11, 0.99), fromInteger(rng.int(11, 99)));
      if (roll < 0.8) return quotientProblem("dec-div-1dp-to-1dp", randomDecimal(rng, 1, 1.1, 9.9), randomDecimal(rng, 1, 1.1, 9.9));
      return quotientProblem("dec-div-1dp-to-int", randomDecimal(rng, 1, 1.1, 9.9), fromInteger(rng.int(11, 99)));
    }
  }
}

export function generateDecimalProblem(rng: Rng, operation: Operation, difficulty: Difficulty): RawProblem {
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
