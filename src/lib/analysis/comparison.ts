import { type AdvancedSettings, activeNumberTypes, activeOperations } from "@/lib/engine/advanced";
import { FINANCE_SUBTYPES } from "@/lib/engine/finance";
import type { TargetSpec } from "@/lib/engine/targeted";
import { NUMBER_TYPES, NUMBER_TYPE_LABELS, OPERATIONS, OPERATION_LABELS, isArithmetic } from "@/lib/engine/types";
import { medianOf } from "@/lib/session/scoring";
import type { Attempt, SessionSummary, TrainerSettings } from "@/lib/session/types";
import { facetLabel, facetOf } from "./facets";

/**
 * Comparing a finished session against earlier ones is only honest when the
 * two asked for the same work. This module decides which sessions count as
 * the same setup, then reports how the latest one did against them.
 */

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Everything that changes what a session asks of the user, in a stable order.
 * Fields the engine ignores for a given setup are left out so they cannot
 * split an otherwise identical history: the question limit does nothing in a
 * timed session, the duration does nothing in an untimed one, and the
 * advanced ranges only matter for the operations and formats actually in use.
 */
function advancedSignature(advanced: AdvancedSettings): string {
  if (!advanced.enabled) return "off";
  const operations = activeOperations(advanced);
  const numberTypes = activeNumberTypes(advanced);
  const mix = [
    ...OPERATIONS.map((op) => `${op}=${advanced.operationMix[op]}`),
    ...NUMBER_TYPES.map((type) => `${type}=${advanced.formatMix[type]}`),
  ].join(",");
  // Operand ranges drive integer questions only, fraction ranges fraction ones.
  const ranges = numberTypes.includes("integer")
    ? operations
        .filter(isArithmetic)
        .map((op) => `${op}:${advanced.operandRanges[op].min}-${advanced.operandRanges[op].max}`)
        .concat(advanced.multiplicationSecondRange ? [`mul2:${advanced.multiplicationSecondRange.min}-${advanced.multiplicationSecondRange.max}`] : [])
        .join(",")
    : "";
  const fractions = numberTypes.includes("fraction")
    ? `${advanced.fractionRanges.numerator.min}-${advanced.fractionRanges.numerator.max}/${advanced.fractionRanges.denominator.min}-${advanced.fractionRanges.denominator.max}`
    : "";
  // Finance settings only matter when finance questions are being asked, and
  // then the families, value style, rounding and exact/estimate choice all
  // change what is being practised.
  const finance =
    (advanced.operationMix.finance ?? 0) > 0
      ? [
          FINANCE_SUBTYPES.map((subtype) => `${subtype}=${advanced.finance.subtypeMix[subtype]}`).join(","),
          advanced.finance.valueStyle,
          advanced.finance.answerStyle,
          `r${advanced.finance.rounding}`,
          `${advanced.finance.amountRange.min}-${advanced.finance.amountRange.max}`,
        ].join("/")
      : "";
  return ["on", mix, ranges, fractions, finance].join(";");
}

/**
 * Two sessions are comparable when this key matches. Improve sessions are
 * kept apart from Train sessions because their questions are drawn from a
 * plan built out of the user's weak spots rather than evenly from the
 * selection; they are compared with each other, since the plan is derived
 * from history rather than chosen as a setting.
 */
export function comparabilityKey(settings: TrainerSettings): string {
  const advanced = settings.advanced.enabled;
  const operations = (advanced ? activeOperations(settings.advanced) : OPERATIONS.filter((op) => settings.operations.includes(op))).join(",");
  const numberTypes = (advanced ? activeNumberTypes(settings.advanced) : NUMBER_TYPES.filter((t) => settings.numberTypes.includes(t))).join(",");
  const length = settings.mode === "timed" ? `min=${settings.durationMinutes}` : `limit=${settings.questionLimit ?? "open"}`;
  return [
    settings.plan ? "improve" : "train",
    settings.mode,
    length,
    settings.difficulty,
    settings.answerFormat,
    `ops=${operations}`,
    `nums=${numberTypes}`,
    `adv=${advancedSignature(settings.advanced)}`,
  ].join("|");
}

/**
 * How long the session took, but only where that is a comparable figure: the
 * workload has to be fixed in advance (an untimed session with a question
 * limit) and the session has to have finished it. A timed session always
 * takes its full length, and an open-ended one stops wherever the user chose,
 * so neither says anything when put side by side.
 */
