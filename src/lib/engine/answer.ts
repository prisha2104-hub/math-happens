import { type NumberStyle, formatRational } from "@/lib/math/format";
import type { Rational } from "@/lib/math/rational";
import type { NumberType, Question } from "./types";
import { type AnswerUnit, formatWithUnit } from "./units";

export const NUMBER_STYLE: Record<NumberType, NumberStyle> = {
  integer: "integer",
  decimal: "decimal",
  fraction: "fraction",
};

export function formatOperand(value: Rational, numberType: NumberType): string {
  return formatRational(value, NUMBER_STYLE[numberType]);
}

type Displayable = Pick<Question, "numberType"> & { unit?: AnswerUnit };

/**
 * A value written as an answer to this question: in the question's number
 * style for arithmetic, and with its unit for finance ("15%", "$570m", "12×").
 * One place decides this, so the correct answer, the multiple-choice options
 * and the recorded answer always read the same way.
 */
export function answerDisplay(question: Displayable, value: Rational): string {
  return question.unit === undefined || question.unit === "plain" ? formatOperand(value, question.numberType) : formatWithUnit(value, question.unit);
}
