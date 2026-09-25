import { describe, expect, it } from "vitest";
import {
  type SessionState,
  createSession,
  elapsedMs,
  remainingMs,
  sessionReducer,
  summarizeSession,
} from "./reducer";
import { DEFAULT_SETTINGS, type TrainerSettings } from "./types";

const T0 = 1_000_000; // monotonic origin
const W0 = 1_700_000_000_000; // wall clock origin

const timed: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "timed", durationMinutes: 1, numberTypes: ["integer", "decimal", "fraction"] };
const untimed: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: null };

function start(settings: TrainerSettings = timed, seed = 1234): SessionState {
  return createSession(settings, { id: "s1", seed, now: T0, wallClock: W0 });
}

function at(offsetMs: number) {
  return { now: T0 + offsetMs, wallClock: W0 + offsetMs };
}

function answerCorrectly(state: SessionState, offsetMs: number): SessionState {
  if (!state.question) throw new Error("no question to answer");
  return sessionReducer(state, { type: "submit", input: state.question.answerText, ...at(offsetMs) });
}

function answerWrongly(state: SessionState, offsetMs: number): SessionState {
  return sessionReducer(state, { type: "submit", input: "123456789", ...at(offsetMs) });
}

describe("createSession", () => {
  it("starts running with a first question and no attempts", () => {
    const state = start();
    expect(state.status).toBe("running");
    expect(state.question).not.toBeNull();
    expect(state.question?.id).toBe("s1:q1");
    expect(state.attempts).toEqual([]);
    expect(state.startedAt).toBe(W0);
    expect(elapsedMs(state, T0)).toBe(0);
    expect(remainingMs(state, T0)).toBe(60_000);
  });

  it("is deterministic for a seed", () => {
    const a = start(timed, 99);
    const b = start(timed, 99);
    expect(a.question?.expression).toBe(b.question?.expression);
    const a2 = answerCorrectly(a, 1000);
    const b2 = answerCorrectly(b, 1000);
    expect(a2.question?.expression).toBe(b2.question?.expression);
  });
});

describe("clock", () => {
  it("derives elapsed time from timestamps and excludes paused time", () => {
    let state = start();
    expect(elapsedMs(state, T0 + 10_000)).toBe(10_000);
    state = sessionReducer(state, { type: "pause", ...at(10_000) });
    expect(state.status).toBe("paused");
    expect(elapsedMs(state, T0 + 25_000)).toBe(10_000);
    state = sessionReducer(state, { type: "resume", ...at(25_000) });
    expect(state.status).toBe("running");
    expect(elapsedMs(state, T0 + 30_000)).toBe(15_000);
    expect(remainingMs(state, T0 + 30_000)).toBe(45_000);
  });

  it("ignores pause when not running and resume when not paused", () => {
    const state = start();
    expect(sessionReducer(state, { type: "resume", ...at(5) })).toBe(state);
    const paused = sessionReducer(state, { type: "pause", ...at(5) });
    expect(sessionReducer(paused, { type: "pause", ...at(10) })).toBe(paused);
  });

  it("reports no remaining time for untimed sessions and never clamps them", () => {
    const state = start(untimed);
    expect(remainingMs(state, T0)).toBeNull();
    expect(elapsedMs(state, T0 + 3_600_000)).toBe(3_600_000);
  });
});

