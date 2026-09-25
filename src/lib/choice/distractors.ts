import type { Operation, Question } from "@/lib/engine/types";
import {
  type Rational,
  abs,
  add,
  div,
  equals,
  fromInteger,
  isInteger,
  isNegative,
  isZero,
  lcm,
  mul,
  neg,
  rational,
  sub,
  terminatingDecimalPlaces,
  toNumber,
} from "@/lib/math/rational";
import type { Distractor, ErrorTag } from "./types";

/* ---------- small exact helpers ---------- */

function pow10(k: number): Rational {
  return k >= 0 ? fromInteger(10 ** k) : rational(1, 10 ** -k);
}

/** value × 10^k */
export function shiftDecimal(value: Rational, k: number): Rational {
  return mul(value, pow10(k));
}

/** Smallest place value used by a terminating decimal (1 for integers, 0.01 for 6.15). */
export function placeUnit(value: Rational): Rational | null {
  const places = terminatingDecimalPlaces(value);
  return places === null ? null : pow10(-places);
}

function digitsOf(n: number): number[] {
  const out: number[] = [];
  let x = Math.abs(n);
  do {
    out.push(x % 10);
    x = Math.floor(x / 10);
  } while (x > 0);
  return out;
}

function fromDigits(digits: number[]): number {
  return digits.reduce((acc, d, i) => acc + d * 10 ** i, 0);
}

/** Column-wise sum with every carry dropped: 47 + 38 → 75. */
export function addWithoutCarry(a: number, b: number): number {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const len = Math.max(da.length, db.length);
  return fromDigits(Array.from({ length: len }, (_, i) => ((da[i] ?? 0) + (db[i] ?? 0)) % 10));
}

/** Column-wise difference ignoring borrows (smaller digit taken from larger): 72 − 38 → 46. */
export function subWithoutBorrow(a: number, b: number): number {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const len = Math.max(da.length, db.length);
  return fromDigits(Array.from({ length: len }, (_, i) => Math.abs((da[i] ?? 0) - (db[i] ?? 0))));
}

/** Integer scaling factor that turns both terminating decimals into integers. */
function commonScale(a: Rational, b: Rational): number | null {
  const pa = terminatingDecimalPlaces(a);
  const pb = terminatingDecimalPlaces(b);
  if (pa === null || pb === null) return null;
  return 10 ** Math.max(pa, pb);
}

/** The integer you get by deleting the decimal point: 3.75 → 375. */
function mantissa(value: Rational): number | null {
  const places = terminatingDecimalPlaces(value);
  return places === null ? null : Math.abs(value.num) * (10 ** places / value.den);
}

function roundToPlace(n: number, place: number): number {
  return Math.round(n / place) * place;
}

/* ---------- candidate strategies ---------- */

type Emit = (value: Rational | null, tag: ErrorTag) => void;

/**
 * Results of misreading the operator. Only the operation's sibling is
 * plausible (+ for −, × for ÷ and vice versa); nobody multiplies 212 by 857
 * when asked to add them. Small operands also invite mixing up × and +.
 */
function otherOperations(operation: Operation, a: Rational, b: Rational, emit: Emit, options: { allowAdditive?: boolean } = {}): void {
  switch (operation) {
    case "addition":
      emit(abs(sub(a, b)), "incorrect-operation");
      break;
    case "subtraction":
      emit(add(a, b), "incorrect-operation");
      break;
    case "multiplication":
      if (options.allowAdditive) emit(add(a, b), "incorrect-operation");
      break;
    case "division":
      emit(abs(sub(a, b)), "incorrect-operation");
      if (options.allowAdditive) emit(mul(a, b), "incorrect-operation");
      break;
  }
}