export function completionTimeMs(summary: SessionSummary): number | null {
  const { mode, questionLimit } = summary.settings;
  if (mode !== "untimed" || questionLimit === null) return null;
  // Records written by older builds, or edited by hand, may be missing any of
  // this; a figure is only used when it is actually there.
  if (summary.endReason !== "limit" || !isFiniteNumber(summary.attempted) || summary.attempted < questionLimit) return null;
  return isFiniteNumber(summary.elapsedMs) && summary.elapsedMs > 0 ? summary.elapsedMs : null;
}

/** Correct answers per minute: the speed measure that survives when completion time cannot be compared. */
function paceOf(summary: SessionSummary): number | null {
  if (!isFiniteNumber(summary.attempted) || summary.attempted <= 0) return null;
  if (!isFiniteNumber(summary.elapsedMs) || summary.elapsedMs <= 0) return null;
  return isFiniteNumber(summary.correctPerMinute) ? summary.correctPerMinute : null;
}

function accuracyOf(summary: SessionSummary): number | null {
  if (!isFiniteNumber(summary.attempted) || summary.attempted <= 0) return null;
  return isFiniteNumber(summary.accuracy) ? summary.accuracy : null;
}

/**
 * Median time per correct answer. Sessions recorded before this figure was
 * kept simply do not have it, and are left out rather than counted as zero.
 */
function medianCorrectOf(summary: SessionSummary): number | null {
  const value = summary.medianCorrectResponseMs;
  return isFiniteNumber(value) && value > 0 ? value : null;
}

export interface MetricComparison {
  /** This session's figure. */
  current: number;
  /** Mean over the matching previous sessions that have this figure. */
  previousAverage: number;
  /** Best of those previous sessions (highest or lowest, whichever is better for the metric). */
  previousBest: number;
  /** current − previousAverage. Negative is an improvement for times. */
  delta: number;
  /** How many previous sessions the average and best came from. */
  samples: number;
}

function compareMetric(current: number | null, previous: readonly (number | null)[], higherIsBetter: boolean): MetricComparison | null {
  if (current === null) return null;
  const values = previous.filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    current,
    previousAverage: average,
    previousBest: higherIsBetter ? Math.max(...values) : Math.min(...values),
    delta: current - average,
    samples: values.length,
  };
}

export type WeakestScope = "skill" | "topic";

export interface WeakestArea {
  /** "skill" is a specific kind of question, "topic" an operation on a number type. */
  scope: WeakestScope;
  label: string;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  /** What to practise to work on it, for a direct link into Improve. */
  target: TargetSpec | null;
}

/** A kind of question that is being answered correctly but slowly. */
export interface SlowestArea {
  scope: WeakestScope;
  label: string;
  /** Correct answers the figure is based on. */
  correct: number;
  /** Median time per correct answer in this group. */
  medianMs: number;
  /** Median time per correct answer everywhere else in scope. */
  elsewhereMs: number;
  /** medianMs ÷ elsewhereMs. */
  ratio: number;
  target: TargetSpec | null;
}

/** Why no weakest area could be named. */
export type WeakestReason = "too-few-answers" | "no-misses" | "nothing-stands-out";

export interface WeakestResult {
  area: WeakestArea | null;
  reason: WeakestReason | null;
}

/** Answers one kind of question needs before it can be called the weakest. */
export const WEAKEST_MIN_ATTEMPTS = 4;

interface Group {
  scope: WeakestScope;
  label: string;
  attempts: Attempt[];
}

/** A practice target for the group, taken from one of its questions. */
function targetOfGroup(group: Group): TargetSpec | null {
  const sample = group.attempts[0];
  if (!sample) return null;
  return {
    numberType: sample.numberType,
    operation: sample.operation,
    difficulty: sample.difficulty,
    facet: group.scope === "skill" ? facetOf(sample.meta.variant) : null,
  };
}

function groupsOf(attempts: readonly Attempt[], scope: WeakestScope): Group[] {
  const map = new Map<string, Group>();
  for (const attempt of attempts) {
    const facet = facetOf(attempt.meta.variant);
    const key = scope === "skill" ? `${attempt.numberType}/${attempt.operation}/${facet}` : `${attempt.numberType}/${attempt.operation}`;
    const label =
      scope === "skill" ? facetLabel(facet, attempt.numberType, attempt.operation) : `${NUMBER_TYPE_LABELS[attempt.numberType]} · ${OPERATION_LABELS[attempt.operation].toLowerCase()}`;
    const group = map.get(key) ?? { scope, label, attempts: [] };
    group.attempts.push(attempt);
    map.set(key, group);
  }
  return [...map.values()];
}

