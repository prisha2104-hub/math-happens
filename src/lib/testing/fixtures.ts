/** Builders for test data. Not used by application code. */
import { rational } from "@/lib/math/rational";
import { type Attempt, DEFAULT_SETTINGS, type SessionSummary } from "@/lib/session/types";

export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "a",
    sessionId: "s",
    questionId: "q",
    expression: "1 + 1",
    operation: "addition",
    numberType: "integer",
    difficulty: "easy",
    correctAnswer: rational(2),
    correctAnswerText: "2",
    userInput: "2",
    userAnswer: rational(2),
    userAnswerText: "2",
    correct: true,
    responseMs: 1000,
    submittedAt: 0,
    meta: {
      variant: "int-add-easy",
      integerDigits: [1, 1],
      decimalPlaces: [0, 0],
      denominators: [1, 1],
      carries: 0,
      lcm: null,
      crossCancel: null,
      negativeResult: false,
      integerResult: true,
      resultMagnitude: 2,
    },
    answerFormat: "open",
    choice: null,
    errorTag: null,
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  const endedAt = overrides.endedAt ?? 1_000_000;
  return {
    id: "s",
    settings: DEFAULT_SETTINGS,
    startedAt: endedAt - 60_000,
    endedAt,
    endReason: "timer",
    elapsedMs: 60_000,
    attempted: 1,
    correct: 1,
    incorrect: 0,
    accuracy: 1,
    averageResponseMs: 1000,
    correctPerMinute: 1,
    netScorePerMinute: 1,
    byOperation: { addition: { attempted: 1, correct: 1, incorrect: 0, accuracy: 1, averageResponseMs: 1000 } },
    byNumberType: { integer: { attempted: 1, correct: 1, incorrect: 0, accuracy: 1, averageResponseMs: 1000 } },
    ...overrides,
  };
}
