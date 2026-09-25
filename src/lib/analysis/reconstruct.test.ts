import { describe, expect, it } from "vitest";
import { generateQuestion } from "@/lib/engine/generate";
import { createRng } from "@/lib/engine/rng";
import { DIFFICULTIES, NUMBER_TYPES, OPERATIONS } from "@/lib/engine/types";
import { createSession, sessionReducer } from "@/lib/session/reducer";
import { DEFAULT_SETTINGS } from "@/lib/session/types";
import { makeAttempt } from "@/lib/testing/fixtures";
import { rational } from "@/lib/math/rational";
import { questionFromAttempt } from "./reconstruct";

describe("questionFromAttempt", () => {
  it("rebuilds every kind of question from real session attempts", () => {
    let state = createSession(
      { ...DEFAULT_SETTINGS, mode: "untimed", numberTypes: [...NUMBER_TYPES], operations: [...OPERATIONS], difficulty: "hard" },
      { id: "s", seed: 12, now: 0, wallClock: 0 },
    );
    for (let i = 0; i < 60; i += 1) {
      state = sessionReducer(state, { type: "submit", input: "1", now: i + 1, wallClock: i + 1 });
    }
    for (const attempt of state.attempts) {
      const question = questionFromAttempt(attempt);
      expect(question, attempt.expression).not.toBeNull();
      expect(question?.expression).toBe(attempt.expression);
      expect(question?.answerText).toBe(attempt.correctAnswerText);
      expect(question?.meta.variant).toBe(attempt.meta.variant);
    }
  });

  it("covers every generator combination", () => {
    const rng = createRng(2);
    for (const numberType of NUMBER_TYPES) for (const operation of OPERATIONS) for (const difficulty of DIFFICULTIES) {
      const q = generateQuestion({ settings: { operations: [operation], numberTypes: [numberType], difficulty }, rng, id: "q" });
      const rebuilt = questionFromAttempt(
        makeAttempt({ expression: q.expression, operation, numberType, difficulty, correctAnswer: q.answer, correctAnswerText: q.answerText, meta: q.meta }),
      );
      expect(rebuilt?.expression).toBe(q.expression);
    }
  });

  it("refuses inconsistent or unparsable records", () => {
    expect(questionFromAttempt(makeAttempt({ expression: "garbage" }))).toBeNull();
    expect(questionFromAttempt(makeAttempt({ expression: "2 + 2", correctAnswer: rational(5) }))).toBeNull();
    expect(questionFromAttempt(makeAttempt({ expression: "2 × 2", operation: "addition", correctAnswer: rational(4) }))).toBeNull();
    expect(questionFromAttempt(makeAttempt({ expression: "2 + 2", operation: "addition", correctAnswer: rational(4) }))).not.toBeNull();
  });
});
