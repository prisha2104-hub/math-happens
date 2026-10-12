import { parseAnswer } from "@/lib/answer/parse";
import { buildFinanceQuestion, buildQuestion } from "@/lib/engine/generate";
import { isFinanceSubtype } from "@/lib/engine/finance";
import { type ArithmeticOperation, type FinanceMeta, OPERATION_SYMBOLS, type Question, isArithmetic } from "@/lib/engine/types";
import { type Rational, equals } from "@/lib/math/rational";
import type { Attempt } from "@/lib/session/types";

const SYMBOL_TO_OPERATION = Object.fromEntries(
  Object.entries(OPERATION_SYMBOLS)
    .filter(([operation]) => isArithmetic(operation as ArithmeticOperation))
    .map(([op, symbol]) => [symbol, op as ArithmeticOperation]),
) as Record<string, ArithmeticOperation>;

const isRational = (value: unknown): value is Rational =>
  typeof value === "object" &&
  value !== null &&
  Number.isSafeInteger((value as Rational).num) &&
  Number.isSafeInteger((value as Rational).den) &&
  (value as Rational).den > 0;

/**
 * A stored finance description, checked before it is trusted: records written
 * by a newer build (or edited by hand) must not be able to make the templates
 * throw.
 */
function financeMeta(meta: Attempt["meta"]): (FinanceMeta & { subtype: Parameters<typeof buildFinanceQuestion>[1]["subtype"] }) | null {
  const finance = meta.finance;
  if (!finance || !isFinanceSubtype(finance.subtype)) return null;
  if (!Array.isArray(finance.inputs) || finance.inputs.length === 0 || !finance.inputs.every(isRational)) return null;
  return {
    subtype: finance.subtype,
    mode: typeof finance.mode === "string" ? finance.mode : "",
    inputs: finance.inputs,
    places: Number.isFinite(finance.places) ? finance.places : 0,
    estimate: finance.estimate === true,
  };
}

/**
 * Rebuild the Question behind a stored attempt: from its canonical expression
 * ("2,736 ÷ 24", "3/4 − 1/6") for arithmetic, and from the stored description
 * for finance. Returns null if the record cannot be read or the recomputed
 * answer disagrees with the stored one, so a corrupted record can never
 * produce a wrong explanation.
 */
export function questionFromAttempt(attempt: Attempt): Question | null {
  if (attempt.operation === "finance") {
    const finance = financeMeta(attempt.meta);
    if (finance === null) return null;
    const question = buildFinanceQuestion(attempt.questionId, finance, attempt.difficulty);
    return equals(question.answer, attempt.correctAnswer) ? question : null;
  }
  const match = /^(\S+) ([+−×÷]) (\S+)$/.exec(attempt.expression);
  if (!match) return null;
  const [, left, symbol, right] = match;
  const operation = SYMBOL_TO_OPERATION[symbol as string];
  if (!operation || operation !== attempt.operation) return null;
  const a = parseAnswer(left as string);
  const b = parseAnswer(right as string);
  if (!a.ok || !b.ok) return null;
  const question = buildQuestion(attempt.questionId, { variant: attempt.meta.variant, operands: [a.value, b.value] }, operation, attempt.numberType, attempt.difficulty);
  return equals(question.answer, attempt.correctAnswer) ? question : null;
}