function rank(groups: Group[], overallAccuracy: number, minAttempts: number): WeakestArea | null {
  // With a single group there is nothing to be weakest against: the figure
  // would just be the overall accuracy under another name.
  if (groups.length < 2) return null;
  const scored = groups
    .map((group) => {
      const correct = group.attempts.filter((a) => a.correct).length;
      return {
        scope: group.scope,
        label: group.label,
        attempts: group.attempts.length,
        correct,
        incorrect: group.attempts.length - correct,
        accuracy: correct / group.attempts.length,
        target: targetOfGroup(group),
      };
    })
    .filter((g) => g.attempts >= minAttempts && g.incorrect > 0 && g.accuracy < overallAccuracy);
  scored.sort((a, b) => a.accuracy - b.accuracy || b.incorrect - a.incorrect || b.attempts - a.attempts);
  return scored[0] ?? null;
}

/** Correct answers the slow figure needs before it is worth naming. */
export const SLOWEST_MIN_CORRECT = 3;
/** How much slower than the rest a group has to be to count as slow. */
export const SLOWEST_RATIO = 1.3;

function rankSlow(groups: Group[], allCorrect: readonly Attempt[]): SlowestArea | null {
  if (groups.length < 2) return null;
  const candidates: SlowestArea[] = [];
  for (const group of groups) {
    const correct = group.attempts.filter((a) => a.correct);
    if (correct.length < SLOWEST_MIN_CORRECT) continue;
    const ids = new Set(correct.map((a) => a.id));
    // Compared with the other correct answers in scope, not with its own.
    const elsewhere = allCorrect.filter((a) => !ids.has(a.id)).map((a) => a.responseMs);
    const own = medianOf(correct.map((a) => a.responseMs));
    const rest = medianOf(elsewhere);
    if (own === null || rest === null || rest <= 0 || elsewhere.length < SLOWEST_MIN_CORRECT) continue;
    const ratio = own / rest;
    if (ratio < SLOWEST_RATIO) continue;
    candidates.push({ scope: group.scope, label: group.label, correct: correct.length, medianMs: own, elsewhereMs: rest, ratio, target: targetOfGroup(group) });
  }
  candidates.sort((a, b) => b.ratio - a.ratio || b.correct - a.correct);
  return candidates[0] ?? null;
}

/**
 * The kind of question that is answered correctly but noticeably slower than
 * the rest — worth practising even though nothing is being missed. Medians are
 * used so one long pause cannot invent a weakness.
 */
export function slowestArea(attempts: readonly Attempt[]): SlowestArea | null {
  const allCorrect = attempts.filter((a) => a.correct);
  if (allCorrect.length < SLOWEST_MIN_CORRECT * 2) return null;
  return rankSlow(groupsOf(attempts, "skill"), allCorrect) ?? rankSlow(groupsOf(attempts, "topic"), allCorrect);
}

/**
 * The kind of question these answers went worst on. A specific skill is
 * preferred ("Two-digit divisors"); when no single skill has been answered
 * enough times the coarser topic ("Integers · division") is used instead.
 * Nothing is named without `minAttempts` answers, at least one miss, and a
 * result below the average of the answers it is drawn from.
 */
export function weakestArea(attempts: readonly Attempt[], { minAttempts = WEAKEST_MIN_ATTEMPTS }: { minAttempts?: number } = {}): WeakestResult {
  if (attempts.length === 0) return { area: null, reason: "too-few-answers" };
  const correct = attempts.filter((a) => a.correct).length;
  if (correct === attempts.length) return { area: null, reason: "no-misses" };
  const overall = correct / attempts.length;

  const skills = groupsOf(attempts, "skill");
  const topics = groupsOf(attempts, "topic");
  const area = rank(skills, overall, minAttempts) ?? rank(topics, overall, minAttempts);
  if (area) return { area, reason: null };
  const biggest = Math.max(...topics.map((g) => g.attempts.length));
  return { area: null, reason: biggest < minAttempts ? "too-few-answers" : "nothing-stands-out" };
}

/** Figures on which this session beat every matching session before it. */
export type PersonalBest = "accuracy" | "time" | "speed";

