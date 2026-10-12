"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeading } from "@/components/shell/PageShell";
import { type ComparisonStatus, useSessionComparison } from "@/hooks/useSessionComparison";
import type { MetricComparison, PersonalBest, SessionComparison, SlowestArea, WeakestArea, WeakestReason } from "@/lib/analysis/comparison";
import { targetKey } from "@/lib/engine/targeted";
import { formatClock, formatDuration, formatPercent } from "@/lib/math/format";
import type { Attempt, SessionSummary } from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";

interface ComparisonSummaryProps {
  summary: SessionSummary;
  attempts: Attempt[];
}

type Tone = "good" | "bad" | "neutral";

interface Delta {
  text: string;
  tone: Tone;
  /** Secondary phrasing, e.g. the relative change behind a points change. */
  aside?: string;
}

const TONES: Record<Tone, string> = { good: "text-good", bad: "text-bad", neutral: "text-muted" };

const WEAKEST_NOTES: Record<WeakestReason, string> = {
  "too-few-answers": "Not enough answers of any one kind yet — a few more tests will show it.",
  "no-misses": "Nothing missed in these tests.",
  "nothing-stands-out": "Misses are spread evenly; no single kind of question stands out.",
};

const BEST_LABELS: Record<PersonalBest, string> = { accuracy: "accuracy", time: "time", speed: "speed per answer" };

/** Gap between two times, kept short: "45s", "1:20". */
function formatGap(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : formatClock(seconds * 1000);
}

/** Percentage points, taken from the rounded figures so the line adds up as written. */
function accuracyDelta({ current, previousAverage }: MetricComparison): Delta {
  const points = Math.round(current * 100) - Math.round(previousAverage * 100);
  if (points === 0) return { text: "Level with your average", tone: "neutral" };
  // Points and relative change are different things, so both are named.
  const relative = previousAverage > 0 ? Math.round(((current - previousAverage) / previousAverage) * 100) : null;
  return {
    text: `${points > 0 ? "Up" : "Down"} ${Math.abs(points)} percentage point${Math.abs(points) === 1 ? "" : "s"}`,
    tone: points > 0 ? "good" : "bad",
    aside: relative !== null && relative !== 0 ? `${relative > 0 ? "+" : ""}${relative}% relative` : undefined,
  };
}

function timeDelta({ delta }: MetricComparison, unit: "clock" | "duration"): Delta {
  const magnitude = Math.abs(delta);
  if (unit === "clock" ? Math.round(magnitude / 1000) === 0 : magnitude < 50) return { text: "Same as your average", tone: "neutral" };
  const text = unit === "clock" ? formatGap(magnitude) : formatDuration(magnitude);
  return { text: `${text} ${delta < 0 ? "faster" : "slower"}`, tone: delta < 0 ? "good" : "bad" };
}

function paceDelta({ delta }: MetricComparison): Delta {
  const rounded = Number(delta.toFixed(1));
  if (rounded === 0) return { text: "Level with your average", tone: "neutral" };
  return { text: `${rounded > 0 ? "Up" : "Down"} ${Math.abs(rounded).toFixed(1)} per minute`, tone: rounded > 0 ? "good" : "bad" };
}

function Separator() {
  return (
    <span className="text-line-strong" aria-hidden="true">
      ·
    </span>
  );
}

/** One metric as "Accuracy: 85% this test · Previous average 72% · Up 13 percentage points". */
function Row({ label, current, previous, delta }: { label: string; current: string; previous: string; delta: Delta }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3">
      <span className="w-full shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted sm:w-28">{label}</span>
      <span className="tabular font-mono text-xl leading-none tracking-tight text-ink">{current}</span>
      <span className="text-xs text-muted">this test</span>
      <Separator />
      <span className="text-sm text-ink-soft">
        Previous average <span className="tabular font-mono text-ink">{previous}</span>
      </span>
      <Separator />
      <span className={cx("text-sm font-medium", TONES[delta.tone])}>{delta.text}</span>
      {delta.aside && <span className="text-xs text-muted">({delta.aside})</span>}
    </li>
  );
}

