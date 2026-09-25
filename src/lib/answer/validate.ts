import type { Question } from "@/lib/engine/types";
import { type Rational, equals } from "@/lib/math/rational";
import { type ParseErrorCode, parseAnswer } from "./parse";

export type Evaluation =
  | { verdict: "correct"; value: Rational }
  | { verdict: "incorrect"; value: Rational }
  | { verdict: "invalid"; error: ParseErrorCode; message: string };

/**
 * Exact comparison: any mathematically equal value is accepted, so "0.5",
 * "1/2", "2/4" and "0.50" are all correct answers to a question whose answer
 * is 1/2, and "2" or "4/2" both answer a fraction question that equals 2.
 */
export function isCorrectAnswer(question: Question, value: Rational): boolean {
  return equals(question.answer, value);
}

export function evaluateAnswer(question: Question, raw: string): Evaluation {
  const parsed = parseAnswer(raw);
  if (!parsed.ok) return { verdict: "invalid", error: parsed.error, message: parsed.message };
  return isCorrectAnswer(question, parsed.value)
    ? { verdict: "correct", value: parsed.value }
    : { verdict: "incorrect", value: parsed.value };
}
