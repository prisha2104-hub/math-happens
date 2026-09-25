import { fromInteger } from "@/lib/math/rational";
import type { Rng } from "../rng";
import type { Difficulty, Operation, RawProblem } from "../types";

/** Integer in [min, max] that is not a multiple of ten (keeps problems meaningful). */
function nonRoundInt(rng: Rng, min: number, max: number): number {
  for (let i = 0; i < 100; i += 1) {
    const value = rng.int(min, max);
    if (value % 10 !== 0) return value;
  }
  return rng.int(min, max) | 1;
}

function problem(variant: string, a: number, b: number): RawProblem {
  return { variant, operands: [fromInteger(a), fromInteger(b)] };
}

const ADDITIVE_RANGES: Record<Difficulty, { a: [number, number]; b: [number, number] }> = {
  easy: { a: [11, 99], b: [11, 99] },
  medium: { a: [100, 999], b: [25, 999] },
  hard: { a: [1000, 9999], b: [100, 9999] },
};

function addition(rng: Rng, difficulty: Difficulty): RawProblem {
  const range = ADDITIVE_RANGES[difficulty];
  return problem(`int-add-${difficulty}`, rng.int(...range.a), rng.int(...range.b));
}

/**
 * Easy and medium subtraction always has a positive result. Hard subtraction
 * keeps the operands in random order a quarter of the time so negative
 * results appear.
 */
function subtraction(rng: Rng, difficulty: Difficulty): RawProblem {
  const range = ADDITIVE_RANGES[difficulty];
  let a = rng.int(...range.a);
  let b = rng.int(...range.b);
  while (a === b) b = rng.int(...range.b);
  const allowNegative = difficulty === "hard" && rng.chance(0.25);
  if (!allowNegative && b > a) [a, b] = [b, a];
  return problem(`int-sub-${difficulty}${a < b ? "-negative" : ""}`, a, b);
}

const TIMES_TABLE = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12];

function multiplication(rng: Rng, difficulty: Difficulty): RawProblem {
  switch (difficulty) {
    case "easy": {
      if (!rng.chance(0.6)) return problem("int-mul-2x1-small", nonRoundInt(rng, 13, 30), rng.int(2, 5));
      // Times-table facts, skipping the trivial corner (2 × 3, 3 × 3, ...).
      for (;;) {
        const a = rng.pick(TIMES_TABLE);
        const b = rng.pick(TIMES_TABLE);
        if (a * b >= 12) return problem("int-mul-times-table", a, b);
      }
    }
    case "medium":
      return rng.chance(0.5)
        ? problem("int-mul-2x1", nonRoundInt(rng, 12, 99), rng.int(3, 9))
        : problem("int-mul-2x2-small", nonRoundInt(rng, 11, 25), nonRoundInt(rng, 11, 25));
    case "hard":
      return rng.chance(0.6)
        ? problem("int-mul-2x2", nonRoundInt(rng, 21, 99), nonRoundInt(rng, 12, 99))
        : problem("int-mul-3x1", nonRoundInt(rng, 101, 999), rng.int(3, 9));
  }
}

/** Division is generated from divisor × quotient so it is always exact. */
function division(rng: Rng, difficulty: Difficulty): RawProblem {
  switch (difficulty) {
    case "easy": {
      // Times-table facts, skipping trivial dividends such as 4 ÷ 2.
      for (;;) {
        const divisor = rng.pick(TIMES_TABLE);
        const dividend = divisor * rng.int(2, 12);
        if (dividend >= 18) return problem("int-div-times-table", dividend, divisor);
      }
    }
    case "medium": {
      const twoDigit = rng.chance(0.5);
      const divisor = twoDigit ? nonRoundInt(rng, 11, 25) : rng.int(3, 9);
      const quotient = rng.int(12, 60);
      return problem(twoDigit ? "int-div-2digit-divisor" : "int-div-1digit-divisor", divisor * quotient, divisor);
    }
    case "hard": {
      if (rng.chance(0.7)) {
        const divisor = nonRoundInt(rng, 11, 40);
        return problem("int-div-2digit-divisor-large", divisor * rng.int(41, 150), divisor);
      }
      // Dividing by 5 is a shortcut, not a hard problem; use 3, 4, 6, 7, 8 or 9.
      const divisor = rng.pick([3, 4, 6, 7, 8, 9]);
      return problem("int-div-1digit-divisor-large", divisor * nonRoundInt(rng, 101, 999), divisor);
    }
  }
}

export function generateIntegerProblem(rng: Rng, operation: Operation, difficulty: Difficulty): RawProblem {
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
