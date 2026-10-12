import type { Rational } from "@/lib/math/rational";
import type { AdvancedSettings } from "./advanced";
import type { AnswerUnit } from "./units";

/** The four column operations the arithmetic generators work in. */
export const ARITHMETIC_OPERATIONS = ["addition", "subtraction", "multiplication", "division"] as const;
export type ArithmeticOperation = (typeof ARITHMETIC_OPERATIONS)[number];

/**
 * Finance maths is a fifth selectable operation rather than a separate
 * section: it mixes with the other four, uses the same difficulty, timer and
 * answer-format settings, and is analysed through the same facets. Its
 * questions are word problems, so they carry a `prompt` and an answer unit
 * instead of a two-operand expression.
 */
export const OPERATIONS = [...ARITHMETIC_OPERATIONS, "finance"] as const;
export type Operation = (typeof OPERATIONS)[number];

export function isArithmetic(operation: Operation): operation is ArithmeticOperation {
  return operation !== "finance";
}

export const NUMBER_TYPES = ["integer", "decimal", "fraction"] as const;
export type NumberType = (typeof NUMBER_TYPES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const OPERATION_SYMBOLS: Record<Operation, string> = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
  finance: "%",
};

export const OPERATION_LABELS: Record<Operation, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
  finance: "Finance maths",
};

export const NUMBER_TYPE_LABELS: Record<NumberType, string> = {
  integer: "Integers",
  decimal: "Decimals",
  fraction: "Fractions",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** The subset of settings the arithmetic engine cares about. */
export interface GeneratorSettings {
  operations: readonly Operation[];
  numberTypes: readonly NumberType[];
  difficulty: Difficulty;
  /**
   * User-configured operand ranges. Ignored unless `enabled`, in which case
   * integer and fraction questions are built from the ranges instead of the
   * difficulty tiers.
   */
  advanced?: AdvancedSettings | null;
}

/**
 * Structural features of a question, computed at generation time so future
 * weakness analysis can group attempts without re-deriving anything.
 */
export interface QuestionMeta {
  /** Generator variant that produced the question, e.g. "int-div-2digit-divisor". */
  variant: string;
  /** Digits in the integer part of each operand (0 for values below 1). */
  integerDigits: number[];
  /** Decimal places needed to write each operand exactly; null if non-terminating. */
  decimalPlaces: (number | null)[];
  /** Denominator of each operand in lowest terms (1 for integers). */
  denominators: number[];
  /** Column carries (addition) or borrows (subtraction) for integer and decimal questions. */
  carries: number | null;
  /** Common denominator for fraction addition and subtraction. */
  lcm: number | null;
  /** Whether fraction multiplication/division allows cancelling across operands. */
  crossCancel: boolean | null;
  negativeResult: boolean;
  integerResult: boolean;
  /** |answer| as a float, for coarse magnitude bucketing only. */
  resultMagnitude: number;
  /**
   * Everything a finance question is made of. The prompt, the answer and the
   * explanation are all derived from this, so a stored attempt can be
   * re-explained later without keeping any text. Absent for arithmetic.
   */
  finance?: FinanceMeta;
}

/** The inputs behind a finance question; see `lib/engine/generators/finance.ts`. */
export interface FinanceMeta {
  subtype: string;
  /** Which form of the subtype was asked ("bps" vs "pp", "ev" vs "equity"); "" when it has one form. */
  mode: string;
  /** Exact prompt numbers, in the order the template expects them. */
  inputs: readonly Rational[];
  /** Decimal places the answer is given to. */
  places: number;
  /** Whether an estimate inside a tolerance band counts as correct. */
  estimate: boolean;
}

export interface Question {
  id: string;
  /** Identity used for duplicate prevention; commutative operations share a key. */
  key: string;
  /** Plain-text form, e.g. "2,736 ÷ 24", "3/4 − 1/6" or "25% of 76". */
  expression: string;
  operation: Operation;
  numberType: NumberType;
  difficulty: Difficulty;
  /**
   * The two numbers being combined. For finance questions these are the first
   * two prompt numbers, kept only so generic code has something to read;
   * `meta.finance.inputs` is authoritative there.
   */
  operands: readonly [Rational, Rational];
  /** Exact normalized answer, already rounded to `answerPlaces` when set. */
  answer: Rational;
  /** Canonical display of the answer, including its unit for finance questions. */
  answerText: string;
  meta: QuestionMeta;
  /** Word-problem text. Present for finance questions, absent for arithmetic. */
  prompt?: string;
  /** Rounding or estimation instruction shown under the prompt. */
  instruction?: string;
  /** Unit the answer is given in; absent means a plain number in the question's number style. */
  unit?: AnswerUnit;
  /** Decimal places the answer is given to; absent means the answer is exact as written. */
  answerPlaces?: number;
  /** Absolute band around `answer` that still counts as correct; absent means exact only. */
  tolerance?: Rational;
  /** The exact value before rounding, when `answer` is a rounded form of it. */
  exactAnswer?: Rational;
  /**
   * Two or three worked steps ending at the answer, shown after a miss. Held
   * on the live question only: stored attempts keep `meta.finance` instead and
   * the steps are re-derived from it, so an improved explanation applies to
   * everything already recorded.
   */
  explanation?: readonly string[];
}

/** Output of a concrete generator before it is wrapped into a Question. */
export interface RawProblem {
  variant: string;
  operands: readonly [Rational, Rational];
}