function fractionSlipCandidates(answer: Rational, emit: Emit): void {
  // Nudge the numerator or the denominator by one, keeping the other.
  emit(rational(answer.num + 1, answer.den), "arithmetic-slip");
  emit(rational(answer.num - 1, answer.den), "arithmetic-slip");
  emit(rational(answer.num, answer.den + 1), "arithmetic-slip");
  if (answer.den > 2) emit(rational(answer.num, answer.den - 1), "arithmetic-slip");
}

function slipCandidates(answer: Rational, emit: Emit): void {
  const unit = placeUnit(answer);
  if (unit === null) {
    fractionSlipCandidates(answer, emit);
    return;
  }
  // Slip in the last place, then in each larger place the answer actually has:
  // 6.15 → ±0.01, ±0.1, ±1; 7,615 → ±1, ±10, ±100, ±1,000.
  const mantissaDigits = String(mantissa(answer) ?? 1).length;
  const steps = [1, 10, 100, 1000].filter((step) => step < 10 ** mantissaDigits);
  for (const step of steps) {
    const delta = mul(unit, fromInteger(step));
    emit(add(answer, delta), "arithmetic-slip");
    emit(sub(answer, delta), "arithmetic-slip");
  }
  emit(add(answer, mul(unit, fromInteger(2))), "arithmetic-slip");
  emit(sub(answer, mul(unit, fromInteger(2))), "arithmetic-slip");
}

/**
 * Misplaced decimal point. Two decimal points combine in × and ÷, so being
 * off by two places is realistic there; in + and − (and for whole numbers)
 * only a single place is.
 */
function placementCandidates(answer: Rational, emit: Emit, wide: boolean): void {
  for (const k of wide ? [1, -1, 2, -2] : [1, -1]) emit(shiftDecimal(answer, k), "decimal-placement");
}

/** Positions (0 = ones) where adding the two integers carries into the next column. */
function carryPositions(a: number, b: number): number[] {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const positions: number[] = [];
  let carry = 0;
  for (let i = 0; i < Math.max(da.length, db.length); i += 1) {
    const sum = (da[i] ?? 0) + (db[i] ?? 0) + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) positions.push(i);
  }
  return positions;
}

/** Positions where subtracting b from a (a ≥ b) needs a borrow from the next column. */
function borrowPositions(a: number, b: number): number[] {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const positions: number[] = [];
  let borrow = 0;
  for (let i = 0; i < Math.max(da.length, db.length); i += 1) {
    const diff = (da[i] ?? 0) - (db[i] ?? 0) - borrow;
    borrow = diff < 0 ? 1 : 0;
    if (borrow) positions.push(i);
  }
  return positions;
}

/**
 * Carry/borrow mistakes on integers scaled by `scale` (1 for whole numbers,
 * 100 for hundredths): dropping every carry, or just one carry into a column.
 */
function carryMistakes(operation: Operation, x: number, y: number, scale: number, answer: Rational, emit: Emit): void {
  if (operation === "addition") {
    emit(rational(addWithoutCarry(x, y), scale), "missed-carry");
    for (const pos of carryPositions(x, y)) emit(sub(answer, rational(10 ** (pos + 1), scale)), "missed-carry");
  } else {
    const [hi, lo] = x >= y ? [x, y] : [y, x];
    const sign = isNegative(answer) ? -1 : 1;
    emit(rational(subWithoutBorrow(hi, lo) * sign, scale), "missed-borrow");
    // Borrowed correctly but forgot to reduce the next column.
    for (const pos of borrowPositions(hi, lo)) emit(add(answer, rational(sign * 10 ** (pos + 1), scale)), "missed-borrow");
  }
}

