import { buildQuestion, formatOperand } from "@/lib/engine/generate";
import type { Rng } from "@/lib/engine/rng";
import { type TargetSpec, generateTargetedQuestion } from "@/lib/engine/targeted";
import type { NumberType, Question } from "@/lib/engine/types";
import {
  type Rational,
  add,
  div,
  equals,
  fromInteger,
  gcd,
  isInteger,
  isNegative,
  lcm,
  mul,
  rational,
  sub,
  terminatingDecimalPlaces,
  toNumber,
} from "@/lib/math/rational";
import type { Technique, TechniqueCategory } from "./types";

/* ---------- shared helpers ---------- */

const int = (n: number): Rational => fromInteger(n);
const fmt = (value: Rational, numberType: NumberType = "integer"): string => formatOperand(value, numberType);
const fmtInt = (n: number): string => fmt(int(n));
const digitsOf = (n: number): number => String(Math.abs(n)).length;
const isIntegerQuestion = (q: Question, minOperand = 0): boolean =>
  q.numberType === "integer" && q.operands.every((o) => isInteger(o) && Math.abs(o.num) >= minOperand);

/** Round `n` down to its leading place: 114 → 100, 58 → 50. */
function leadingAnchor(n: number): number {
  const place = 10 ** (digitsOf(n) - 1);
  return Math.floor(n / place) * place;
}

/** Nearest multiple of `place` and the signed distance to it. */
function nearestRound(n: number, place: number): { round: number; delta: number } {
  const round = Math.round(n / place) * place;
  return { round, delta: n - round };
}

const SMALL_FACTOR_PAIRS = (b: number): [number, number] | null => {
  let best: [number, number] | null = null;
  for (let f = 2; f * f <= b; f += 1) {
    if (b % f === 0) {
      const g = b / f;
      if (g <= 12 && (!best || Math.max(f, g) < Math.max(best[0], best[1]))) best = [f, g];
    }
  }
  return best;
};

const DIVISION_SHORTCUTS: { divisor: Rational; multiply: number; divideBy: number; note: string }[] = [
  { divisor: int(5), multiply: 2, divideBy: 10, note: "÷5 is ×2 then ÷10" },
  { divisor: int(25), multiply: 4, divideBy: 100, note: "÷25 is ×4 then ÷100" },
  { divisor: int(50), multiply: 2, divideBy: 100, note: "÷50 is ×2 then ÷100" },
  { divisor: rational(1, 2), multiply: 2, divideBy: 1, note: "÷0.5 is ×2" },
  { divisor: rational(1, 4), multiply: 4, divideBy: 1, note: "÷0.25 is ×4" },
  { divisor: rational(1, 5), multiply: 5, divideBy: 1, note: "÷0.2 is ×5" },
  { divisor: rational(1, 8), multiply: 8, divideBy: 1, note: "÷0.125 is ×8" },
  { divisor: rational(5, 2), multiply: 4, divideBy: 10, note: "÷2.5 is ×4 then ÷10" },
  { divisor: rational(25, 2), multiply: 8, divideBy: 100, note: "÷12.5 is ×8 then ÷100" },
];

const FRIENDLY_FRACTIONS: [Rational, string][] = [
  [rational(1, 2), "1/2"],
  [rational(1, 4), "1/4"],
  [rational(3, 4), "3/4"],
  [rational(1, 5), "1/5"],
  [rational(2, 5), "2/5"],
  [rational(3, 5), "3/5"],
  [rational(4, 5), "4/5"],
  [rational(1, 8), "1/8"],
  [rational(3, 2), "3/2"],
  [rational(5, 2), "5/2"],
];

function mantissaAndPlaces(value: Rational): { mantissa: number; places: number } | null {
  const places = terminatingDecimalPlaces(value);
  if (places === null) return null;
  return { mantissa: Math.abs(value.num) * (10 ** places / value.den), places };
}

function technique(t: Technique): Technique {
  return t;
}

/* ---------- DIVISION ---------- */

