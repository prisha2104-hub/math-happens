"use client";

import type { ReactNode } from "react";
import { Stat } from "@/components/ui/Stat";
import {
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  OPERATIONS,
  OPERATION_LABELS,
  OPERATION_SYMBOLS,
} from "@/lib/engine/types";
import { formatClock, formatDuration, formatPercent } from "@/lib/math/format";
import type { Attempt, EndReason, SessionSummary } from "@/lib/session/types";
import { describeSettings } from "@/components/setup/describeSettings";
import { BreakdownTable } from "./BreakdownTable";
import { ComparisonSummary } from "./ComparisonSummary";
import { HistoryTable } from "./HistoryTable";

export type SaveState = "saving" | "saved" | "failed";

interface ResultsScreenProps {
  summary: SessionSummary;
  attempts: Attempt[];
  /** Omitted for sessions loaded from history. */
  saveState?: SaveState;
  /** Primary and secondary actions shown at the top and bottom. */
  actions: ReactNode;
  /** Override the headline (defaults to the end reason). */
  title?: string;
}

const TITLES: Record<EndReason, string> = {
  timer: "Time's up",
  manual: "Session ended",
  limit: "Limit reached",
};

const SAVE_LABELS: Record<SaveState, string> = {
  saving: "Saving to this browser…",
  saved: "Saved to this browser",
  failed: "Could not save to this browser",
};

function formatRate(value: number): string {
  const text = value.toFixed(1);
  return value > 0 ? `+${text}` : text;
}

export function ResultsScreen({ summary, attempts, saveState, actions, title }: ResultsScreenProps) {
  const empty = summary.attempted === 0;
  const endedAt = new Date(summary.endedAt);
  // Median time per correct answer is the honest speed figure; sessions
  // recorded before it existed show the plain average and say so.
  const median = summary.medianCorrectResponseMs;
  const perAnswer =
    typeof median === "number"
      ? { value: formatDuration(median), hint: "median of correct answers" }
      : { value: formatDuration(summary.averageResponseMs), hint: "average of all answers" };

  const operationRows = OPERATIONS.flatMap((op) => {
    const data = summary.byOperation[op];
    return data ? [{ key: op, label: OPERATION_LABELS[op], glyph: OPERATION_SYMBOLS[op], data }] : [];
  });
  const numberTypeRows = NUMBER_TYPES.flatMap((type) => {
    const data = summary.byNumberType[type];
    return data ? [{ key: type, label: NUMBER_TYPE_LABELS[type], data }] : [];
  });

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl tracking-tight text-ink sm:text-6xl">{title ?? TITLES[summary.endReason]}</h1>
          <p className="mt-3 text-sm text-ink-soft">
            {describeSettings(summary.settings)} ·{" "}
            <time dateTime={endedAt.toISOString()}>{endedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </section>

      {/* Four figures worth reading, with the rest of the counts on one line
          underneath: the breakdown below already carries the detail. */}
      <section className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Session results">
        <Stat label="Accuracy" value={empty ? "—" : formatPercent(summary.accuracy)} hint={empty ? undefined : `${summary.correct} of ${summary.attempted} correct`} />
        <Stat label="Per answer" value={empty ? "—" : perAnswer.value} hint={empty ? undefined : perAnswer.hint} />
        <Stat label="Total time" value={formatClock(summary.elapsedMs)} hint="active time, pauses excluded" />
        <Stat label="Net score / min" value={empty ? "—" : formatRate(summary.netScorePerMinute)} tone="accent" hint="(correct − incorrect) ÷ minutes" />
      </section>
      {!empty && (
        <p className="mt-2 text-xs text-muted">
          {summary.attempted} answered · <span className="text-good">{summary.correct} right</span> ·{" "}
          <span className={summary.incorrect > 0 ? "text-bad" : undefined}>{summary.incorrect} wrong</span> · {summary.correctPerMinute.toFixed(1)} correct per minute · average{" "}
          {formatDuration(summary.averageResponseMs)} per answer
        </p>
      )}

      {empty ? (
        <section className="mt-8 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-display text-2xl text-ink">No questions answered</p>
          <p className="mt-2 text-sm text-muted">Nothing was recorded for this session. Start again whenever you are ready.</p>
        </section>
      ) : (
        <>
          <ComparisonSummary summary={summary} attempts={attempts} />

          <section className="mt-8" aria-label="Breakdown">
            <BreakdownTable
              sections={[
                { title: "By operation", rows: operationRows },
                { title: "By number type", rows: numberTypeRows },
              ]}
            />
          </section>

          <section className="mt-8" aria-label="Question history">
            <HistoryTable attempts={attempts} />
          </section>
        </>
      )}

      <footer className="mt-8 flex flex-col-reverse items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
        <span className="text-xs text-muted" role="status">
          {saveState ? SAVE_LABELS[saveState] : ""}
        </span>
        <div className="flex items-center gap-2">{actions}</div>
      </footer>
    </div>
  );
}