function integerCandidates(question: Question, emit: Emit): void {
  const [a, b] = question.operands;
  const x = a.num;
  const y = b.num;
  const answer = question.answer;
  const small = x <= 12 && y <= 12;
  switch (question.operation) {
    case "addition": {
      if ((question.meta.carries ?? 0) > 0) carryMistakes("addition", x, y, 1, answer, emit);
      slipCandidates(answer, emit);
      emit(fromInteger(roundToPlace(x, 10) + roundToPlace(y, 10)), "estimation-error");
      otherOperations("addition", a, b, emit);
      break;
    }
    case "subtraction": {
      if ((question.meta.carries ?? 0) > 0) carryMistakes("subtraction", x, y, 1, answer, emit);
      emit(neg(answer), "sign-error");
      slipCandidates(answer, emit);
      emit(fromInteger(roundToPlace(x, 10) - roundToPlace(y, 10)), "estimation-error");
      otherOperations("subtraction", a, b, emit);
      break;
    }
    case "multiplication": {
      if (y >= 10) emit(fromInteger(x * Math.floor(y / 10) * 10), "partial-product");
      if (x >= 10) emit(fromInteger(Math.floor(x / 10) * 10 * y), "partial-product");
      if (y >= 10) emit(fromInteger(x * roundToPlace(y, 10)), "estimation-error");
      if (x >= 10) emit(fromInteger(roundToPlace(x, 10) * y), "estimation-error");
      emit(fromInteger(x * (y + 1)), "arithmetic-slip");
      emit(fromInteger(x * (y - 1)), "arithmetic-slip");
      emit(fromInteger((x + 1) * y), "arithmetic-slip");
      emit(fromInteger((x - 1) * y), "arithmetic-slip");
      if (Math.abs(answer.num) >= 100) placementCandidates(answer, emit, false);
      slipCandidates(answer, emit);
      otherOperations("multiplication", a, b, emit, { allowAdditive: small });
      break;
    }
    case "division": {
      slipCandidates(answer, emit);
      for (const delta of [-1, 1, -2, 2]) {
        const divisor = y + delta;
        if (divisor >= 2) emit(fromInteger(Math.floor(x / divisor)), "estimation-error");
      }
      if (Math.abs(answer.num) >= 10) placementCandidates(answer, emit, false);
      otherOperations("division", a, b, emit);
      break;
    }
  }
}

function decimalCandidates(question: Question, emit: Emit): void {
  const [a, b] = question.operands;
  const answer = question.answer;
  const scale = commonScale(a, b);
  const ma = mantissa(a);
  const mb = mantissa(b);
  switch (question.operation) {
    case "addition":
    case "subtraction": {
      const subtraction = question.operation === "subtraction";
      // Right-aligning the digits without lining up the decimal points: 2.4 + 3.75 → 24 + 375 → 3.99.
      if (ma !== null && mb !== null && scale !== null && terminatingDecimalPlaces(a) !== terminatingDecimalPlaces(b)) {
        const raw = subtraction ? Math.abs(ma - mb) : ma + mb;
        emit(rational(raw, scale), "decimal-placement");
      }
      if (scale !== null && (question.meta.carries ?? 0) > 0) {
        const sa = Math.abs(a.num) * (scale / a.den);
        const sb = Math.abs(b.num) * (scale / b.den);
        carryMistakes(question.operation, sa, sb, scale, answer, emit);
      }
      if (subtraction) emit(neg(answer), "sign-error");
      slipCandidates(answer, emit);
      placementCandidates(answer, emit, false);
      otherOperations(question.operation, a, b, emit);
      break;
    }
    case "multiplication": {
      placementCandidates(answer, emit, true);
      slipCandidates(answer, emit);
      // Dropping the finest digit of one factor: 2.4 × 0.35 → 2.4 × 0.3.
      for (const [keep, drop] of [
        [a, b],
        [b, a],
      ] as const) {
        const places = terminatingDecimalPlaces(drop);
        if (places !== null && places > 0) {
          const truncated = rational(Math.trunc(toNumber(drop) * 10 ** (places - 1)), 10 ** (places - 1));
          emit(mul(keep, truncated), "partial-product");
        }
      }
      emit(mul(fromInteger(Math.round(toNumber(a))), fromInteger(Math.round(toNumber(b)))), "estimation-error");
      otherOperations("multiplication", a, b, emit, { allowAdditive: toNumber(a) < 10 && toNumber(b) < 10 });
      break;
    }
    case "division": {
      placementCandidates(answer, emit, true);
      slipCandidates(answer, emit);
      if (isInteger(answer)) {
        emit(add(answer, fromInteger(3)), "arithmetic-slip");
        emit(sub(answer, fromInteger(3)), "arithmetic-slip");
      }
      if (!isZero(a)) emit(div(b, a), "reciprocal-error");
      otherOperations("division", a, b, emit);
      break;
    }
  }
}