describe("submitting answers", () => {
  it("records a correct attempt with response time and moves on", () => {
    const state = start();
    const first = state.question;
    const next = answerCorrectly(state, 2_500);
    expect(next.attempts).toHaveLength(1);
    const attempt = next.attempts[0];
    expect(attempt).toMatchObject({
      id: "s1:a1",
      sessionId: "s1",
      questionId: first?.id,
      expression: first?.expression,
      operation: first?.operation,
      numberType: first?.numberType,
      difficulty: "medium",
      correct: true,
      responseMs: 2_500,
      submittedAt: W0 + 2_500,
      correctAnswerText: first?.answerText,
    });
    expect(attempt?.meta).toEqual(first?.meta);
    expect(next.question?.id).toBe("s1:q2");
    expect(next.question?.key).not.toBe(first?.key);
    expect(next.lastFeedback).toMatchObject({ correct: true, expression: first?.expression });
    expect(next.inputError).toBeNull();
  });

  it("records an incorrect attempt and exposes the correct answer in feedback", () => {
    const state = start();
    const next = answerWrongly(state, 4_000);
    expect(next.attempts[0]?.correct).toBe(false);
    expect(next.attempts[0]?.userInput).toBe("123456789");
    expect(next.lastFeedback).toMatchObject({ correct: false, correctAnswerText: state.question?.answerText, userInput: "123456789" });
  });

  it("measures response time in active time, not wall time", () => {
    let state = start();
    state = sessionReducer(state, { type: "pause", ...at(1_000) });
    state = sessionReducer(state, { type: "resume", ...at(21_000) });
    state = answerCorrectly(state, 23_000);
    expect(state.attempts[0]?.responseMs).toBe(3_000);
    state = answerCorrectly(state, 24_500);
    expect(state.attempts[1]?.responseMs).toBe(1_500);
  });

  it("rejects invalid input without recording an attempt", () => {
    const state = start();
    const invalid = sessionReducer(state, { type: "submit", input: "abc", ...at(1_000) });
    expect(invalid.attempts).toHaveLength(0);
    expect(invalid.question).toBe(state.question);
    expect(invalid.inputError).toMatch(/3\/4/);
    const cleared = sessionReducer(invalid, { type: "clearInputError" });
    expect(cleared.inputError).toBeNull();
    expect(sessionReducer(cleared, { type: "clearInputError" })).toBe(cleared);
    const empty = sessionReducer(state, { type: "submit", input: "   ", ...at(1_000) });
    expect(empty.attempts).toHaveLength(0);
    expect(empty.inputError).toMatch(/Type an answer/);
  });

  it("does not accept answers while paused", () => {
    const paused = sessionReducer(start(), { type: "pause", ...at(1_000) });
    const attempted = answerCorrectly(paused, 2_000);
    expect(attempted).toBe(paused);
    expect(attempted.attempts).toHaveLength(0);
  });

  it("accepts equivalent forms of the answer", () => {
    let state = start({ ...timed, numberTypes: ["fraction"], operations: ["addition"] }, 5);
    const answer = state.question?.answer;
    if (!answer) throw new Error("expected a question");
    state = sessionReducer(state, { type: "submit", input: `${answer.num * 3}/${answer.den * 3}`, ...at(1_000) });
    expect(state.attempts[0]?.correct).toBe(true);
  });

  it("keeps a moving window so consecutive questions never repeat", () => {
    let state = start({ ...timed, operations: ["multiplication"], numberTypes: ["integer"], difficulty: "easy" });
    const keys: string[] = [];
    for (let i = 0; i < 300; i += 1) {
      keys.push(state.question?.key ?? "");
      state = answerCorrectly(state, i * 100);
    }
    for (let i = 1; i < keys.length; i += 1) expect(keys[i]).not.toBe(keys[i - 1]);
  });
});

