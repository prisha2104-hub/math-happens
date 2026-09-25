import type { ErrorTag } from "@/lib/choice/types";
import type { Difficulty, NumberType, Operation } from "@/lib/engine/types";
import type { AnswerFormat, Attempt, SessionSummary } from "@/lib/session/types";
import { type FeatureId, facetOf, featuresOf } from "./facets";

export interface HistoryFilters {
  operations?: readonly Operation[];
  numberTypes?: readonly NumberType[];
  difficulties?: readonly Difficulty[];
  answerFormats?: readonly AnswerFormat[];
  /** Only attempts submitted at or after this epoch time. */
  since?: number | null;
}

export function filterAttempts(attempts: readonly Attempt[], filters: HistoryFilters): Attempt[] {
  return attempts.filter(
    (a) =>
      (!filters.operations || filters.operations.includes(a.operation)) &&
      (!filters.numberTypes || filters.numberTypes.includes(a.numberType)) &&
      (!filters.difficulties || filters.difficulties.includes(a.difficulty)) &&
      (!filters.answerFormats || filters.answerFormats.includes(a.answerFormat)) &&
      (filters.since == null || a.submittedAt >= filters.since),
  );
}

export function filterSessions(sessions: readonly SessionSummary[], filters: HistoryFilters): SessionSummary[] {
  return sessions.filter(
    (s) =>
      (!filters.answerFormats || filters.answerFormats.includes(s.settings.answerFormat)) &&
      (!filters.difficulties || filters.difficulties.includes(s.settings.difficulty)) &&
      (!filters.operations || s.settings.operations.some((op) => filters.operations?.includes(op))) &&
      (!filters.numberTypes || s.settings.numberTypes.some((t) => filters.numberTypes?.includes(t))) &&
      (filters.since == null || s.endedAt >= filters.since),
  );
}

export interface Stats {
  attempts: number;
  correct: number;
  incorrect: number;
  /** 0 when nothing was attempted. */
  accuracy: number;
  averageResponseMs: number;
  medianResponseMs: number;
}

export const EMPTY_STATS: Stats = { attempts: 0, correct: 0, incorrect: 0, accuracy: 0, averageResponseMs: 0, medianResponseMs: 0 };

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function stats(attempts: readonly Attempt[]): Stats {
  if (attempts.length === 0) return EMPTY_STATS;
  const correct = attempts.filter((a) => a.correct).length;
  const responses = attempts.map((a) => a.responseMs);
  return {
    attempts: attempts.length,
    correct,
    incorrect: attempts.length - correct,
    accuracy: correct / attempts.length,
    averageResponseMs: responses.reduce((s, r) => s + r, 0) / attempts.length,
    medianResponseMs: median(responses),
  };
}

/** Group attempts by a key (attempts mapping to null are skipped) and compute stats for each group. */
export function groupStats<K extends string>(attempts: readonly Attempt[], key: (a: Attempt) => K | readonly K[] | null): Partial<Record<K, Stats>> {
  const groups = new Map<K, Attempt[]>();
  for (const attempt of attempts) {
    const k = key(attempt);
    if (k === null) continue;
    for (const single of Array.isArray(k) ? (k as readonly K[]) : [k as K]) {
      const list = groups.get(single);
      if (list) list.push(attempt);
      else groups.set(single, [attempt]);
    }
  }
  const out: Partial<Record<K, Stats>> = {};
  for (const [k, list] of groups) out[k] = stats(list);
  return out;
}

export interface Overview {
  sessions: number;
  questions: number;
  overall: Stats;
  byOperation: Partial<Record<Operation, Stats>>;
  byNumberType: Partial<Record<NumberType, Stats>>;
  byDifficulty: Partial<Record<Difficulty, Stats>>;
  byAnswerFormat: Partial<Record<AnswerFormat, Stats>>;
  byFacet: Partial<Record<string, Stats>>;
  byFeature: Partial<Record<FeatureId, Stats>>;
  /** Wrong answers grouped by inferred mistake, counts only. */
  byErrorTag: Partial<Record<ErrorTag, number>>;
}

export function buildOverview(attempts: readonly Attempt[], sessions: readonly SessionSummary[]): Overview {
  const byErrorTag: Partial<Record<ErrorTag, number>> = {};
  for (const a of attempts) if (!a.correct && a.errorTag) byErrorTag[a.errorTag] = (byErrorTag[a.errorTag] ?? 0) + 1;
  return {
    sessions: sessions.length,
    questions: attempts.length,
    overall: stats(attempts),
    byOperation: groupStats(attempts, (a) => a.operation),
    byNumberType: groupStats(attempts, (a) => a.numberType),
    byDifficulty: groupStats(attempts, (a) => a.difficulty),
    byAnswerFormat: groupStats(attempts, (a) => a.answerFormat),
    byFacet: groupStats(attempts, (a) => facetOf(a.meta.variant)),
    byFeature: groupStats(attempts, (a) => featuresOf(a)),
    byErrorTag,
  };
}