function fractionCandidates(question: Question, emit: Emit): void {
  const [x, y] = question.operands;
  const { num: a, den: b } = x;
  const { num: c, den: d } = y;
  const answer = question.answer;
  const L = lcm(b, d);
  const safe = (num: number, den: number): Rational | null => (den === 0 ? null : rational(num, den));
  // Fraction arithmetic is easy to confuse with multiplication, so the product
  // is always a live "wrong operation" candidate alongside the sibling operation.
  switch (question.operation) {
    case "addition": {
      emit(safe(a + c, b + d), "denominator-error");
      emit(safe(a + c, b * d), "denominator-error");
      emit(safe(a + c, L), "denominator-error");
      emit(safe(a * (L / b) + c, L), "denominator-error");
      emit(safe(a + c * (L / d), L), "denominator-error");
      emit(mul(x, y), "incorrect-operation");
      otherOperations("addition", x, y, emit);
      fractionSlipCandidates(answer, emit);
      break;
    }
    case "subtraction": {
      emit(safe(a - c, b - d), "denominator-error");
      emit(safe(a - c, b * d), "denominator-error");
      emit(safe(a - c, L), "denominator-error");
      emit(safe(a * (L / b) - c, L), "denominator-error");
      emit(safe(a - c * (L / d), L), "denominator-error");
      emit(neg(answer), "sign-error");
      emit(mul(x, y), "incorrect-operation");
      otherOperations("subtraction", x, y, emit);
      fractionSlipCandidates(answer, emit);
      break;
    }
    case "multiplication": {
      emit(safe(a * d, b * c), "reciprocal-error");
      emit(safe(a * c, b + d), "denominator-error");
      emit(safe(a + c, b * d), "denominator-error");
      emit(add(x, y), "incorrect-operation");
      fractionSlipCandidates(answer, emit);
      break;
    }
    case "division": {
      emit(safe(a * c, b * d), "reciprocal-error");
      emit(safe(b * c, a * d), "reciprocal-error");
      emit(safe(a * d, b + c), "denominator-error");
      emit(abs(sub(x, y)), "incorrect-operation");
      emit(add(x, y), "incorrect-operation");
      fractionSlipCandidates(answer, emit);
      break;
    }
  }
}

/**
 * Every plausible wrong answer for the question, in rough priority order,
 * before any filtering. May contain duplicates and values equal to the
 * correct answer; `buildChoiceSet` removes those.
 */
export function distractorCandidates(question: Question): Distractor[] {
  const out: Distractor[] = [];
  const emit: Emit = (value, tag) => {
    if (value !== null) out.push({ value, tag });
  };
  switch (question.numberType) {
    case "integer":
      integerCandidates(question, emit);
      break;
    case "decimal":
      decimalCandidates(question, emit);
      break;
    case "fraction":
      fractionCandidates(question, emit);
      break;
  }
  return out;
}