const divSplitDividend = technique({
  id: "div-split-dividend",
  category: "division",
  title: "Break the dividend into convenient multiples",
  summary: "Peel off a round multiple of the divisor first, then divide what is left. The quotient assembles itself as round part + remainder part.",
  whenUseful: "Two-digit divisors with two- or three-digit quotients, such as 672 ÷ 16 or 2,736 ÷ 24.",
  practice: { numberType: "integer", operation: "division", difficulty: "medium", facet: "int-div-2digit-divisor" },
  example: { operation: "division", numberType: "integer", a: [672, 1], b: [16, 1] },
  applies: (q) => isIntegerQuestion(q) && q.operation === "division" && q.answer.num >= 12 && q.operands[1].num >= 3,
  explain(q) {
    const a = q.operands[0].num;
    const b = q.operands[1].num;
    const quotient = a / b;
    const anchor = leadingAnchor(quotient);
    const part1 = b * anchor;
    const rest = a - part1;
    const part2 = rest / b;
    const result = int(anchor + part2);
    return {
      steps: [
        `${fmtInt(b)} × ${fmtInt(anchor)} = ${fmtInt(part1)}, which fits inside ${fmtInt(a)}.`,
        `${fmtInt(a)} − ${fmtInt(part1)} = ${fmtInt(rest)} is left over.`,
        `${fmtInt(rest)} ÷ ${fmtInt(b)} = ${fmtInt(part2)}.`,
        `${fmtInt(anchor)} + ${fmtInt(part2)} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

const divFactorChain = technique({
  id: "div-factor-chain",
  category: "division",
  title: "Divide by the factors one at a time",
  summary: "Split a composite divisor into two small factors and divide by each in turn. Two easy divisions replace one awkward one.",
  whenUseful: "Divisors like 12, 15, 16, 18, 24, 25, 35 or 36 whose factors are all in the times tables.",
  practice: { numberType: "integer", operation: "division", difficulty: "hard", facet: "int-div-2digit-divisor-large" },
  example: { operation: "division", numberType: "integer", a: [2736, 1], b: [24, 1] },
  applies: (q) => isIntegerQuestion(q) && q.operation === "division" && q.operands[1].num >= 12 && SMALL_FACTOR_PAIRS(q.operands[1].num) !== null,
  explain(q) {
    const a = q.operands[0].num;
    const b = q.operands[1].num;
    const pair = SMALL_FACTOR_PAIRS(b);
    if (!pair) return null;
    const [f1, f2] = pair;
    const mid = a / f1;
    const result = int(mid / f2);
    return {
      steps: [`${fmtInt(b)} = ${f1} × ${f2}.`, `${fmtInt(a)} ÷ ${f1} = ${fmtInt(mid)}.`, `${fmtInt(mid)} ÷ ${f2} = ${fmt(result)}.`],
      result,
    };
  },
});

const divNearbyMultiple = technique({
  id: "div-nearby-multiple",
  category: "division",
  title: "Overshoot to a round multiple, then step back",
  summary: "When the quotient is just under a round number, take the divisor times that round number and subtract the small overshoot.",
  whenUseful: "Quotients like 58, 97 or 118 that sit a few steps below a multiple of ten.",
  practice: { numberType: "integer", operation: "division", difficulty: "medium", facet: "int-div-2digit-divisor" },
  example: { operation: "division", numberType: "integer", a: [1102, 1], b: [19, 1] },
  applies(q) {
    if (!isIntegerQuestion(q) || q.operation !== "division") return false;
    const quotient = q.answer.num;
    if (quotient < 12 || quotient % 10 === 0) return false;
    const over = Math.ceil(quotient / 10) * 10 - quotient;
    return over >= 1 && over <= 4;
  },
  explain(q) {
    const a = q.operands[0].num;
    const b = q.operands[1].num;
    const quotient = a / b;
    const anchor = Math.ceil(quotient / 10) * 10;
    const big = b * anchor;
    const over = big - a;
    const back = over / b;
    const result = int(anchor - back);
    return {
      steps: [
        `${fmtInt(b)} × ${fmtInt(anchor)} = ${fmtInt(big)}, a little more than ${fmtInt(a)}.`,
        `${fmtInt(big)} − ${fmtInt(a)} = ${fmtInt(over)} too much.`,
        `${fmtInt(over)} ÷ ${fmtInt(b)} = ${fmtInt(back)}, so step back ${fmtInt(back)}.`,
        `${fmtInt(anchor)} − ${fmtInt(back)} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

const divScaleDecimals = technique({
  id: "div-scale-decimals",
  category: "division",
  title: "Scale both numbers to clear the decimal divisor",
  summary: "Multiplying dividend and divisor by the same power of ten leaves the quotient unchanged, so shift both until the divisor is a whole number.",
  whenUseful: "Any division by a decimal: 7.2 ÷ 0.3 becomes 72 ÷ 3, and 4.8 ÷ 0.06 becomes 480 ÷ 6.",
  practice: { numberType: "decimal", operation: "division", difficulty: "medium" },
  example: { operation: "division", numberType: "decimal", a: [48, 10], b: [6, 100] },
  applies: (q) => q.numberType === "decimal" && q.operation === "division" && !isInteger(q.operands[1]),
  explain(q) {
    const [a, b] = q.operands;
    const places = terminatingDecimalPlaces(b);
    if (places === null || places === 0) return null;
    const scale = int(10 ** places);
    const a2 = mul(a, scale);
    const b2 = mul(b, scale);
    const result = div(a2, b2);
    return {
      steps: [
        `Multiply both by ${fmt(scale)} to make the divisor whole: ${fmt(a, "decimal")} ÷ ${fmt(b, "decimal")} = ${fmt(a2, "decimal")} ÷ ${fmt(b2, "decimal")}.`,
        `${fmt(a2, "decimal")} ÷ ${fmt(b2, "decimal")} = ${fmt(result, "decimal")}.`,
      ],
      result,
    };
  },
});

const divPatterns = technique({
  id: "div-patterns",
  category: "division",
  title: "Recognise divisors with a multiplication shortcut",
  summary: "Some divisors are really multiplications in disguise: ÷5 is ×2 ÷10, ÷25 is ×4 ÷100, ÷0.5 is ×2, ÷0.25 is ×4, ÷2.5 is ×4 ÷10.",
  whenUseful: "Divisors of 5, 25, 50, 0.5, 0.25, 0.2, 0.125, 2.5 and 12.5.",
  practice: { numberType: "decimal", operation: "division", difficulty: "easy", facet: "dec-div-by-tenths" },
  example: { operation: "division", numberType: "integer", a: [1375, 1], b: [25, 1] },
  applies: (q) => q.operation === "division" && DIVISION_SHORTCUTS.some((s) => equals(s.divisor, q.operands[1])),
  explain(q) {
    const [a, b] = q.operands;
    const shortcut = DIVISION_SHORTCUTS.find((s) => equals(s.divisor, b));
    if (!shortcut) return null;
    const scaled = mul(a, int(shortcut.multiply));
    const result = div(scaled, int(shortcut.divideBy));
    const type = q.numberType;
    const steps = [`${shortcut.note}, because ${fmt(b, type)} = ${shortcut.divideBy}/${shortcut.multiply}.`, `${fmt(a, type)} × ${shortcut.multiply} = ${fmt(scaled, type)}.`];
    if (shortcut.divideBy !== 1) steps.push(`${fmt(scaled, type)} ÷ ${shortcut.divideBy} = ${fmt(result, type)}.`);
    return { steps, result };
  },
});

/* ---------- MULTIPLICATION ---------- */

function splitByPlace(n: number): number[] {
  const parts: number[] = [];
  const text = String(n);
  for (let i = 0; i < text.length; i += 1) {
    const digit = Number(text[i]);
    if (digit !== 0) parts.push(digit * 10 ** (text.length - 1 - i));
  }
  return parts;
}

const mulDistributive = technique({
  id: "mul-distributive",
  category: "multiplication",
  title: "Split one factor by place value",
  summary: "Break a factor into tens and ones (or hundreds, tens, ones), multiply each piece, then add the partial products.",
  whenUseful: "Two-digit and three-digit factors, such as 47 × 68 or 297 × 7, when neither factor is close to a round number.",
  practice: { numberType: "integer", operation: "multiplication", difficulty: "hard", facet: "int-mul-2x2" },
  example: { operation: "multiplication", numberType: "integer", a: [47, 1], b: [68, 1] },
  applies: (q) => isIntegerQuestion(q) && q.operation === "multiplication" && q.operands.some((o) => o.num >= 11 && o.num % 10 !== 0),
  explain(q) {
    const [x, y] = q.operands.map((o) => o.num) as [number, number];
    // Split the factor with more digits; keep the other whole.
    const [keep, split] = digitsOf(y) >= digitsOf(x) ? [x, y] : [y, x];
    const parts = splitByPlace(split);
    const partials = parts.map((p) => keep * p);
    const result = int(partials.reduce((s, p) => s + p, 0));
    return {
      steps: [
        `${fmtInt(split)} = ${parts.map(fmtInt).join(" + ")}.`,
        ...parts.map((p, i) => `${fmtInt(keep)} × ${fmtInt(p)} = ${fmtInt(partials[i] as number)}.`),
        `${partials.map(fmtInt).join(" + ")} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

function compensationCandidate(value: Rational): { round: Rational; delta: Rational } | null {
  if (isInteger(value)) {
    const n = Math.abs(value.num);
    if (n < 11) return null;
    const place = n >= 100 ? 100 : 10;
    const { round, delta } = nearestRound(n, place);
    if (delta === 0 || Math.abs(delta) > 3 || round === 0) return null;
    return { round: int(round), delta: int(delta) };
  }
  // Decimals: within 0.3 of a whole number, e.g. 3.9 → 4 − 0.1.
  const nearest = Math.round(toNumber(value));
  if (nearest === 0) return null;
  const delta = sub(value, int(nearest));
  const magnitude = Math.abs(toNumber(delta));
  return magnitude > 0 && magnitude <= 0.3 ? { round: int(nearest), delta } : null;
}

const mulCompensation = technique({
  id: "mul-compensation",
  category: "multiplication",
  title: "Round a factor, multiply, then correct",
  summary: "Multiply by the nearby round number instead, then subtract (or add) the small multiple you over- or under-counted.",
  whenUseful: "A factor ending in 7, 8, 9, 1, 2 or 3 — 47 × 68 becomes 47 × 70 − 47 × 2 — and decimals like 3.9 × 6.",
  practice: { numberType: "integer", operation: "multiplication", difficulty: "medium", facet: "int-mul-2x1" },
  example: { operation: "multiplication", numberType: "integer", a: [47, 1], b: [68, 1] },
  applies: (q) => q.operation === "multiplication" && q.numberType !== "fraction" && q.operands.some((o) => compensationCandidate(o) !== null),
  explain(q) {
    const type = q.numberType;
    const index = q.operands.findIndex((o) => compensationCandidate(o) !== null);
    if (index < 0) return null;
    const factor = q.operands[index] as Rational;
    const other = q.operands[1 - index] as Rational;
    const { round, delta } = compensationCandidate(factor)!;
    const big = mul(other, round);
    const correction = mul(other, delta);
    const result = add(big, correction);
    const absDelta = isNegative(delta) ? mul(delta, int(-1)) : delta;
    const absCorrection = isNegative(correction) ? mul(correction, int(-1)) : correction;
    return {
      steps: [
        `${fmt(factor, type)} = ${fmt(round, type)} ${isNegative(delta) ? "−" : "+"} ${fmt(absDelta, type)}.`,
        `${fmt(other, type)} × ${fmt(round, type)} = ${fmt(big, type)}.`,
        `${fmt(other, type)} × ${fmt(absDelta, type)} = ${fmt(absCorrection, type)}.`,
        `${fmt(big, type)} ${isNegative(delta) ? "−" : "+"} ${fmt(absCorrection, type)} = ${fmt(result, type)}.`,
      ],
      result,
    };
  },
});

function squaresCandidate(q: Question): { mid: number; d: number } | null {
  if (!isIntegerQuestion(q) || q.operation !== "multiplication") return null;
  const [x, y] = q.operands.map((o) => o.num) as [number, number];
  if ((x + y) % 2 !== 0) return null;
  const mid = (x + y) / 2;
  const d = Math.abs(x - y) / 2;
  return mid % 5 === 0 && mid >= 10 && d >= 1 && d <= 6 ? { mid, d } : null;
}

const mulDifferenceOfSquares = technique({
  id: "mul-difference-of-squares",
  category: "multiplication",
  title: "Use the difference of squares",
  summary: "Two numbers the same distance either side of a round midpoint multiply to midpoint² − distance²: 47 × 53 = 50² − 3².",
  whenUseful: "Factors whose average is a multiple of 5 and whose gap is small: 18 × 22, 24 × 26, 47 × 53, 95 × 105.",
  practice: { numberType: "integer", operation: "multiplication", difficulty: "hard", facet: "int-mul-2x2" },
  example: { operation: "multiplication", numberType: "integer", a: [47, 1], b: [53, 1] },
  applies: (q) => squaresCandidate(q) !== null,
  explain(q) {
    const candidate = squaresCandidate(q);
    if (!candidate) return null;
    const { mid, d } = candidate;
    const [x, y] = q.operands.map((o) => o.num) as [number, number];
    const result = int(mid * mid - d * d);
    return {
      steps: [
        `${fmtInt(x)} and ${fmtInt(y)} sit ${d} either side of ${fmtInt(mid)}.`,
        `${fmtInt(mid)}² = ${fmtInt(mid * mid)} and ${d}² = ${d * d}.`,
        `${fmtInt(mid * mid)} − ${d * d} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

const mulFractionCrossCancel = technique({
  id: "mul-fraction-cross-cancel",
  category: "multiplication",
  title: "Cross-cancel before multiplying fractions",
  summary: "Divide a numerator and the opposite denominator by their common factor first. Smaller numbers go in, and the answer comes out already simplified.",
  whenUseful: "Fraction products where a numerator shares a factor with the other denominator: 5/8 × 4/7 → 5/2 × 1/7.",
  practice: { numberType: "fraction", operation: "multiplication", difficulty: "medium", feature: "cross-cancel" },
  example: { operation: "multiplication", numberType: "fraction", a: [5, 8], b: [4, 7] },
  applies: (q) => q.numberType === "fraction" && q.operation === "multiplication" && q.meta.crossCancel === true,
  explain(q) {
    const [x, y] = q.operands;
    const g1 = gcd(x.num, y.den);
    const g2 = gcd(y.num, x.den);
    const n1 = x.num / g1;
    const d2 = y.den / g1;
    const n2 = y.num / g2;
    const d1 = x.den / g2;
    const result = rational(n1 * n2, d1 * d2);
    const steps: string[] = [];
    if (g1 > 1) steps.push(`${x.num} and ${y.den} share a factor of ${g1}: they become ${n1} and ${d2}.`);
    if (g2 > 1) steps.push(`${y.num} and ${x.den} share a factor of ${g2}: they become ${n2} and ${d1}.`);
    // Everything shared has been cancelled, so the product is already in lowest terms.
    steps.push(`Now multiply: ${n1}/${d1} × ${n2}/${d2} = ${fmt(result, "fraction")}.`);
    return { steps, result };
  },
});

const mulDecimalPlacement = technique({
  id: "mul-decimal-placement",
  category: "multiplication",
  title: "Multiply the digits, then place the decimal point",
  summary: "Ignore the decimal points, multiply as whole numbers, then count the total decimal places in both factors and put the point back.",
  whenUseful: "Every decimal product: 2.4 × 0.35 is 24 × 35 = 840 with three decimal places, so 0.840 = 0.84.",
  practice: { numberType: "decimal", operation: "multiplication", difficulty: "medium" },
  example: { operation: "multiplication", numberType: "decimal", a: [24, 10], b: [35, 100] },
  applies: (q) => q.numberType === "decimal" && q.operation === "multiplication" && q.operands.some((o) => !isInteger(o)),
  explain(q) {
    const [a, b] = q.operands;
    const ma = mantissaAndPlaces(a);
    const mb = mantissaAndPlaces(b);
    if (!ma || !mb) return null;
    const product = ma.mantissa * mb.mantissa;
    const places = ma.places + mb.places;
    const result = rational(product, 10 ** places);
    return {
      steps: [
        `Ignore the points: ${fmtInt(ma.mantissa)} × ${fmtInt(mb.mantissa)} = ${fmtInt(product)}.`,
        `Count decimal places: ${ma.places} + ${mb.places} = ${places}.`,
        `Put the point ${places} place${places === 1 ? "" : "s"} from the right: ${fmt(result, "decimal")}.`,
      ],
      result,
    };
  },
});

/* ---------- ADDITION AND SUBTRACTION ---------- */

function additiveCompensation(value: Rational): { round: Rational; delta: Rational } | null {
  if (isInteger(value)) {
    const n = Math.abs(value.num);
    if (n < 10) return null;
    // Prefer the largest place that is within reach: 1,998 → 2,000; 4,879 → 4,880.
    for (let place = 10 ** (digitsOf(n) - 1); place >= 10; place /= 10) {
      const { round, delta } = nearestRound(n, place);
      const limit = place >= 100 ? 5 : 3;
      if (delta !== 0 && Math.abs(delta) <= limit && round > 0) return { round: int(round), delta: int(delta) };
    }
    return null;
  }
  const nearest = Math.round(toNumber(value));
  if (nearest === 0) return null;
  const delta = sub(value, int(nearest));
  const magnitude = Math.abs(toNumber(delta));
  return magnitude > 0 && magnitude <= 0.3 ? { round: int(nearest), delta } : null;
}

const addCompensation = technique({
  id: "add-compensation",
  category: "addition-subtraction",
  title: "Round, calculate, then compensate",
  summary: "Replace a number that is nearly round with the round number, do the easy sum, then adjust by the small difference.",
  whenUseful: "Numbers ending in 7, 8, 9 or 1, 2, 3, and decimals like 4.9: 47 + 38 = 47 + 40 − 2, and 5,299 − 1,998 = 5,299 − 2,000 + 2.",
  practice: { numberType: "integer", operation: "subtraction", difficulty: "hard" },
  example: { operation: "subtraction", numberType: "integer", a: [5299, 1], b: [1998, 1] },
  applies: (q) => (q.operation === "addition" || q.operation === "subtraction") && q.numberType !== "fraction" && additiveCompensation(q.operands[1]) !== null,
  explain(q) {
    const type = q.numberType;
    const [a, b] = q.operands;
    const candidate = additiveCompensation(b);
    if (!candidate) return null;
    const { round, delta } = candidate;
    const absDelta = isNegative(delta) ? mul(delta, int(-1)) : delta;
    const subtraction = q.operation === "subtraction";
    const rough = subtraction ? sub(a, round) : add(a, round);
    // a + (round + delta) = rough + delta; a − (round + delta) = rough − delta.
    const result = subtraction ? sub(rough, delta) : add(rough, delta);
    const finalSign = subtraction === isNegative(delta) ? "+" : "−";
    return {
      steps: [
        `${fmt(b, type)} = ${fmt(round, type)} ${isNegative(delta) ? "−" : "+"} ${fmt(absDelta, type)}.`,
        `${fmt(a, type)} ${subtraction ? "−" : "+"} ${fmt(round, type)} = ${fmt(rough, type)}.`,
        `Compensate: ${fmt(rough, type)} ${finalSign} ${fmt(absDelta, type)} = ${fmt(result, type)}.`,
      ],
      result,
    };
  },
});

function makeRoundCandidate(q: Question): { a: Rational; b: Rational; move: Rational; unit: Rational } | null {
  if (q.operation !== "addition" || q.numberType === "fraction") return null;
  const [a, b] = q.operands;
  const places = Math.max(terminatingDecimalPlaces(a) ?? 0, terminatingDecimalPlaces(b) ?? 0);
  if (places > 1) return null;
  // Work in units of the finest place (ones, or tenths): how far is `a` from the next multiple of ten units?
  const unit = places === 0 ? int(1) : rational(1, 10);
  const scaledA = Math.abs(a.num) * (places === 0 ? 1 : 10 / a.den);
  const remainder = scaledA % 10;
  if (remainder < 5) return null;
  const move = mul(unit, int(10 - remainder));
  const leftover = sub(b, move);
  if (isNegative(leftover) || leftover.num === 0) return null;
  return { a, b, move, unit };
}

const addMakeRound = technique({
  id: "add-make-round",
  category: "addition-subtraction",
  title: "Make a round number first",
  summary: "Move just enough from one number to the other so the first becomes a multiple of ten; the rest of the addition is then trivial.",
  whenUseful: "Sums where one number ends in 5–9, e.g. 47 + 38 → 50 + 35, or 8.3 + 4.8 → 9 + 4.1.",
  practice: { numberType: "integer", operation: "addition", difficulty: "easy" },
  example: { operation: "addition", numberType: "integer", a: [47, 1], b: [38, 1] },
  applies: (q) => makeRoundCandidate(q) !== null,
  explain(q) {
    const candidate = makeRoundCandidate(q);
    if (!candidate) return null;
    const type = q.numberType;
    const { a, b, move } = candidate;
    const rounded = add(a, move);
    const rest = sub(b, move);
    const result = add(rounded, rest);
    return {
      steps: [
        `Move ${fmt(move, type)} across: ${fmt(a, type)} + ${fmt(move, type)} = ${fmt(rounded, type)}.`,
        `${fmt(b, type)} − ${fmt(move, type)} = ${fmt(rest, type)}.`,
        `${fmt(rounded, type)} + ${fmt(rest, type)} = ${fmt(result, type)}.`,
      ],
      result,
    };
  },
});

const addLeftToRight = technique({
  id: "add-left-to-right",
  category: "addition-subtraction",
  title: "Add the big parts first, then the small parts",
  summary: "Split each number into its hundreds-and-up and its last two digits. Add the large parts, add the small parts, then combine — carries stop piling up.",
  whenUseful: "Three- and four-digit sums such as 2,736 + 4,879.",
  practice: { numberType: "integer", operation: "addition", difficulty: "hard" },
  example: { operation: "addition", numberType: "integer", a: [2736, 1], b: [4879, 1] },
  applies: (q) => isIntegerQuestion(q, 100) && q.operation === "addition",
  explain(q) {
    const [x, y] = q.operands.map((o) => o.num) as [number, number];
    const xh = Math.floor(x / 100) * 100;
    const yh = Math.floor(y / 100) * 100;
    const xl = x - xh;
    const yl = y - yh;
    const high = xh + yh;
    const low = xl + yl;
    const result = int(high + low);
    return {
      steps: [
        `${fmtInt(x)} = ${fmtInt(xh)} + ${xl}, and ${fmtInt(y)} = ${fmtInt(yh)} + ${yl}.`,
        `${fmtInt(xh)} + ${fmtInt(yh)} = ${fmtInt(high)}.`,
        `${xl} + ${yl} = ${fmtInt(low)}.`,
        `${fmtInt(high)} + ${fmtInt(low)} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

const subCountUp = technique({
  id: "sub-count-up",
  category: "addition-subtraction",
  title: "Count up from the smaller number",
  summary: "Instead of borrowing, jump from the number being subtracted up to the next round number, then to the round number below the larger one, then to the larger one. Add the jumps.",
  whenUseful: "Subtractions that would need several borrows, such as 5,299 − 1,989 or 72 − 38.",
  practice: { numberType: "integer", operation: "subtraction", difficulty: "medium", feature: "borrow" },
  example: { operation: "subtraction", numberType: "integer", a: [5299, 1], b: [1989, 1] },
  applies: (q) => isIntegerQuestion(q, 10) && q.operation === "subtraction" && q.answer.num > 0 && (q.meta.carries ?? 0) > 0,
  explain(q) {
    const [x, y] = q.operands.map((o) => o.num) as [number, number];
    const place = 10 ** (digitsOf(y) - 1);
    const firstStop = Math.min(Math.ceil(y / place) * place, x);
    const secondStop = Math.max(Math.floor(x / place) * place, firstStop);
    const jumps: [number, number][] = [];
    if (firstStop > y) jumps.push([y, firstStop]);
    if (secondStop > firstStop) jumps.push([firstStop, secondStop]);
    if (x > secondStop) jumps.push([secondStop, x]);
    const total = jumps.reduce((s, [from, to]) => s + (to - from), 0);
    const result = int(total);
    return {
      steps: [
        ...jumps.map(([from, to]) => `${fmtInt(from)} → ${fmtInt(to)} is +${fmtInt(to - from)}.`),
        `Add the jumps: ${jumps.map(([from, to]) => fmtInt(to - from)).join(" + ")} = ${fmt(result)}.`,
      ],
      result,
    };
  },
});

const decAlignPlaces = technique({
  id: "dec-align-places",
  category: "addition-subtraction",
  title: "Line up the decimal places, then work in whole numbers",
  summary: "Give both numbers the same number of decimal places, add or subtract the digits as whole numbers, and restore the point at the end.",
  whenUseful: "Mixed places such as 2.4 + 3.75, where misaligned columns cause most slips.",
  practice: { numberType: "decimal", operation: "addition", difficulty: "medium", feature: "mixed-decimal-places" },
  example: { operation: "addition", numberType: "decimal", a: [24, 10], b: [375, 100] },
  applies: (q) => q.numberType === "decimal" && (q.operation === "addition" || q.operation === "subtraction") && q.meta.decimalPlaces[0] !== q.meta.decimalPlaces[1],
  explain(q) {
    const [a, b] = q.operands;
    const places = Math.max(terminatingDecimalPlaces(a) ?? 0, terminatingDecimalPlaces(b) ?? 0);
    const scale = 10 ** places;
    const ma = a.num * (scale / a.den);
    const mb = b.num * (scale / b.den);
    const subtraction = q.operation === "subtraction";
    const m = subtraction ? ma - mb : ma + mb;
    const result = rational(m, scale);
    const pad = (n: number) => (n / scale).toFixed(places);
    return {
      steps: [
        `Write both with ${places} decimal places: ${pad(ma)} and ${pad(mb)}.`,
        `Work with the digits: ${fmtInt(ma)} ${subtraction ? "−" : "+"} ${fmtInt(mb)} = ${fmtInt(m)}.`,
        `Restore ${places} decimal places: ${fmt(result, "decimal")}.`,
      ],
      result,
    };
  },
});

/* ---------- FRACTIONS ---------- */

const fracCommonDenominator = technique({
  id: "frac-common-denominator",
  category: "fractions",
  title: "Rewrite over the lowest common denominator",
  summary: "Find the smallest number both denominators divide into, scale each fraction to it, then add or subtract the numerators only.",
  whenUseful: "Adding or subtracting fractions with unlike denominators: 3/4 − 1/6 → 9/12 − 2/12.",
  practice: { numberType: "fraction", operation: "subtraction", difficulty: "medium", feature: "unlike-denominators" },
  example: { operation: "subtraction", numberType: "fraction", a: [3, 4], b: [1, 6] },
  applies: (q) => q.numberType === "fraction" && (q.operation === "addition" || q.operation === "subtraction") && q.operands[0].den !== q.operands[1].den,
  explain(q) {
    const [x, y] = q.operands;
    const L = lcm(x.den, y.den);
    const n1 = x.num * (L / x.den);
    const n2 = y.num * (L / y.den);
    const subtraction = q.operation === "subtraction";
    const n = subtraction ? n1 - n2 : n1 + n2;
    const result = rational(n, L);
    const simplified = result.den !== L || result.num !== n;
    return {
      steps: [
        `Lowest common denominator of ${x.den} and ${y.den} is ${L}.`,
        `${fmt(x, "fraction")} = ${n1}/${L} and ${fmt(y, "fraction")} = ${n2}/${L}.`,
        `${n1} ${subtraction ? "−" : "+"} ${n2} = ${n}, so the answer is ${n}/${L}${simplified ? ` = ${fmt(result, "fraction")}` : ""}.`,
      ],
      result,
    };
  },
});

const fracReciprocal = technique({
  id: "frac-reciprocal",
  category: "fractions",
  title: "Divide by multiplying with the reciprocal",
  summary: "Dividing by a fraction is the same as multiplying by it flipped upside down.",
  whenUseful: "Every fraction division: 3/4 ÷ 2/5 = 3/4 × 5/2 = 15/8.",
  practice: { numberType: "fraction", operation: "division", difficulty: "medium" },
  example: { operation: "division", numberType: "fraction", a: [3, 4], b: [2, 5] },
  applies: (q) => q.numberType === "fraction" && q.operation === "division",
  explain(q) {
    const [x, y] = q.operands;
    const n = x.num * y.den;
    const d = x.den * y.num;
    const result = rational(n, d);
    const simplified = result.num !== n || result.den !== d;
    return {
      steps: [
        `Flip the divisor: ${fmt(x, "fraction")} ÷ ${fmt(y, "fraction")} = ${fmt(x, "fraction")} × ${y.den}/${y.num}.`,
        `Multiply across: ${x.num} × ${y.den} = ${n} over ${x.den} × ${y.num} = ${d}.`,
        `${n}/${d}${simplified ? ` simplifies to ${fmt(result, "fraction")}` : " is already in lowest terms"}.`,
      ],
      result,
    };
  },
});

const fracSimplifyFirst = technique({
  id: "frac-simplify-first",
  category: "fractions",
  title: "Simplify before you calculate",
  summary: "After flipping the divisor, cancel common factors across the two fractions before multiplying, so the numbers stay small.",
  whenUseful: "Fraction divisions where numerators share a factor, or denominators do: 5/6 ÷ 5/9 → 5/6 × 9/5 → 1/6 × 9/1 → 9/6 → 3/2.",
  practice: { numberType: "fraction", operation: "division", difficulty: "hard", feature: "cross-cancel" },
  example: { operation: "division", numberType: "fraction", a: [5, 6], b: [5, 9] },
  applies: (q) => q.numberType === "fraction" && q.operation === "division" && q.meta.crossCancel === true,
  explain(q) {
    const [x, y] = q.operands;
    // After inversion the product is (x.num × y.den) / (x.den × y.num); cancel x.num with y.num and x.den with y.den.
    const g1 = gcd(x.num, y.num);
    const g2 = gcd(x.den, y.den);
    const n1 = x.num / g1;
    const n2 = y.num / g1;
    const d1 = x.den / g2;
    const d2 = y.den / g2;
    const result = rational(n1 * d2, d1 * n2);
    const steps = [`Flip the divisor: ${fmt(x, "fraction")} × ${y.den}/${y.num}.`];
    if (g1 > 1) steps.push(`${x.num} and ${y.num} share ${g1}: they become ${n1} and ${n2}.`);
    if (g2 > 1) steps.push(`${x.den} and ${y.den} share ${g2}: they become ${d1} and ${d2}.`);
    steps.push(`Multiply what is left: ${n1}/${d1} × ${d2}/${n2} = ${fmt(result, "fraction")}.`);
    return { steps, result };
  },
});

const fracDecimalEquivalents = technique({
  id: "frac-decimal-equivalents",
  category: "fractions",
  title: "Swap a decimal for its fraction",
  summary: "Familiar decimals are simple fractions: 0.25 = 1/4, 0.75 = 3/4, 0.2 = 1/5, 0.125 = 1/8, 2.5 = 5/2. Multiplying by 0.25 is dividing by 4.",
  whenUseful: "Decimal products and quotients involving 0.5, 0.25, 0.75, 0.2, 0.4, 0.6, 0.8, 0.125, 1.5 or 2.5.",
  practice: { numberType: "decimal", operation: "multiplication", difficulty: "easy" },
  example: { operation: "multiplication", numberType: "decimal", a: [375, 100], b: [4, 10] },
  applies: (q) => q.numberType === "decimal" && (q.operation === "multiplication" || q.operation === "division") && FRIENDLY_FRACTIONS.some(([f]) => equals(f, q.operands[1])),
  explain(q) {
    const [a, b] = q.operands;
    const match = FRIENDLY_FRACTIONS.find(([f]) => equals(f, b));
    if (!match) return null;
    const [f, label] = match;
    const multiplication = q.operation === "multiplication";
    const numerator = multiplication ? f.num : f.den;
    const denominator = multiplication ? f.den : f.num;
    const scaled = mul(a, int(numerator));
    const result = div(scaled, int(denominator));
    const steps = [`${fmt(b, "decimal")} = ${label}, so ${multiplication ? "multiplying" : "dividing"} by it is ×${numerator} then ÷${denominator}.`];
    if (numerator !== 1) steps.push(`${fmt(a, "decimal")} × ${numerator} = ${fmt(scaled, "decimal")}.`);
    if (denominator !== 1) steps.push(`${fmt(scaled, "decimal")} ÷ ${denominator} = ${fmt(result, "decimal")}.`);
    if (numerator === 1 && denominator === 1) steps.push(`${fmt(a, "decimal")} stays ${fmt(result, "decimal")}.`);
    return { steps, result };
  },
});

/* ---------- registry ---------- */

export const TECHNIQUES: Technique[] = [
  divSplitDividend,
  divFactorChain,
  divNearbyMultiple,
  divScaleDecimals,
  divPatterns,
  mulDistributive,
  mulCompensation,
  mulDifferenceOfSquares,
  mulFractionCrossCancel,
  mulDecimalPlacement,
  addCompensation,
  addMakeRound,
  addLeftToRight,
  subCountUp,
  decAlignPlaces,
  fracCommonDenominator,
  fracReciprocal,
  fracSimplifyFirst,
  fracDecimalEquivalents,
];

export function techniqueById(id: string): Technique | null {
  return TECHNIQUES.find((t) => t.id === id) ?? null;
}

export function techniquesByCategory(category: TechniqueCategory): Technique[] {
  return TECHNIQUES.filter((t) => t.category === category);
}

/** Techniques that make this question easier, most specific first (registry order). */
export function techniquesFor(question: Question): Technique[] {
  // The library is about column arithmetic; finance word problems carry their
  // own worked explanation instead, so none of these are offered for them.
  if (question.operation === "finance") return [];
  return TECHNIQUES.filter((t) => t.applies(question));
}

/** The library's standing worked example for a technique, as a real Question. */
export function exampleQuestion(t: Technique): Question {
  const { operation, numberType, a, b } = t.example;
  return buildQuestion(`example:${t.id}`, { variant: "example", operands: [rational(...a), rational(...b)] }, operation, numberType, "medium");
}

/**
 * Fresh practice question for a technique: sample the technique's skill and
 * keep the first question it applies to; fall back to any question of the
 * skill if the technique's pattern is rare there.
 */
export function generateTechniqueQuestion(t: Technique, rng: Rng, id: string, recentKeys: readonly string[] = []): Question {
  const target: TargetSpec = { ...t.practice, facet: t.practice.facet ?? null, feature: t.practice.feature ?? null };
  let last: Question | null = null;
  for (let i = 0; i < 60; i += 1) {
    last = generateTargetedQuestion({ target, rng, id, recentKeys, triesPerTier: 10 });
    if (t.applies(last)) return last;
  }
  return last ?? generateTargetedQuestion({ target, rng, id, recentKeys });
}
