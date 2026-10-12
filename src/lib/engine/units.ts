import { formatRational } from "@/lib/math/format";
import { type Rational, abs, fromInteger, isNegative, mul, rational, toNumber } from "@/lib/math/rational";

/**
 * The unit an answer is given in. Finance questions ask for several different
 * kinds of number and mixing them up is itself a mistake worth catching, so
 * the unit travels with the question: it drives the prompt wording, the
 * answer formatting, the multiple-choice option text and what the typed
 * answer parser is willing to strip.
 */
export const ANSWER_UNITS = ["plain", "percent", "percentage-points", "basis-points", "currency", "currency-millions", "multiple"] as const;
export type AnswerUnit = (typeof ANSWER_UNITS)[number];

/** Short name used in prompts and hints ("in %", "in bps"). */
export const UNIT_HINTS: Record<AnswerUnit, string> = {
  plain: "a number",
  percent: "a percentage",
  "percentage-points": "percentage points",
  "basis-points": "basis points",
  currency: "dollars",
  "currency-millions": "dollars in millions",
  multiple: "a multiple",
};

/** The suffix or prefix shown with a value, for instructions like "±0.5%". */
export function unitSuffix(unit: AnswerUnit): string {
  switch (unit) {
    case "percent":
      return "%";
    case "percentage-points":
      return " pp";
    case "basis-points":
      return " bps";
    case "multiple":
      return "×";
    default:
      return "";
  }
}

function plainText(value: Rational): string {
  return formatRational(value, "decimal");
}

/** A value written in its unit: "15%", "35 bps", "$570m", "12×", "-$4". */
export function formatWithUnit(value: Rational, unit: AnswerUnit): string {
  switch (unit) {
    case "currency":
    case "currency-millions": {
      const millions = unit === "currency-millions" ? "m" : "";
      const magnitude = `$${plainText(abs(value))}${millions}`;
      return isNegative(value) ? `-${magnitude}` : magnitude;
    }
    default:
      return `${plainText(value)}${unitSuffix(unit)}`;
  }
}

/**
 * Round to `places` decimals, exactly, with halves going away from zero so a
 * loss of 13.5 rounds to 14 rather than 13 — the same way round the sign.
 */
export function roundTo(value: Rational, places: number): Rational {
  const scale = 10 ** Math.max(0, Math.min(6, Math.round(places)));
  const scaled = toNumber(mul(value, fromInteger(scale)));
  return rational(Math.sign(scaled) * Math.round(Math.abs(scaled)), scale);
}

/** Smallest value visible at `places` decimals: 0 → 1, 1 → 0.1, 2 → 0.01. */
export function placeUnit(places: number): Rational {
  return places <= 0 ? fromInteger(1) : rational(1, 10 ** places);
}

/**
 * Tolerance for an estimation question: a twentieth of the answer, rounded up
 * to one significant figure so the band itself is a round number, and never
 * finer than the place the answer is given to.
 */
export function estimationBand(answer: Rational, places: number): Rational {
  const smallest = placeUnit(places);
  const rough = Math.abs(toNumber(answer)) / 20;
  if (!(rough > toNumber(smallest))) return smallest;
  // One significant figure, rounded up: 0.37 → 0.4, 28.5 → 30.
  let exponent = Math.floor(Math.log10(rough));
  let digit = Math.ceil(rough / 10 ** exponent);
  if (digit >= 10) {
    digit = 1;
    exponent += 1;
  }
  return exponent >= 0 ? fromInteger(digit * 10 ** exponent) : rational(digit, 10 ** -exponent);
}