/** Whether a wrong value is a reasonable thing to show next to the real answer. */
export function isSensibleDistractor(question: Question, candidate: Distractor): boolean {
  const { value, tag } = candidate;
  const answer = question.answer;
  if (equals(value, answer)) return false;
  if (!Number.isSafeInteger(value.num) || !Number.isSafeInteger(value.den)) return false;
  // Zero next to a non-zero answer reads as a trick, not a plausible slip.
  if (isZero(value) && !isZero(answer)) return false;

  // Keep the sign consistent unless the mistake is specifically about the sign
  // or about applying a different operation.
  const signSensitive = tag !== "sign-error" && tag !== "incorrect-operation";
  if (signSensitive && !isNegative(answer) && isNegative(value)) return false;
  if (signSensitive && isNegative(answer) && !isNegative(value) && !isZero(value)) return false;

  const magnitude = Math.abs(toNumber(value));
  const answerMagnitude = Math.abs(toNumber(answer));
  if (magnitude > Math.max(answerMagnitude * 1000, 10_000)) return false;

  switch (question.numberType) {
    case "integer":
      return isInteger(value);
    case "decimal": {
      const places = terminatingDecimalPlaces(value);
      return places !== null && places <= 4;
    }
    case "fraction":
      return value.den <= 150 && Math.abs(value.num) <= value.den * 40;
  }
}

/** Ordering of mistake families to draw from, most characteristic first. */
export function tagPriority(question: Question): ErrorTag[] {
  const { numberType, operation } = question;
  if (numberType === "fraction") {
    return operation === "addition" || operation === "subtraction"
      ? ["denominator-error", "incorrect-operation", "arithmetic-slip", "sign-error"]
      : ["reciprocal-error", "denominator-error", "incorrect-operation", "arithmetic-slip"];
  }
  if (numberType === "decimal") {
    return operation === "addition" || operation === "subtraction"
      ? ["decimal-placement", "missed-carry", "missed-borrow", "arithmetic-slip", "incorrect-operation", "sign-error"]
      : ["decimal-placement", "arithmetic-slip", "partial-product", "reciprocal-error", "estimation-error", "incorrect-operation"];
  }
  switch (operation) {
    case "addition":
      return ["missed-carry", "arithmetic-slip", "estimation-error", "incorrect-operation"];
    case "subtraction":
      return ["missed-borrow", "arithmetic-slip", "sign-error", "estimation-error", "incorrect-operation"];
    case "multiplication":
      return ["partial-product", "arithmetic-slip", "estimation-error", "decimal-placement", "incorrect-operation"];
    case "division":
      return ["arithmetic-slip", "estimation-error", "decimal-placement", "incorrect-operation"];
  }
}

/**
 * Last-resort wrong answers when the mistake-based strategies cannot supply
 * three distinct sensible values: step away from the answer in its finest
 * place value, alternating sides and growing the step.
 */
export function fallbackDistractors(question: Question, count: number, taken: readonly Rational[]): Distractor[] {
  const answer = question.answer;
  const out: Distractor[] = [];
  const seen = [...taken];
  const consider = (value: Rational) => {
    const candidate: Distractor = { value, tag: "arithmetic-slip" };
    if (out.length < count && isSensibleDistractor(question, candidate) && !seen.some((s) => equals(s, value))) {
      out.push(candidate);
      seen.push(value);
    }
  };

  if (question.numberType === "fraction") {
    // Fraction neighbours: numerator or denominator off by a little, then
    // near-misses over a scaled denominator (7/12 → 15/24).
    for (let step = 1; out.length < count && step < 12; step += 1) {
      consider(rational(answer.num + step, answer.den));
      consider(rational(answer.num - step, answer.den));
      consider(rational(answer.num, answer.den + step));
      if (answer.den - step >= 1) consider(rational(answer.num, answer.den - step));
    }
    for (let k = 2; out.length < count && k < 50; k += 1) {
      consider(rational(answer.num * k + 1, answer.den * k));
      consider(rational(answer.num * k - 1, answer.den * k));
    }
    return out;
  }

  const unit = placeUnit(answer) ?? rational(1, answer.den);
  for (let step = 1; out.length < count && step < 200; step += 1) {
    consider(add(answer, mul(unit, fromInteger(step))));
    consider(sub(answer, mul(unit, fromInteger(step))));
  }
  return out;
}
