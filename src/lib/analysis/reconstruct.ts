import { parseAnswer } from "@/lib/answer/parse";
import { buildQuestion } from "@/lib/engine/generate";
import { type Operation, OPERATION_SYMBOLS, type Question } from "@/lib/engine/types";
import { equals } from "@/lib/math/rational";
import type { Attempt } from "@/lib/session/types";

const SYMBOL_TO_OPERATION = Object.fromEntries(Object.entries(OPERATION_SYMBOLS).map(([op, symbol]) => [symbol, op as Operation])) as Record<string, Operation>;

/**
 * Rebuild the Question behind a stored attempt from its canonical expression
 * ("2,736 ÷ 24", "3/4 − 1/6"). Returns null if the text cannot be parsed or
 * the recomputed answer disagrees with the stored one, so a corrupted record
 * can never produce a wrong explanation.
 */
export function questionFromAttempt(attempt: Attempt): Question | null {
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
