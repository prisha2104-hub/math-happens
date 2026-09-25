"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccuracyBars } from "@/components/charts/AccuracyBars";
import { TrendChart, TrendLegend } from "@/components/charts/TrendChart";
import { ResultsScreen } from "@/components/results/ResultsScreen";
import { EmptyState, PageShell, SectionHeading } from "@/components/shell/PageShell";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { useHistory } from "@/hooks/useHistory";
import { type Stats, buildOverview, filterAttempts, filterSessions } from "@/lib/analysis/aggregate";
import { facetLabel } from "@/lib/analysis/facets";
import { compareRecent, sessionTrend } from "@/lib/analysis/trends";
import { analyzeWeaknesses } from "@/lib/analysis/weakness";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  OPERATIONS,
  OPERATION_LABELS,
  OPERATION_SYMBOLS,
} from "@/lib/engine/types";
import { formatDuration, formatPercent } from "@/lib/math/format";
import { ANSWER_FORMATS, ANSWER_FORMAT_LABELS, type AnswerFormat, type SessionSummary } from "@/lib/session/types";
import { DEFAULT_FILTERS, FilterBar, type FilterState, toHistoryFilters } from "./FilterBar";
import { SessionsTable } from "./SessionsTable";
import { WeaknessList } from "./WeaknessList";

function formatRate(value: number): string {
  const text = value.toFixed(1);
  return value > 0 ? `+${text}` : text;
}

function deltaText(delta: number | null, format: (v: number) => string, betterWhenLower = false): string | undefined {
  if (delta === null || Math.abs(delta) < 1e-9) return delta === null ? undefined : "no change vs previous 5";
  const improving = betterWhenLower ? delta < 0 : delta > 0;
  return `${improving ? "▲ better" : "▼ worse"} · ${delta > 0 ? "+" : ""}${format(delta)} vs previous 5 sessions`;
}

/**
 * Show one figure when a single answer format is present, otherwise one per
 * format: recognising an answer and producing one are different skills and
 * are never blended into a single number.
 */
function FormatAware({ label, byFormat, pick, hint }: { label: string; byFormat: Partial<Record<AnswerFormat, Stats>>; pick: (s: Stats) => string; hint?: string }) {
  const present = ANSWER_FORMATS.filter((f) => (byFormat[f]?.attempts ?? 0) > 0);
  if (present.length <= 1) {
    const only = present[0];
    return <Stat label={label} value={only ? pick(byFormat[only] as Stats) : "—"} hint={hint} />;
  }
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {present.map((f) => (
          <span key={f} className="tabular font-mono text-xl leading-none tracking-tight text-ink">
            {pick(byFormat[f] as Stats)} <span className="font-sans text-[11px] text-muted">{f === "open" ? "open" : "choice"}</span>
          </span>
        ))}
      </div>
      <span className="text-xs text-muted">kept separate by answer format</span>
    </div>
  );
}

