import {
  ARITHMETIC_OPERATIONS,
  DIFFICULTIES,
  type Difficulty,
  NUMBER_TYPES,
  type NumberType,
  OPERATIONS,
  type Operation,
  type QuestionMeta,
} from "@/lib/engine/types";
import {
  type AdvancedSettings,
  DEFAULT_ADVANCED_SETTINGS,
  activeNumberTypes,
  activeOperations,
  coerceAdvanced,
  validateAdvanced,
} from "@/lib/engine/advanced";
import type { PracticePlan, PracticeTarget, TargetReason } from "@/lib/adaptive/plan";
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
   * Operand ranges and operation / number-format percentages. While
   * `advanced.enabled` is false this is inert and practice behaves exactly as
   * it does without it; while it is true the percentages replace `operations`
   * and `numberTypes` as the source of truth for what gets generated.
   */
  advanced: AdvancedSettings;
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
  // Finance maths is opt-in: it is a different kind of practice, so a fresh
  // setup still starts as plain column arithmetic.
  operations: [...ARITHMETIC_OPERATIONS],
  numberTypes: ["integer"],
  answerFormat: "open",
  advanced: DEFAULT_ADVANCED_SETTINGS,
};

/**
 * Operations and number types the session will actually draw from. With
 * advanced settings on, anything at 0 % is excluded and the percentages win
 * over the plain toggles.
 */
export function effectiveOperations(settings: TrainerSettings): Operation[] {
  return settings.advanced.enabled ? activeOperations(settings.advanced) : [...settings.operations];
}

export function effectiveNumberTypes(settings: TrainerSettings): NumberType[] {
  return settings.advanced.enabled ? activeNumberTypes(settings.advanced) : [...settings.numberTypes];
}

export function validateSettings(settings: TrainerSettings): string[] {
  const errors: string[] = [];
  if (settings.advanced.enabled) {
    // The mixes replace the toggles while advanced settings are on, so the
    // toggle-based checks would be noise. The detail of each problem is shown
    // beside the field that caused it, so this is only a pointer to it.
    const issues = validateAdvanced(settings.advanced);
    if (issues.length > 0) {
      errors.push(`Advanced settings need ${issues.length === 1 ? "a fix" : "fixes"} — see the highlighted ${issues.length === 1 ? "field" : "fields"} below.`);
    }
  } else {
    if (settings.operations.length === 0) errors.push("Select at least one operation.");
    // Finance maths brings its own numbers, so a finance-only session needs no
    // number format. Any other selection — including an empty one — still does.
    const financeOnly = settings.operations.length > 0 && settings.operations.every((operation) => operation === "finance");
    if (!financeOnly && settings.numberTypes.length === 0) errors.push("Select at least one number type.");
  }
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
    // Settings saved before advanced settings existed have no `advanced` field
    // and coerce to the defaults, which are off.
    advanced: coerceAdvanced(raw.advanced),
  };
}

/**
 * Reasons a stored plan may carry. Kept here rather than imported so that
 * `lib/session` has no runtime dependency on `lib/adaptive`; an unrecognised
 * reason (written by a newer build) falls back to "fresh" rather than being
 * trusted.
 */
const TARGET_REASONS: readonly TargetReason[] = ["weak-accuracy", "slow", "repeated-miss", "review-due", "fresh", "focus", "technique"];

function coerceTarget(input: unknown): PracticeTarget | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const spec = (typeof raw.target === "object" && raw.target !== null ? raw.target : {}) as Record<string, unknown>;
  if (!isOneOf(NUMBER_TYPES, spec.numberType) || !isOneOf(OPERATIONS, spec.operation) || !isOneOf(DIFFICULTIES, spec.difficulty)) return null;
  return {
    target: {
      numberType: spec.numberType,
      operation: spec.operation,
      difficulty: spec.difficulty,
      facet: typeof spec.facet === "string" ? spec.facet : null,
      feature: (typeof spec.feature === "string" ? spec.feature : null) as PracticeTarget["target"]["feature"],
    },
    weight: typeof raw.weight === "number" && Number.isFinite(raw.weight) ? raw.weight : 0,
    reason: isOneOf(TARGET_REASONS, raw.reason) ? raw.reason : "fresh",
    label: typeof raw.label === "string" ? raw.label : "",
    ...(typeof raw.techniqueId === "string" ? { techniqueId: raw.techniqueId } : {}),
  };
}

/**
 * The practice plan stored with an Improve session. It is never a saved
 * preference, but a finished session keeps it so the session can still be
 * recognised as adaptive practice — and therefore not compared with ordinary
 * Train sessions — long after it was run. Returns null for anything that is
 * not a plan, which is also how sessions recorded before plans existed read.
 */
export function coercePlan(input: unknown): PracticePlan | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.targets)) return null;
  const targets = raw.targets.map(coerceTarget).filter((t): t is PracticeTarget => t !== null);
  return {
    targets,
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    coldStart: raw.coldStart === true,
  };
}

/**
 * Settings of a session that was run, as opposed to settings saved as a
 * preference: identical to `coerceSettings` except that an Improve plan is
 * kept rather than dropped.
 */
export function coerceSessionSettings(input: unknown): TrainerSettings {
  const settings = coerceSettings(input);
  const plan = coercePlan((typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {}).plan);
  return plan === null ? settings : { ...settings, plan };
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
  /**
   * Median response time over correct answers only, so rushing through wrong
   * answers cannot flatter it. null when nothing was correct, and absent
   * entirely on sessions recorded before this figure existed — readers must
   * treat it as unknown rather than zero.
   */
  medianCorrectResponseMs?: number | null;
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
