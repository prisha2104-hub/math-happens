"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatClock } from "@/lib/math/format";
import { ANSWER_FORMATS, ANSWER_FORMAT_LABELS, type AnswerFormat, type SessionMode } from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";

export interface SessionOptionsValue {
  mode: SessionMode;
  durationMinutes: number;
  questionLimit: number;
  answerFormat: AnswerFormat;
}

const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 10];
const LIMITS = [10, 20, 30, 50];

/** Compact timing and answer-format controls for Improve sessions. */
export function SessionOptions({ value, onChange }: { value: SessionOptionsValue; onChange: (next: SessionOptionsValue) => void }) {
  const set = (patch: Partial<SessionOptionsValue>) => onChange({ ...value, ...patch });
  const chip = (selected: boolean) =>
    cx(
      "tabular h-8 min-w-8 rounded-md border px-2 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      selected ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink",
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Mode"
          value={value.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: "timed", label: "Timed" },
            { value: "untimed", label: "Untimed" },
          ]}
        />
        <SegmentedControl
          label="Answer format"
          value={value.answerFormat}
          onChange={(answerFormat) => set({ answerFormat })}
          options={ANSWER_FORMATS.map((f) => ({ value: f, label: ANSWER_FORMAT_LABELS[f] }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={value.mode === "timed" ? "Duration in minutes" : "Question limit"}>
        {value.mode === "timed"
          ? DURATIONS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={value.durationMinutes === m} aria-label={`${m} minute${m === 1 ? "" : "s"}`} onClick={() => set({ durationMinutes: m })} className={chip(value.durationMinutes === m)}>
                {m}
              </button>
            ))
          : LIMITS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={value.questionLimit === n} aria-label={`${n} questions`} onClick={() => set({ questionLimit: n })} className={chip(value.questionLimit === n)}>
                {n}
              </button>
            ))}
        <span className="ml-1 text-xs text-muted">
          {value.mode === "timed" ? (
            <>
              min · <span className="tabular font-mono text-ink">{formatClock(value.durationMinutes * 60_000)}</span>
            </>
          ) : (
            "questions"
          )}
        </span>
      </div>
    </div>
  );
}