describe("ending a session", () => {
  it("finishes automatically when a timed session's clock reaches zero", () => {
    let state = start();
    state = answerCorrectly(state, 30_000);
    const early = sessionReducer(state, { type: "tick", ...at(59_999) });
    expect(early).toBe(state);
    const done = sessionReducer(state, { type: "tick", ...at(60_000) });
    expect(done.status).toBe("finished");
    expect(done.endReason).toBe("timer");
    expect(done.question).toBeNull();
    expect(done.attempts).toHaveLength(1);
    expect(elapsedMs(done, T0 + 90_000)).toBe(60_000);
    expect(done.endedAt).toBe(W0 + 60_000);
  });

  it("does not count an answer submitted after the deadline", () => {
    const state = answerCorrectly(start(), 10_000);
    const late = answerCorrectly(state, 61_000);
    expect(late.status).toBe("finished");
    expect(late.endReason).toBe("timer");
    expect(late.attempts).toHaveLength(1);
    expect(elapsedMs(late, T0 + 61_000)).toBe(60_000);
  });

  it("finishes with the timer reason when pausing after the deadline", () => {
    const late = sessionReducer(start(), { type: "pause", ...at(75_000) });
    expect(late.status).toBe("finished");
    expect(late.endReason).toBe("timer");
    expect(elapsedMs(late, T0 + 99_000)).toBe(60_000);
  });

  it("ends manually from running or paused state and freezes the clock", () => {
    const running = answerCorrectly(start(), 5_000);
    const ended = sessionReducer(running, { type: "end", ...at(12_000) });
    expect(ended.status).toBe("finished");
    expect(ended.endReason).toBe("manual");
    expect(ended.question).toBeNull();
    expect(ended.attempts).toHaveLength(1);
    expect(elapsedMs(ended, T0 + 50_000)).toBe(12_000);

    const paused = sessionReducer(start(), { type: "pause", ...at(8_000) });
    const endedPaused = sessionReducer(paused, { type: "end", ...at(20_000) });
    expect(elapsedMs(endedPaused, T0 + 99_000)).toBe(8_000);
    expect(endedPaused.endReason).toBe("manual");
  });

  it("ignores everything once finished", () => {
    const ended = sessionReducer(start(), { type: "end", ...at(1_000) });
    expect(sessionReducer(ended, { type: "end", ...at(2_000) })).toBe(ended);
    expect(sessionReducer(ended, { type: "resume", ...at(2_000) })).toBe(ended);
    expect(sessionReducer(ended, { type: "pause", ...at(2_000) })).toBe(ended);
    expect(sessionReducer(ended, { type: "tick", ...at(2_000) })).toBe(ended);
    expect(sessionReducer(ended, { type: "submit", input: "1", ...at(2_000) })).toBe(ended);
  });

  it("stops at the question limit in untimed mode", () => {
    let state = start({ ...untimed, questionLimit: 3 });
    state = answerCorrectly(state, 1_000);
    state = answerWrongly(state, 2_000);
    expect(state.status).toBe("running");
    state = answerCorrectly(state, 3_000);
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("limit");
    expect(state.question).toBeNull();
    expect(state.attempts).toHaveLength(3);
    expect(elapsedMs(state, T0 + 10_000)).toBe(3_000);
  });

  it("ignores the question limit in timed mode", () => {
    let state = start({ ...timed, questionLimit: 1 });
    state = answerCorrectly(state, 1_000);
    expect(state.status).toBe("running");
    expect(state.question).not.toBeNull();
  });

  it("runs open-ended in untimed mode until ended manually", () => {
    let state = start(untimed);
    for (let i = 1; i <= 25; i += 1) state = answerCorrectly(state, i * 1_000);
    expect(state.status).toBe("running");
    const ended = sessionReducer(state, { type: "end", ...at(30_000) });
    expect(ended.attempts).toHaveLength(25);
    expect(elapsedMs(ended, T0 + 99_000)).toBe(30_000);
  });
});

describe("summarizeSession", () => {
  it("summarises an empty session without NaN or Infinity", () => {
    const ended = sessionReducer(start(), { type: "end", ...at(0) });
    const summary = summarizeSession(ended, T0);
    expect(summary).toMatchObject({
      id: "s1",
      attempted: 0,
      correct: 0,
      incorrect: 0,
      accuracy: 0,
      averageResponseMs: 0,
      correctPerMinute: 0,
      netScorePerMinute: 0,
      elapsedMs: 0,
      endReason: "manual",
      startedAt: W0,
      endedAt: W0,
    });
    expect(summary.byOperation).toEqual({});
    expect(summary.byNumberType).toEqual({});
  });

  it("computes rates, averages and breakdowns", () => {
    let state = start({ ...timed, durationMinutes: 2, operations: ["addition"], numberTypes: ["integer"] });
    // 3 correct, 1 incorrect, over exactly 2 minutes of active time.
    state = answerCorrectly(state, 10_000);
    state = answerCorrectly(state, 20_000);
    state = answerWrongly(state, 30_000);
    state = answerCorrectly(state, 40_000);
    state = sessionReducer(state, { type: "tick", ...at(120_000) });
    const summary = summarizeSession(state, T0 + 120_000);
    expect(summary.attempted).toBe(4);
    expect(summary.correct).toBe(3);
    expect(summary.incorrect).toBe(1);
    expect(summary.accuracy).toBeCloseTo(0.75);
    expect(summary.averageResponseMs).toBe(10_000);
    expect(summary.elapsedMs).toBe(120_000);
    expect(summary.correctPerMinute).toBeCloseTo(1.5);
    expect(summary.netScorePerMinute).toBeCloseTo(1);
    expect(summary.endReason).toBe("timer");
    expect(summary.byOperation.addition).toMatchObject({ attempted: 4, correct: 3, incorrect: 1 });
    expect(summary.byNumberType.integer).toMatchObject({ attempted: 4, accuracy: 0.75 });
    expect(summary.settings.durationMinutes).toBe(2);
  });

  it("uses active time even if the session was paused", () => {
    let state = start(untimed);
    state = answerCorrectly(state, 30_000);
    state = sessionReducer(state, { type: "pause", ...at(30_000) });
    state = sessionReducer(state, { type: "resume", ...at(600_000) });
    state = sessionReducer(state, { type: "end", ...at(630_000) });
    const summary = summarizeSession(state, T0 + 630_000);
    expect(summary.elapsedMs).toBe(60_000);
    expect(summary.correctPerMinute).toBeCloseTo(1);
  });
});

