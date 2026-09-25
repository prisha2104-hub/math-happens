import { pickTarget } from "@/lib/adaptive/plan";
import { evaluateAnswer } from "@/lib/answer/validate";
import { buildChoiceSet } from "@/lib/choice/choiceSet";
import { classifyOpenAnswer } from "@/lib/choice/classify";
import type { ChoiceSet } from "@/lib/choice/types";
import { RECENT_KEY_WINDOW, formatOperand, generateQuestion } from "@/lib/engine/generate";
import { createRng } from "@/lib/engine/rng";
import { generateTargetedQuestion } from "@/lib/engine/targeted";
import type { Question } from "@/lib/engine/types";
import type { Rational } from "@/lib/math/rational";
import { generateTechniqueQuestion, techniqueById } from "@/lib/techniques/library";
import { breakdownByNumberType, breakdownByOperation, computeMetrics } from "./scoring";
import {
  type Attempt,
  type ChoiceRecord,
  type EndReason,
  type SessionSummary,
  type TrainerSettings,
  timeLimitMs,
} from "./types";

export type SessionStatus = "running" | "paused" | "finished";

export interface Feedback {
  attemptId: string;
  correct: boolean;
  expression: string;
  correctAnswerText: string;
  userInput: string;
}

/**
 * Complete state of a training session. Time is tracked with two clocks:
 * `now` values are monotonic milliseconds (performance.now()) used for all
 * durations, while `wallClock` values are epoch milliseconds used only to
 * stamp records. Elapsed time is always derived from timestamps, never from
 * counting ticks, so it stays accurate if the tab is throttled.
 */
export interface SessionState {
  id: string;
  settings: TrainerSettings;
  status: SessionStatus;
  rngState: number;
  question: Question | null;
  /** Four options for the current question in multiple-choice sessions. */
  choices: ChoiceSet | null;
  /**
   * Multiple choice only: after an option is picked the question stays on
   * screen with the verdict shown until `advance`. No input is accepted
   * meanwhile, which is what prevents double submission.
   */
  reveal: { selectedIndex: number } | null;
  /** Number of questions generated so far (used for ids). */
  questionCount: number;
  recentKeys: string[];
  attempts: Attempt[];
  startedAt: number;
  endedAt: number | null;
  endReason: EndReason | null;
  /** Active time accumulated before the most recent resume. */
  accumulatedMs: number;
  /** Monotonic timestamp of the most recent resume while running. */
  runningSince: number | null;
  /** Active elapsed time at the moment the current question appeared. */
  questionShownAtElapsed: number;
  lastFeedback: Feedback | null;
  inputError: string | null;
}

export interface Timestamps {
  /** Monotonic milliseconds. */
  now: number;
  /** Epoch milliseconds. */
  wallClock: number;
}

export type SessionAction =
  | ({ type: "pause" } & Timestamps)
  | ({ type: "resume" } & Timestamps)
  | ({ type: "submit"; input: string } & Timestamps)
  | ({ type: "choose"; index: number } & Timestamps)
  | ({ type: "advance" } & Timestamps)
  | ({ type: "tick" } & Timestamps)
  | ({ type: "end" } & Timestamps)
  | { type: "clearInputError" };

export interface CreateSessionOptions extends Timestamps {
  id: string;
  seed: number;
}

/** Active (unpaused) elapsed time, clamped to the time limit for timed sessions. */
export function elapsedMs(state: SessionState, now: number): number {
  const running = state.status === "running" && state.runningSince !== null ? Math.max(0, now - state.runningSince) : 0;
  const total = state.accumulatedMs + running;
  const limit = timeLimitMs(state.settings);
  return limit === null ? total : Math.min(total, limit);
}

/** Time left in a timed session, or null for untimed sessions. */
export function remainingMs(state: SessionState, now: number): number | null {
  const limit = timeLimitMs(state.settings);
  return limit === null ? null : Math.max(0, limit - elapsedMs(state, now));
}

