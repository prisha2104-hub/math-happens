import type { AnswerFormat, Attempt, SessionSummary } from "@/lib/session/types";

export interface TrendPoint {
  sessionId: string;
  endedAt: number;
  answerFormat: AnswerFormat;
  attempted: number;
  accuracy: number;
  averageResponseMs: number;
  netScorePerMinute: number;
  correctPerMinute: number;
}

/** One point per session with at least one answer, oldest first. */
export function sessionTrend(sessions: readonly SessionSummary[]): TrendPoint[] {
  return [...sessions]
    .filter((s) => s.attempted > 0)
    .sort((a, b) => a.endedAt - b.endedAt)
    .map((s) => ({
      sessionId: s.id,
      endedAt: s.endedAt,
      answerFormat: s.settings.answerFormat,
      attempted: s.attempted,
      accuracy: s.accuracy,
      averageResponseMs: s.averageResponseMs,
      netScorePerMinute: s.netScorePerMinute,
      correctPerMinute: s.correctPerMinute,
    }));
}

export interface Comparison {
  /** Mean over the most recent `window` points. */
  recent: number | null;
  /** Mean over the `window` points before those. */
  previous: number | null;
  /** recent − previous, null when either side is missing. */
  delta: number | null;
}

/** Compare the latest sessions with the ones before them for one metric. */
export function compareRecent(points: readonly TrendPoint[], metric: keyof Pick<TrendPoint, "accuracy" | "averageResponseMs" | "netScorePerMinute">, window = 5): Comparison {
  const recent = points.slice(-window);
  const previous = points.slice(-window * 2, -window);
  const mean = (list: readonly TrendPoint[]) => (list.length === 0 ? null : list.reduce((s, p) => s + p[metric], 0) / list.length);
  const r = mean(recent);
  const p = mean(previous);
  return { recent: r, previous: p, delta: r !== null && p !== null ? r - p : null };
}

export interface DailyPoint {
  /** Local calendar day as YYYY-MM-DD. */
  day: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Attempts per local day, oldest first. */
export function dailyActivity(attempts: readonly Attempt[]): DailyPoint[] {
  const days = new Map<string, { attempts: number; correct: number }>();
  for (const a of attempts) {
    const key = dayKey(a.submittedAt);
    const entry = days.get(key) ?? { attempts: 0, correct: 0 };
    entry.attempts += 1;
    if (a.correct) entry.correct += 1;
    days.set(key, entry);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, { attempts: n, correct }]) => ({ day, attempts: n, correct, accuracy: n === 0 ? 0 : correct / n }));
}