function Cell({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="tabular mt-1 font-mono text-lg text-ink">{value}</dd>
      {hint !== undefined && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm leading-relaxed text-ink-soft">{children}</div>;
}

function PractiseLink({ target }: { target: WeakestArea["target"] }) {
  if (!target) return null;
  return (
    <Link
      href={`/improve?target=${encodeURIComponent(targetKey(target))}`}
      className="shrink-0 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Practise
    </Link>
  );
}

function weakestHint(area: WeakestArea): string {
  return `${area.correct} of ${area.attempts} correct · ${formatPercent(area.accuracy)}`;
}

function slowestHint(area: SlowestArea): string {
  return `${formatDuration(area.medianMs)} per correct answer against ${formatDuration(area.elsewhereMs)} elsewhere · ${area.correct} answers`;
}

/** The two "what next" lines: where the misses are, and where the time goes. */
function NextUp({ comparison }: { comparison: SessionComparison }) {
  const { weakest, slowest, weakestSessions, weakestAttempts } = comparison;
  const scope = `from ${weakestAttempts} answer${weakestAttempts === 1 ? "" : "s"} across ${weakestSessions} test${weakestSessions === 1 ? "" : "s"}`;
  return (
    <div className="divide-y divide-line border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Most mistakes</p>
          {weakest.area ? (
            <p className="mt-0.5 text-sm text-ink">
              {weakest.area.label} <span className="text-muted">— {weakestHint(weakest.area)}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">{WEAKEST_NOTES[weakest.reason ?? "too-few-answers"]}</p>
          )}
        </div>
        {weakest.area && <PractiseLink target={weakest.area.target} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Right but slow</p>
          {slowest ? (
            <p className="mt-0.5 text-sm text-ink">
              {slowest.label} <span className="text-muted">— {slowestHint(slowest)}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Nothing is dragging: correct answers take about the same time across these question types.</p>
          )}
        </div>
        {slowest && <PractiseLink target={slowest.target} />}
      </div>
      <p className="px-4 py-2 text-xs text-muted">Both lines are drawn {scope} with these settings.</p>
    </div>
  );
}

function Comparison({ comparison, questionLimit }: { comparison: SessionComparison; questionLimit: number | null }) {
  const { accuracy, completionTime, pace, medianCorrect, medianCorrectMissing, previous, timingExcluded, endedOnTimer } = comparison;
  // Completion time is only comparable for fixed-length tests run to the end;
  // everywhere else the pace carries the same meaning.
  const speed = completionTime
    ? { label: "Time", current: formatClock(completionTime.current), previous: formatClock(completionTime.previousAverage), delta: timeDelta(completionTime, "clock") }
    : pace
      ? { label: "Correct / min", current: pace.current.toFixed(1), previous: pace.previousAverage.toFixed(1), delta: paceDelta(pace) }
      : null;

  return (
    <>
      <div className="rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {accuracy && <Row label="Accuracy" current={formatPercent(accuracy.current)} previous={formatPercent(accuracy.previousAverage)} delta={accuracyDelta(accuracy)} />}
          {speed && <Row label={speed.label} current={speed.current} previous={speed.previous} delta={speed.delta} />}
          {medianCorrect && (
            <Row
              label="Per answer"
              current={formatDuration(medianCorrect.current)}
              previous={formatDuration(medianCorrect.previousAverage)}
              delta={timeDelta(medianCorrect, "duration")}
            />
          )}
        </ul>
        <dl className="grid divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {accuracy && <Cell label="Best previous accuracy" value={formatPercent(accuracy.previousBest)} hint={`from ${accuracy.samples} previous ${accuracy.samples === 1 ? "test" : "tests"}`} />}
          {completionTime ? (
            <Cell
              label="Fastest previous time"
              value={formatClock(completionTime.previousBest)}
              hint={questionLimit === null ? "over the same workload" : `over the same ${questionLimit} questions`}
            />
          ) : medianCorrect ? (
            <Cell
              label="Fastest previous answer"
              value={formatDuration(medianCorrect.previousBest)}
              hint={`median of correct answers · ${medianCorrect.samples} ${medianCorrect.samples === 1 ? "test" : "tests"}`}
            />
          ) : (
            pace && <Cell label="Best previous pace" value={pace.previousBest.toFixed(1)} hint="correct per minute" />
          )}
          <Cell
            label="Compared with"
            value={`${previous.length} test${previous.length === 1 ? "" : "s"}`}
            hint={medianCorrectMissing > 0 ? `${medianCorrectMissing} too old to have a per-answer figure` : "same settings, before this one"}
          />
        </dl>
        <NextUp comparison={comparison} />
      </div>
      {(timingExcluded > 0 || endedOnTimer) && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {timingExcluded > 0 && (
            <>
              {timingExcluded} of your {previous.length} matching {previous.length === 1 ? "test" : "tests"} {timingExcluded === 1 ? "was" : "were"} not run to the end, so{" "}
              {timingExcluded === 1 ? "it is" : "they are"} left out of the time figures.{" "}
            </>
          )}
          {endedOnTimer && <>A question still on screen when the clock ran out is not recorded, so it counts neither right nor wrong.</>}
        </p>
      )}
    </>
  );
}

function Body({ status, comparison, questionLimit }: { status: ComparisonStatus; comparison: SessionComparison | null; questionLimit: number | null }) {
  if (status === "loading" || comparison === null) {
    return status === "error" ? (
      <Panel>Your previous tests could not be read in this browser, so there is nothing to compare against.</Panel>
    ) : (
      <p className="text-sm text-muted">Looking up your previous tests…</p>
    );
  }
  const matched = comparison.previous.length;
  if (matched === 0) {
    return (
      <Panel>
        <p className="text-ink">This is your first finished test with these settings, so it sets the baseline.</p>
        <p className="mt-1 text-muted">Run the same setup again and this panel will compare accuracy, time and speed per answer against it.</p>
        {comparison.weakest.area && (
          <p className="mt-2 text-muted">
            Most mistakes so far: <span className="text-ink">{comparison.weakest.area.label}</span> — {weakestHint(comparison.weakest.area)}.
          </p>
        )}
      </Panel>
    );
  }
  if (comparison.accuracy === null && comparison.completionTime === null && comparison.pace === null) {
    return <Panel>Your {matched === 1 ? "one earlier test" : `${matched} earlier tests`} with these settings recorded no answers, so there is nothing to measure this one against yet.</Panel>;
  }
  return <Comparison comparison={comparison} questionLimit={questionLimit} />;
}

/**
 * How the finished session compares with earlier ones that used the same
 * settings. Only figures the stored history actually supports are shown, and
 * every one says whether it describes this test or the previous ones.
 */
export function ComparisonSummary({ summary, attempts }: ComparisonSummaryProps) {
  const { status, comparison } = useSessionComparison(summary, attempts);
  const matched = comparison?.previous.length ?? 0;
  const bests = comparison?.personalBests ?? [];

  return (
    <section className="mt-8" aria-label="Comparison with previous tests">
      <SectionHeading
        hint={
          matched > 0
            ? `Measured against your ${matched} previous ${matched === 1 ? "test" : "tests"} with the same settings — same operations, finance families, difficulty, ranges, answer mode and test format. Nothing else is mixed in.`
            : "Tests are only compared with earlier ones that used the same settings."
        }
        actions={
          bests.length > 0 ? (
            <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
              Personal best: {bests.map((best) => BEST_LABELS[best]).join(" and ")}
            </span>
          ) : undefined
        }
      >
        How this compares
      </SectionHeading>
      <Body status={status} comparison={comparison} questionLimit={summary.settings.questionLimit} />
    </section>
  );
}