export function isTimeUp(state: SessionState, now: number): boolean {
  const remaining = remainingMs(state, now);
  return remaining !== null && remaining <= 0;
}

type GenerationInput = Pick<SessionState, "id" | "settings" | "rngState" | "questionCount" | "recentKeys">;

function nextQuestion(state: GenerationInput): {
  question: Question;
  choices: ChoiceSet | null;
  rngState: number;
  questionCount: number;
  recentKeys: string[];
} {
  const rng = createRng(state.rngState);
  const questionCount = state.questionCount + 1;
  const id = `${state.id}:q${questionCount}`;
  const plan = state.settings.plan;
  let question: Question;
  if (plan && plan.targets.length > 0) {
    // Improve mode: draw from the plan's weighted targets instead of the plain selection.
    const picked = pickTarget(plan, rng);
    const technique = picked.techniqueId ? techniqueById(picked.techniqueId) : null;
    question = technique
      ? generateTechniqueQuestion(technique, rng, id, state.recentKeys)
      : generateTargetedQuestion({ target: picked.target, rng, id, recentKeys: state.recentKeys });
  } else {
    question = generateQuestion({ settings: state.settings, rng, id, recentKeys: state.recentKeys });
  }
  const choices = state.settings.answerFormat === "multiple-choice" ? buildChoiceSet(question, rng) : null;
  const recentKeys = [...state.recentKeys, question.key].slice(-RECENT_KEY_WINDOW);
  return { question, choices, rngState: rng.state, questionCount, recentKeys };
}

export function createSession(settings: TrainerSettings, { id, seed, now, wallClock }: CreateSessionOptions): SessionState {
  const base = { id, settings, rngState: seed >>> 0, questionCount: 0, recentKeys: [] as string[] };
  const generated = nextQuestion(base);
  return {
    ...base,
    ...generated,
    reveal: null,
    status: "running",
    attempts: [],
    startedAt: wallClock,
    endedAt: null,
    endReason: null,
    accumulatedMs: 0,
    runningSince: now,
    questionShownAtElapsed: 0,
    lastFeedback: null,
    inputError: null,
  };
}

function finish(state: SessionState, reason: EndReason, { now, wallClock }: Timestamps): SessionState {
  if (state.status === "finished") return state;
  return {
    ...state,
    status: "finished",
    accumulatedMs: elapsedMs(state, now),
    runningSince: null,
    question: null,
    choices: null,
    reveal: null,
    endReason: reason,
    endedAt: wallClock,
    inputError: null,
  };
}

interface Answer {
  value: Rational;
  userInput: string;
  correct: boolean;
  choice: ChoiceRecord | null;
}

/** Append an attempt for the current question and return the updated state (question unchanged). */
function recordAttempt(state: SessionState, question: Question, answer: Answer, stamps: Timestamps): { state: SessionState; elapsed: number } {
  const elapsed = elapsedMs(state, stamps.now);
  const selectedTag = answer.choice ? answer.choice.options[answer.choice.selectedIndex]?.tag ?? null : null;
  const attempt: Attempt = {
    id: `${state.id}:a${state.attempts.length + 1}`,
    sessionId: state.id,
    questionId: question.id,
    expression: question.expression,
    operation: question.operation,
    numberType: question.numberType,
    difficulty: question.difficulty,
    correctAnswer: question.answer,
    correctAnswerText: question.answerText,
    userInput: answer.userInput,
    userAnswer: answer.value,
    userAnswerText: formatOperand(answer.value, question.numberType),
    correct: answer.correct,
    responseMs: Math.max(0, elapsed - state.questionShownAtElapsed),
    submittedAt: stamps.wallClock,
    meta: question.meta,
    answerFormat: state.settings.answerFormat,
    choice: answer.choice,
    errorTag: answer.correct ? null : answer.choice ? selectedTag : classifyOpenAnswer(question, answer.value),
  };
  const feedback: Feedback = {
    attemptId: attempt.id,
    correct: attempt.correct,
    expression: question.expression,
    correctAnswerText: question.answerText,
    userInput: attempt.userInput,
  };
  return { state: { ...state, attempts: [...state.attempts, attempt], lastFeedback: feedback, inputError: null }, elapsed };
}

