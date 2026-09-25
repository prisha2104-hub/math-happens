import type { Rational } from "@/lib/math/rational";

export const OPERATIONS = ["addition", "subtraction", "multiplication", "division"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const NUMBER_TYPES = ["integer", "decimal", "fraction"] as const;
export type NumberType = (typeof NUMBER_TYPES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const OPERATION_SYMBOLS: Record<Operation, string> = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
};

export const OPERATION_LABELS: Record<Operation, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
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
}

export interface Question {
  id: string;
  /** Identity used for duplicate prevention; commutative operations share a key. */
  key: string;
  /** Plain-text form, e.g. "2,736 ÷ 24" or "3/4 − 1/6". */
  expression: string;
  operation: Operation;
  numberType: NumberType;
  difficulty: Difficulty;
  operands: readonly [Rational, Rational];
  /** Exact normalized answer. */
  answer: Rational;
  /** Canonical display of the answer in the question's number style. */
  answerText: string;
  meta: QuestionMeta;
}

/** Output of a concrete generator before it is wrapped into a Question. */
export interface RawProblem {
  variant: string;
  operands: readonly [Rational, Rational];
}