describe("open answers record format and error tags", () => {
  it("marks attempts as open with no choice record and infers tags only when justified", () => {
    const state = answerCorrectly(start(), 1_000);
    expect(state.attempts[0]).toMatchObject({ answerFormat: "open", choice: null, errorTag: null });
    expect(state.choices).toBeNull();
    expect(state.reveal).toBeNull();

    const wrong = answerWrongly(state, 2_000);
    expect(wrong.attempts[1]?.errorTag).toBe("unclassified");

    // Typing ten times the answer is a recognisable decimal placement slip.
    let decimal = start({ ...timed, numberTypes: ["decimal"], operations: ["multiplication"] }, 8);
    const shifted = `${decimal.question!.answer.num * 10}/${decimal.question!.answer.den}`;
    decimal = sessionReducer(decimal, { type: "submit", input: shifted, ...at(1_000) });
    expect(decimal.attempts[0]?.correct).toBe(false);
    expect(decimal.attempts[0]?.errorTag).toBe("decimal-placement");
  });
});

describe("multiple choice", () => {
  const mc: TrainerSettings = { ...timed, answerFormat: "multiple-choice" };

  it("offers four options for every question and records the choice", () => {
    const state = start(mc, 55);
    expect(state.choices?.options).toHaveLength(4);
    const correctIndex = state.choices!.correctIndex;
    const question = state.question!;
    const chosen = sessionReducer(state, { type: "choose", index: correctIndex, ...at(1_500) });
    expect(chosen.attempts).toHaveLength(1);
    expect(chosen.attempts[0]).toMatchObject({
      answerFormat: "multiple-choice",
      correct: true,
      responseMs: 1_500,
      errorTag: null,
      userInput: question.answerText,
      choice: { correctIndex, selectedIndex: correctIndex },
    });
    expect(chosen.attempts[0]?.choice?.options).toHaveLength(4);
    // The question stays on screen for the reveal; nothing advances yet.
    expect(chosen.question?.id).toBe(question.id);
    expect(chosen.reveal).toEqual({ selectedIndex: correctIndex });
    expect(chosen.lastFeedback?.correct).toBe(true);
  });

  it("stores the selected distractor's tag for a wrong pick", () => {
    const state = start(mc, 56);
    const wrongIndex = state.choices!.options.findIndex((o) => o.tag !== null);
    const chosen = sessionReducer(state, { type: "choose", index: wrongIndex, ...at(2_000) });
    expect(chosen.attempts[0]?.correct).toBe(false);
    expect(chosen.attempts[0]?.errorTag).toBe(state.choices!.options[wrongIndex]!.tag);
    expect(chosen.attempts[0]?.userInput).toBe(state.choices!.options[wrongIndex]!.text);
    expect(chosen.attempts[0]?.userAnswer).toEqual(state.choices!.options[wrongIndex]!.value);
    expect(chosen.lastFeedback?.correct).toBe(false);
  });

  it("ignores further picks and typed answers while the verdict is showing", () => {
    const state = start(mc, 57);
    const first = sessionReducer(state, { type: "choose", index: 0, ...at(1_000) });
    const second = sessionReducer(first, { type: "choose", index: 1, ...at(1_050) });
    expect(second).toBe(first);
    const typed = sessionReducer(first, { type: "submit", input: "1", ...at(1_100) });
    expect(typed).toBe(first);
    expect(first.attempts).toHaveLength(1);
  });

  it("advances to a fresh question with a fresh option set and response clock", () => {
    const state = start(mc, 58);
    const chosen = sessionReducer(state, { type: "choose", index: 2, ...at(1_000) });
    const advanced = sessionReducer(chosen, { type: "advance", ...at(1_900) });
    expect(advanced.reveal).toBeNull();
    expect(advanced.question?.id).toBe("s1:q2");
    expect(advanced.question?.key).not.toBe(state.question?.key);
    expect(advanced.choices?.options).toHaveLength(4);
    expect(advanced.choices?.options.some((o) => o.value.num === advanced.question!.answer.num && o.value.den === advanced.question!.answer.den)).toBe(true);
    // Response time for the next answer counts from the advance, not from the previous pick.
    const next = sessionReducer(advanced, { type: "choose", index: advanced.choices!.correctIndex, ...at(3_400) });
    expect(next.attempts[1]?.responseMs).toBe(1_500);
  });

  it("ignores advance when nothing is being revealed", () => {
    const state = start(mc, 59);
    expect(sessionReducer(state, { type: "advance", ...at(500) })).toBe(state);
    const open = start(timed, 59);
    expect(sessionReducer(open, { type: "choose", index: 0, ...at(500) })).toBe(open);
  });

  it("finishes on the timer during a reveal and keeps the recorded answer", () => {
    const state = start(mc, 60);
    const chosen = sessionReducer(state, { type: "choose", index: state.choices!.correctIndex, ...at(59_900) });
    const expired = sessionReducer(chosen, { type: "advance", ...at(60_100) });
    expect(expired.status).toBe("finished");
    expect(expired.endReason).toBe("timer");
    expect(expired.attempts).toHaveLength(1);
    expect(expired.choices).toBeNull();
    expect(expired.reveal).toBeNull();
  });

  it("does not accept a pick after the deadline", () => {
    const state = start(mc, 61);
    const late = sessionReducer(state, { type: "choose", index: 0, ...at(61_000) });
    expect(late.status).toBe("finished");
    expect(late.attempts).toHaveLength(0);
  });

  it("does not accept a pick while paused", () => {
    const paused = sessionReducer(start(mc, 62), { type: "pause", ...at(1_000) });
    expect(sessionReducer(paused, { type: "choose", index: 0, ...at(2_000) })).toBe(paused);
  });

  it("stops at the question limit right after the final pick", () => {
    let state = start({ ...mc, mode: "untimed", questionLimit: 2 }, 63);
    state = sessionReducer(state, { type: "choose", index: 0, ...at(1_000) });
    state = sessionReducer(state, { type: "advance", ...at(1_800) });
    state = sessionReducer(state, { type: "choose", index: 1, ...at(3_000) });
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("limit");
    expect(state.attempts).toHaveLength(2);
  });

  it("scores multiple-choice sessions with the unchanged formula", () => {
    let state = start({ ...mc, durationMinutes: 2 }, 64);
    for (let i = 0; i < 4; i += 1) {
      const pick = i === 1 ? state.choices!.options.findIndex((o) => o.tag !== null) : state.choices!.correctIndex;
      state = sessionReducer(state, { type: "choose", index: pick, ...at(10_000 * (i + 1)) });
      state = sessionReducer(state, { type: "advance", ...at(10_000 * (i + 1) + 500) });
    }
    const done = sessionReducer(state, { type: "tick", ...at(120_000) });
    const summary = summarizeSession(done, T0 + 120_000);
    expect(summary.attempted).toBe(4);
    expect(summary.correct).toBe(3);
    expect(summary.incorrect).toBe(1);
    expect(summary.netScorePerMinute).toBeCloseTo(1);
    expect(summary.correctPerMinute).toBeCloseTo(1.5);
    expect(summary.settings.answerFormat).toBe("multiple-choice");
  });

  it("is deterministic for a seed, options included", () => {
    const a = start(mc, 99);
    const b = start(mc, 99);
    expect(a.choices?.options.map((o) => o.text)).toEqual(b.choices?.options.map((o) => o.text));
    expect(a.choices?.correctIndex).toBe(b.choices?.correctIndex);
  });
});