function limitReached(state: SessionState): boolean {
  const { questionLimit, mode } = state.settings;
  return mode === "untimed" && questionLimit !== null && state.attempts.length >= questionLimit;
}

function submit(state: SessionState, input: string, stamps: Timestamps): SessionState {
  if (state.status !== "running" || state.question === null || state.reveal !== null) return state;
  // An answer that lands after the deadline is not counted; the clock wins.
  if (isTimeUp(state, stamps.now)) return finish(state, "timer", stamps);

  const question = state.question;
  const evaluation = evaluateAnswer(question, input);
  if (evaluation.verdict === "invalid") return { ...state, inputError: evaluation.message };

  const recorded = recordAttempt(
    state,
    question,
    { value: evaluation.value, userInput: input.trim(), correct: evaluation.verdict === "correct", choice: null },
    stamps,
  );
  if (limitReached(recorded.state)) return finish(recorded.state, "limit", stamps);
  return { ...recorded.state, ...nextQuestion(recorded.state), questionShownAtElapsed: recorded.elapsed };
}

function choose(state: SessionState, index: number, stamps: Timestamps): SessionState {
  if (state.status !== "running" || state.question === null || state.choices === null || state.reveal !== null) return state;
  if (isTimeUp(state, stamps.now)) return finish(state, "timer", stamps);
  const option = state.choices.options[index];
  if (!option) return state;

  const recorded = recordAttempt(
    state,
    state.question,
    {
      value: option.value,
      userInput: option.text,
      correct: index === state.choices.correctIndex,
      choice: { options: state.choices.options, correctIndex: state.choices.correctIndex, selectedIndex: index },
    },
    stamps,
  );
  if (limitReached(recorded.state)) return finish(recorded.state, "limit", stamps);
  // Keep the question and options on screen so the verdict can be shown.
  return { ...recorded.state, reveal: { selectedIndex: index } };
}

function advance(state: SessionState, stamps: Timestamps): SessionState {
  if (state.status !== "running" || state.reveal === null) return state;
  if (isTimeUp(state, stamps.now)) return finish(state, "timer", stamps);
  return { ...state, ...nextQuestion(state), reveal: null, questionShownAtElapsed: elapsedMs(state, stamps.now) };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "pause":
      if (state.status !== "running") return state;
      if (isTimeUp(state, action.now)) return finish(state, "timer", action);
      return { ...state, status: "paused", accumulatedMs: elapsedMs(state, action.now), runningSince: null };
    case "resume":
      if (state.status !== "paused") return state;
      return { ...state, status: "running", runningSince: action.now, inputError: null };
    case "tick":
      return state.status === "running" && isTimeUp(state, action.now) ? finish(state, "timer", action) : state;
    case "submit":
      return submit(state, action.input, action);
    case "choose":
      return choose(state, action.index, action);
    case "advance":
      return advance(state, action);
    case "end":
      return finish(state, "manual", action);
    case "clearInputError":
      return state.inputError === null ? state : { ...state, inputError: null };
  }
}

/** Summary of a finished (or ending) session for the results screen and storage. */
export function summarizeSession(state: SessionState, now: number): SessionSummary {
  const elapsed = elapsedMs(state, now);
  return {
    id: state.id,
    settings: state.settings,
    startedAt: state.startedAt,
    endedAt: state.endedAt ?? state.startedAt + elapsed,
    endReason: state.endReason ?? "manual",
    ...computeMetrics(state.attempts, elapsed),
    byOperation: breakdownByOperation(state.attempts),
    byNumberType: breakdownByNumberType(state.attempts),
  };
}
