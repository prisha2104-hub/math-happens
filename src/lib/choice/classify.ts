import type { Question } from "@/lib/engine/types";
import { type Rational, equals } from "@/lib/math/rational";
import { distractorCandidates } from "./distractors";
import type { ErrorTag } from "./types";

/** Most specific explanations first; a generic slip is the last resort. */
const OPEN_ANSWER_PRIORITY: ErrorTag[] = [
  "decimal-placement",
  "sign-error",
  "missed-carry",
  "missed-borrow",
  "reciprocal-error",
  "denominator-error",
  "incorrect-operation",
  "partial-product",
  "estimation-error",
  "arithmetic-slip",
];

/**
 * Infer why an open answer was wrong. A tag is returned only when the typed
 * value is exactly the value that mistake would produce for this question;
 * anything else is honestly reported as "unclassified".
 */
export function classifyOpenAnswer(question: Question, userAnswer: Rational): ErrorTag {
  if (equals(question.answer, userAnswer)) throw new Error("cannot classify a correct answer");
  const candidates = distractorCandidates(question);
  for (const tag of OPEN_ANSWER_PRIORITY) {
    if (candidates.some((c) => c.tag === tag && equals(c.value, userAnswer))) return tag;
  }
  return "unclassified";
}
