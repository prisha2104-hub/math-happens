import type { TargetSpec } from "@/lib/engine/targeted";
import type { ArithmeticOperation, Question } from "@/lib/engine/types";
import type { Rational } from "@/lib/math/rational";

export const TECHNIQUE_CATEGORIES = ["division", "multiplication", "addition-subtraction", "fractions"] as const;
export type TechniqueCategory = (typeof TECHNIQUE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  division: "Division",
  multiplication: "Multiplication",
  "addition-subtraction": "Addition and subtraction",
  fractions: "Fractions",
};

/**
 * A worked explanation for one concrete question. `result` is computed from
 * the intermediate values, never copied from the question, so tests can
 * prove the steps actually arrive at the right answer.
 */
export interface Explanation {
  steps: string[];
  result: Rational;
}

export interface Technique {
  id: string;
  category: TechniqueCategory;
  title: string;
  /** One or two sentences: what the technique does. */
  summary: string;
  /** When it pays off. */
  whenUseful: string;
  /** Whether the technique makes this particular question easier. */
  applies(question: Question): boolean;
  /** Exact worked steps for a question the technique applies to; null otherwise. */
  explain(question: Question): Explanation | null;
  /** Skill to draw practice questions from; questions are then filtered with `applies`. */
  practice: TargetSpec;
  /** Operands for the library's standing worked example. */
  example: { operation: ArithmeticOperation; numberType: Question["numberType"]; a: [number, number]; b: [number, number] };
}