export function HistoryPage() {
  const { sessions, attempts, status, loadedAt } = useHistory();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [open, setOpen] = useState<SessionSummary | null>(null);

  const view = useMemo(() => {
    const historyFilters = toHistoryFilters(filters, loadedAt);
    const filteredAttempts = filterAttempts(attempts, historyFilters);
    const filteredSessions = filterSessions(sessions, historyFilters);
    const overview = buildOverview(filteredAttempts, filteredSessions);
    const trend = sessionTrend(filteredSessions);
    return {
      attempts: filteredAttempts,
      sessions: filteredSessions,
      overview,
      trend,
      score: compareRecent(trend, "netScorePerMinute"),
      speed: compareRecent(trend, "averageResponseMs"),
      weakness: analyzeWeaknesses(filteredAttempts, { now: loadedAt }),
    };
  }, [attempts, sessions, filters, loadedAt]);

  if (open) {
    const sessionAttempts = attempts.filter((a) => a.sessionId === open.id);
    return (
      <PageShell width="narrow">
        <ResultsScreen
          summary={open}
          attempts={sessionAttempts}
          title="Session review"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
              Back to history
            </Button>
          }
        />
      </PageShell>
    );
  }

  const lede = "How you are performing, where you struggle, and whether it is changing.";

  if (status === "loading") {
    return (
      <PageShell title="History" lede={lede}>
        <p className="text-sm text-muted">Loading your sessions…</p>
      </PageShell>
    );
  }

  if (sessions.length === 0) {
    return (
      <PageShell title="History" lede={lede}>
        <EmptyState
          title="No sessions yet"
          action={
            <Link href="/" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-strong">
              Start training
            </Link>
          }
        >
          Finish a session and it will appear here with its accuracy, speed and the patterns behind any misses. Nothing is shown until it has actually happened.
        </EmptyState>
      </PageShell>
    );
  }

  const { overview, trend, weakness } = view;
  const formatsPresent = ANSWER_FORMATS.filter((f) => (overview.byAnswerFormat[f]?.attempts ?? 0) > 0);
  const facetRows = Object.entries(overview.byFacet)
    .filter(([, s]) => (s as Stats).attempts >= 3)
    .map(([facet, s]) => {
      const sample = view.attempts.find((a) => a.meta.variant.startsWith(facet)) ?? view.attempts[0];
      return { key: facet, label: sample ? facetLabel(facet, sample.numberType, sample.operation) : facet, stats: s as Stats };
    })
    .sort((a, b) => a.stats.accuracy - b.stats.accuracy || b.stats.attempts - a.stats.attempts)
    .slice(0, 8);

  return (
    <PageShell title="History" lede={lede}>
      <FilterBar value={filters} onChange={setFilters} />

      {view.attempts.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing matches these filters">Loosen the filters to see sessions and answers again.</EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Totals">
            <Stat label="Sessions" value={overview.sessions} />
            <Stat label="Questions" value={overview.questions} />
            <FormatAware label="Accuracy" byFormat={overview.byAnswerFormat} pick={(s) => formatPercent(s.accuracy)} hint={`${overview.overall.correct} of ${overview.overall.attempts} correct`} />
            <FormatAware
              label="Avg response"
              byFormat={overview.byAnswerFormat}
              pick={(s) => formatDuration(s.averageResponseMs)}
              hint={`median ${formatDuration(overview.overall.medianResponseMs)}`}
            />
          </section>

          <section className="mt-8" aria-label="Trends">
            <SectionHeading hint={trend.length < 2 ? "Trends need at least two sessions." : "One point per session, oldest to newest."} actions={<TrendLegend formats={formatsPresent} />}>
              Am I improving?
            </SectionHeading>
            {trend.length >= 2 && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Net score per minute</h3>
                    <span className="text-xs text-muted">{deltaText(view.score.delta, (v) => formatRate(v).replace("+", ""))}</span>
                  </div>
                  <TrendChart
                    ariaLabel="Net score per minute by session"
                    data={trend.map((p) => ({ id: p.sessionId, at: p.endedAt, value: p.netScorePerMinute, answerFormat: p.answerFormat, weight: p.attempted }))}
                    format={(v) => formatRate(v)}
                  />
                </div>
                <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Average response time</h3>
                    <span className="text-xs text-muted">{deltaText(view.speed.delta, (v) => formatDuration(Math.abs(v)), true)}</span>
                  </div>
                  <TrendChart
                    ariaLabel="Average response time by session"
                    data={trend.map((p) => ({ id: p.sessionId, at: p.endedAt, value: p.averageResponseMs, answerFormat: p.answerFormat, weight: p.attempted }))}
                    format={(v) => formatDuration(v)}
                    invert
                  />
                </div>
              </div>
            )}
          </section>

          <section className="mt-8" aria-label="Breakdowns">
            <SectionHeading hint="Bars show accuracy; the tick marks your overall accuracy in this selection. Groups with few answers are faded.">
              Where am I weakest?
            </SectionHeading>
            <div className="grid gap-3 md:grid-cols-2">
              <AccuracyBars
                title="By operation"
                reference={overview.overall.accuracy}
                rows={OPERATIONS.map((op) => ({ key: op, label: OPERATION_LABELS[op], glyph: OPERATION_SYMBOLS[op], stats: overview.byOperation[op] ?? emptyStats() }))}
              />
              <AccuracyBars
                title="By number type"
                reference={overview.overall.accuracy}
                rows={NUMBER_TYPES.map((t) => ({ key: t, label: NUMBER_TYPE_LABELS[t], stats: overview.byNumberType[t] ?? emptyStats() }))}
              />
              <AccuracyBars
                title="By difficulty"
                reference={overview.overall.accuracy}
                rows={DIFFICULTIES.map((d) => ({ key: d, label: DIFFICULTY_LABELS[d], stats: overview.byDifficulty[d] ?? emptyStats() }))}
              />
              <AccuracyBars
                title="By answer format"
                rows={ANSWER_FORMATS.map((f) => ({ key: f, label: ANSWER_FORMAT_LABELS[f], stats: overview.byAnswerFormat[f] ?? emptyStats() }))}
              />
              <div className="md:col-span-2">
                {facetRows.length > 0 ? (
                  <AccuracyBars title="Specific skills with 3+ answers, least accurate first" reference={overview.overall.accuracy} rows={facetRows} />
                ) : (
                  <div className="rounded-xl border border-line bg-surface px-4 py-3.5 text-sm text-muted">
                    Skill-level accuracy appears once a specific kind of question has been answered at least three times.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mt-8" aria-label="Patterns">
            <SectionHeading hint="Ranked by recent misses, slowness against comparable questions and repeated mistakes. Nothing is promoted without enough attempts.">
              What am I struggling with?
            </SectionHeading>
            <WeaknessList weaknesses={weakness.weaknesses} watchlist={weakness.watchlist} overallAccuracy={weakness.overallAccuracy} />
            {weakness.weaknesses.length > 0 && weakness.watchlist.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                {weakness.watchlist.length} more {weakness.watchlist.length === 1 ? "area has" : "areas have"} a miss but too few attempts to judge.
              </p>
            )}
          </section>

          <section className="mt-8" aria-label="Recent sessions">
            <SectionHeading hint="Open any session to see every question, answer and response time.">Recent sessions</SectionHeading>
            <SessionsTable sessions={view.sessions} onOpen={setOpen} />
          </section>
        </>
      )}
    </PageShell>
  );
}

function emptyStats(): Stats {
  return { attempts: 0, correct: 0, incorrect: 0, accuracy: 0, averageResponseMs: 0, medianResponseMs: 0 };
}
