import type { Rational } from "@/lib/math/rational";

/**
 * Categories of realistic arithmetic mistakes. Distractors carry the tag of
 * the mistake that would produce them; open answers get a tag only when the
 * typed value provably matches one of these patterns.
 */
export const ERROR_TAGS = [
  "decimal-placement",
  "arithmetic-slip",
  "incorrect-operation",
  "denominator-error",
  "reciprocal-error",
  "missed-carry",
  "missed-borrow",
  "sign-error",
  "estimation-error",
  "partial-product",
  "unclassified",
] as const;

export type ErrorTag = (typeof ERROR_TAGS)[number];

export const ERROR_TAG_LABELS: Record<ErrorTag, string> = {
  "decimal-placement": "Decimal placement",
  "arithmetic-slip": "Arithmetic slip",
  "incorrect-operation": "Wrong operation",
  "denominator-error": "Denominator error",
  "reciprocal-error": "Reciprocal error",
  "missed-carry": "Missed carry",
  "missed-borrow": "Missed borrow",
  "sign-error": "Sign error",
  "estimation-error": "Estimation error",
  "partial-product": "Partial product",
  unclassified: "Unclassified",
};

export const ERROR_TAG_DESCRIPTIONS: Record<ErrorTag, string> = {
  "decimal-placement": "The digits were right but the decimal point landed in the wrong place.",
  "arithmetic-slip": "A small slip in one digit or one step of the calculation.",
  "incorrect-operation": "The operands were combined with a different operation than the one asked.",
  "denominator-error": "Numerators and denominators were combined as if they were ordinary numbers.",
  "reciprocal-error": "A fraction was inverted when it should not have been, or not inverted when it should.",
  "missed-carry": "A carry from one column into the next was dropped.",
  "missed-borrow": "A borrow between columns was skipped, subtracting the smaller digit from the larger.",
  "sign-error": "The magnitude was right but the sign was wrong.",
  "estimation-error": "A rounded, approximate value was given instead of the exact result.",
  "partial-product": "Only part of a split multiplication was carried through.",
  unclassified: "The answer does not match a recognisable mistake pattern.",
};

/** A wrong option together with the mistake that produces it. */
export interface Distractor {
  value: Rational;
  tag: ErrorTag;
}

export interface ChoiceOption {
  value: Rational;
  /** Display text in the question's number style. */
  text: string;
  /** null for the correct option. */
  tag: ErrorTag | null;
}

export interface ChoiceSet {
  options: ChoiceOption[];
  correctIndex: number;
}
