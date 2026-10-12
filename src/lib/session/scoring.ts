import type { NumberType, Operation } from "@/lib/engine/types";
import type { Attempt, Breakdown, SessionMetrics } from "./types";

export function breakdown(attempts: readonly Attempt[]): Breakdown {
  const attempted = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const totalResponse = attempts.reduce((sum, a) => sum + a.responseMs, 0);
  return {
    attempted,
    correct,
    incorrect: attempted - correct,
    accuracy: attempted === 0 ? 0 : correct / attempted,
    averageResponseMs: attempted === 0 ? 0 : totalResponse / attempted,
  };
}

/** Middle value, or the mean of the middle two; null when there is nothing to take. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Whole-session metrics. Per-minute rates use active (unpaused) time and are
 * zero when no time has elapsed, so an empty or instantly-ended session never
 * produces NaN or Infinity.
 *
 * `medianCorrectResponseMs` is the honest speed figure: a median ignores the
 * one question you stared at, and counting only correct answers means racing
 * through wrong ones cannot make you look faster.
 */
export function computeMetrics(attempts: readonly Attempt[], elapsedMs: number): SessionMetrics {
  const base = breakdown(attempts);
  const minutes = elapsedMs / 60_000;
  const safeRate = (count: number) => (minutes > 0 ? count / minutes : 0);
  return {
    ...base,
    elapsedMs,
    correctPerMinute: safeRate(base.correct),
    netScorePerMinute: safeRate(base.correct - base.incorrect),
    medianCorrectResponseMs: medianOf(attempts.filter((a) => a.correct).map((a) => a.responseMs)),
  };
}

function groupBy<K extends string>(attempts: readonly Attempt[], key: (a: Attempt) => K): Partial<Record<K, Breakdown>> {
  const groups = new Map<K, Attempt[]>();
  for (const attempt of attempts) {
    const k = key(attempt);
    const list = groups.get(k);
    if (list) list.push(attempt);
    else groups.set(k, [attempt]);
  }
  const result: Partial<Record<K, Breakdown>> = {};
  for (const [k, list] of groups) result[k] = breakdown(list);
  return result;
}

export function breakdownByOperation(attempts: readonly Attempt[]): Partial<Record<Operation, Breakdown>> {
  return groupBy(attempts, (a) => a.operation);
}

export function breakdownByNumberType(attempts: readonly Attempt[]): Partial<Record<NumberType, Breakdown>> {
  return groupBy(attempts, (a) => a.numberType);
}
