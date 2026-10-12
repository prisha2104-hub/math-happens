import type { Question } from "@/lib/engine/types";
import type { AnswerUnit } from "@/lib/engine/units";
import { type Rational, abs, compare, equals, sub } from "@/lib/math/rational";
import { type ParseErrorCode, parseAnswer } from "./parse";

export type Evaluation =
  | { verdict: "correct"; value: Rational }
  | { verdict: "incorrect"; value: Rational }
  | { verdict: "invalid"; error: ParseErrorCode; message: string };

/**
 * Unit markers a typed answer may carry. They are only stripped — never
 * interpreted — so answering a basis-point question in percentage points is
 * still wrong; the user is simply not forced to type the unit.
 */
const UNIT_MARKERS: Record<Exclude<AnswerUnit, "plain">, RegExp> = {
  percent: /\s*(?:%|percent|pc)$/i,
  "percentage-points": /\s*(?:pp|percentage\s*points?|points?)$/i,
  "basis-points": /\s*(?:bps|bp|basis\s*points?)$/i,
  currency: /^\s*\$\s*/,
  "currency-millions": /^\s*\$\s*/,
  multiple: /\s*(?:x|×|times)$/i,
};

/** Drop the question's own unit from a typed answer so "15%" and "15" both parse. */
export function stripUnit(raw: string, unit: AnswerUnit | undefined): string {
  if (unit === undefined || unit === "plain") return raw;
  let text = raw.trim();
  const marker = UNIT_MARKERS[unit];
  if (marker) text = text.replace(marker, "");
  if (unit === "currency" || unit === "currency-millions") {
    text = text.replace(/^\s*\$\s*/, "").replace(/^-\s*\$\s*/, "-");
    if (unit === "currency-millions") text = text.replace(/\s*(?:m|mm|million|millions)$/i, "");
  }
  return text.trim();
}

/**
 * Exact comparison: any mathematically equal value is accepted, so "0.5",
 * "1/2", "2/4" and "0.50" are all correct answers to a question whose answer
 * is 1/2, and "2" or "4/2" both answer a fraction question that equals 2.
 *
 * Estimation questions carry a tolerance instead, and then anything inside
 * the band the question states counts.
 */
export function isCorrectAnswer(question: Question, value: Rational): boolean {
  if (question.tolerance !== undefined) return compare(abs(sub(value, question.answer)), question.tolerance) <= 0;
  return equals(question.answer, value);
}

export function evaluateAnswer(question: Question, raw: string): Evaluation {
  const parsed = parseAnswer(stripUnit(raw, question.unit));
  if (!parsed.ok) return { verdict: "invalid", error: parsed.error, message: parsed.message };
  return isCorrectAnswer(question, parsed.value)
    ? { verdict: "correct", value: parsed.value }
    : { verdict: "incorrect", value: parsed.value };
}