export interface SessionComparison {
  /** The settings signature the matching was done on. */
  key: string;
  /** Matching sessions that finished before this one, newest first. */
  previous: SessionSummary[];
  accuracy: MetricComparison | null;
  /** Only present when the workload was fixed and finished, in both this session and at least one previous one. */
  completionTime: MetricComparison | null;
  /** Correct answers per minute. */
  pace: MetricComparison | null;
  /** Median time per correct answer — speed that rushing cannot flatter. */
  medianCorrect: MetricComparison | null;
  /** Previous sessions that have no median-correct figure because they predate it. */
  medianCorrectMissing: number;
  weakest: WeakestResult;
  /** Answered correctly but slowly. */
  slowest: SlowestArea | null;
  /** How many sessions' answers the weakest and slowest areas were drawn from, this one included. */
  weakestSessions: number;
  /** Answers those areas were drawn from. */
  weakestAttempts: number;
  /** Matching sessions left out of the time figures because they were not run to the end. */
  timingExcluded: number;
  personalBests: PersonalBest[];
  /** True when the session stopped because the clock ran out, so a last question may be unanswered. */
  endedOnTimer: boolean;
}

export interface CompareSessionInput {
  summary: SessionSummary;
  /** Answers from the session being summarised. */
  attempts: readonly Attempt[];
  /** Stored sessions. The session being summarised is ignored if it is already among them. */
  history: readonly SessionSummary[];
  /**
   * Answers from matching previous sessions. May cover only the most recent
   * of them; `weakestSessions` reports how many actually contributed.
   */
  previousAttempts?: readonly Attempt[];
}

/** The parts of a session that decide which other sessions it is measured against. */
export interface SessionIdentity {
  id: string;
  /** Epoch ms the session ended. */
  endedAt: number;
  key: string;
}

export function sessionIdentity(summary: SessionSummary): SessionIdentity {
  return { id: summary.id, endedAt: summary.endedAt, key: comparabilityKey(summary.settings) };
}

/**
 * Sessions with the same settings that ended before this one, newest first.
 * Sessions that ended at or after it are excluded, so reopening an old
 * session from history shows the comparison as it stood then rather than one
 * that keeps changing underneath it.
 */
export function previousMatchingFor({ id, endedAt, key }: SessionIdentity, history: readonly SessionSummary[]): SessionSummary[] {
  return history
    .filter((s) => s.id !== id && isFiniteNumber(s.endedAt) && s.endedAt < endedAt && comparabilityKey(s.settings) === key)
    .sort((a, b) => b.endedAt - a.endedAt);
}

export function previousMatching(summary: SessionSummary, history: readonly SessionSummary[]): SessionSummary[] {
  return previousMatchingFor(sessionIdentity(summary), history);
}

/** Is the current figure better than the best of the previous ones? */
function isBest(metric: MetricComparison | null, higherIsBetter: boolean): boolean {
  if (metric === null) return false;
  return higherIsBetter ? metric.current > metric.previousBest : metric.current < metric.previousBest;
}

/** Compare a finished session with the earlier ones that used the same settings. */
export function compareSession({ summary, attempts, history, previousAttempts = [] }: CompareSessionInput): SessionComparison {
  const previous = previousMatching(summary, history);
  const current = completionTimeMs(summary);
  const previousTimes = previous.map(completionTimeMs);
  const previousMedians = previous.map(medianCorrectOf);

  const scopeIds = new Set(previousAttempts.map((a) => a.sessionId));
  scopeIds.add(summary.id);
  const scope = [...attempts, ...previousAttempts];

  const accuracy = compareMetric(accuracyOf(summary), previous.map(accuracyOf), true);
  const completionTime = compareMetric(current, previousTimes, false);
  const medianCorrect = compareMetric(medianCorrectOf(summary), previousMedians, false);
  const personalBests: PersonalBest[] = [];
  if (isBest(accuracy, true)) personalBests.push("accuracy");
  if (isBest(completionTime, false)) personalBests.push("time");
  if (isBest(medianCorrect, false)) personalBests.push("speed");

  return {
    key: comparabilityKey(summary.settings),
    previous,
    accuracy,
    completionTime,
    pace: compareMetric(paceOf(summary), previous.map(paceOf), true),
    medianCorrect,
    medianCorrectMissing: medianCorrectOf(summary) === null ? 0 : previousMedians.filter((value) => value === null).length,
    weakest: weakestArea(scope),
    slowest: slowestArea(scope),
    weakestSessions: scopeIds.size,
    weakestAttempts: scope.length,
    timingExcluded: current === null ? 0 : previousTimes.filter((t) => t === null).length,
    personalBests,
    endedOnTimer: summary.endReason === "timer",
  };
}
