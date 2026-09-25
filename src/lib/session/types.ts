import {
  DIFFICULTIES,
  type Difficulty,
  NUMBER_TYPES,
  type NumberType,
  OPERATIONS,
  type Operation,
  type QuestionMeta,
} from "@/lib/engine/types";
import type { PracticePlan } from "@/lib/adaptive/plan";
import type { ChoiceOption, ErrorTag } from "@/lib/choice/types";
import type { Rational } from "@/lib/math/rational";

export type SessionMode = "timed" | "untimed";

export const ANSWER_FORMATS = ["open", "multiple-choice"] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

export const ANSWER_FORMAT_LABELS: Record<AnswerFormat, string> = {
  open: "Open answer",
  "multiple-choice": "Multiple choice",
};

export interface TrainerSettings {
  mode: SessionMode;
  /** Timed mode length, 1–10 minutes. */
  durationMinutes: number;
  /** Untimed mode: stop after this many answers, or null for open-ended. */
  questionLimit: number | null;
  difficulty: Difficulty;
  operations: Operation[];
  numberTypes: NumberType[];
  /** How answers are given. Saved configurations from before this field default to "open". */
  answerFormat: AnswerFormat;
  /**
   * Improve mode only: where questions are drawn from instead of the plain
   * operation × number type selection. Never persisted as a user preference,
   * but kept on the session summary so the session can be understood later.
   */
  plan?: PracticePlan | null;
}

export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 10;
export const DEFAULT_DURATION_MINUTES = 4;
export const MIN_QUESTION_LIMIT = 1;
export const MAX_QUESTION_LIMIT = 500;

export const DEFAULT_SETTINGS: TrainerSettings = {
  mode: "timed",
  durationMinutes: DEFAULT_DURATION_MINUTES,
  questionLimit: null,
  difficulty: "medium",
  operations: [...OPERATIONS],
  numberTypes: ["integer"],
  answerFormat: "open",
};

export function validateSettings(settings: TrainerSettings): string[] {
  const errors: string[] = [];
  if (settings.operations.length === 0) errors.push("Select at least one operation.");
  if (settings.numberTypes.length === 0) errors.push("Select at least one number type.");
  if (
    !Number.isInteger(settings.durationMinutes) ||
    settings.durationMinutes < MIN_DURATION_MINUTES ||
    settings.durationMinutes > MAX_DURATION_MINUTES
  ) {
    errors.push(`Timer must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`);
  }
  if (
    settings.questionLimit !== null &&
    (!Number.isInteger(settings.questionLimit) ||
      settings.questionLimit < MIN_QUESTION_LIMIT ||
      settings.questionLimit > MAX_QUESTION_LIMIT)
  ) {
    errors.push(`Question limit must be between ${MIN_QUESTION_LIMIT} and ${MAX_QUESTION_LIMIT}.`);
  }
  return errors;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * Coerce unknown data (e.g. from storage) into settings, dropping anything
 * unrecognised and falling back to defaults field by field.
 */
export function coerceSettings(input: unknown): TrainerSettings {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const operations = Array.isArray(raw.operations) ? raw.operations.filter((op) => isOneOf(OPERATIONS, op)) : null;
  const numberTypes = Array.isArray(raw.numberTypes) ? raw.numberTypes.filter((t) => isOneOf(NUMBER_TYPES, t)) : null;
  const duration = typeof raw.durationMinutes === "number" ? Math.round(raw.durationMinutes) : DEFAULT_DURATION_MINUTES;
  const limit = typeof raw.questionLimit === "number" ? Math.round(raw.questionLimit) : null;
  return {
    mode: raw.mode === "untimed" ? "untimed" : "timed",
    durationMinutes: Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, duration)),
    questionLimit: limit === null ? null : Math.min(MAX_QUESTION_LIMIT, Math.max(MIN_QUESTION_LIMIT, limit)),
    difficulty: isOneOf(DIFFICULTIES, raw.difficulty) ? raw.difficulty : DEFAULT_SETTINGS.difficulty,
    operations: operations && operations.length > 0 ? [...new Set(operations)] : [...DEFAULT_SETTINGS.operations],
    numberTypes: numberTypes && numberTypes.length > 0 ? [...new Set(numberTypes)] : [...DEFAULT_SETTINGS.numberTypes],
    answerFormat: raw.answerFormat === "multiple-choice" ? "multiple-choice" : "open",
  };
}

export function timeLimitMs(settings: TrainerSettings): number | null {
  return settings.mode === "timed" ? settings.durationMinutes * 60_000 : null;
}

/** One submitted answer, stored with everything needed for later analysis. */
export interface Attempt {
  id: string;
  sessionId: string;
  questionId: string;
  expression: string;
  operation: Operation;
  numberType: NumberType;
  difficulty: Difficulty;
  correctAnswer: Rational;
  correctAnswerText: string;
  /** Exactly what the user typed, trimmed. */
  userInput: string;
  /** The user's answer as an exact value. */
  userAnswer: Rational;
  /** The user's answer rendered in the question's number style. */
  userAnswerText: string;
  correct: boolean;
  responseMs: number;
  /** Epoch milliseconds. */
  submittedAt: number;
  meta: QuestionMeta;
  /** How the answer was given. Attempts recorded before this field existed are "open". */
  answerFormat: AnswerFormat;
  /** The options shown and the one picked, for multiple-choice attempts only. */
  choice: ChoiceRecord | null;
  /**
   * Mistake category. For multiple choice it is the selected distractor's tag;
   * for open answers it is inferred only when the typed value exactly matches
   * a known mistake pattern. null for correct answers.
   */
  errorTag: ErrorTag | null;
}

export interface ChoiceRecord {
  options: ChoiceOption[];
  correctIndex: number;
  selectedIndex: number;
}

export type EndReason = "timer" | "manual" | "limit";

export interface Breakdown {
  attempted: number;
  correct: number;
  incorrect: number;
  /** correct / attempted, 0 when nothing was attempted. */
  accuracy: number;
  averageResponseMs: number;
}

export interface SessionMetrics extends Breakdown {
  /** Active (unpaused) time in milliseconds. */
  elapsedMs: number;
  correctPerMinute: number;
  /** (correct − incorrect) / elapsed minutes. */
  netScorePerMinute: number;
}

export interface SessionSummary extends SessionMetrics {
  id: string;
  settings: TrainerSettings;
  startedAt: number;
  endedAt: number;
  endReason: EndReason;
  byOperation: Partial<Record<Operation, Breakdown>>;
  byNumberType: Partial<Record<NumberType, Breakdown>>;
}
