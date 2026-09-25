"use client";

import { DIFFICULTY_LABELS, OPERATION_SYMBOLS, NUMBER_TYPE_LABELS } from "@/lib/engine/types";
import { formatClock, formatDuration, formatPercent } from "@/lib/math/format";
import { ANSWER_FORMAT_LABELS, type SessionSummary } from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";

interface SessionsTableProps {
  sessions: SessionSummary[];
  onOpen: (session: SessionSummary) => void;
  limit?: number;
}

function formatRate(value: number): string {
  const text = value.toFixed(1);
  return value > 0 ? `+${text}` : text;
}

export function SessionsTable({ sessions, onOpen, limit = 12 }: SessionsTableProps) {
  const rows = sessions.slice(0, limit);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[44rem] text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              When
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Setup
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Answered
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Accuracy
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Avg time
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Net / min
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-paper-deep/40">
              <td className="tabular whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink-soft">
                {new Date(s.endedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="px-3 py-2.5 text-xs text-ink">
                <span className="font-medium">{ANSWER_FORMAT_LABELS[s.settings.answerFormat]}</span>
                <span className="text-muted">
                  {" · "}
                  {DIFFICULTY_LABELS[s.settings.difficulty]} · <span className="font-mono">{s.settings.operations.map((op) => OPERATION_SYMBOLS[op]).join(" ")}</span> ·{" "}
                  {s.settings.numberTypes.map((t) => NUMBER_TYPE_LABELS[t]).join(", ")} · {s.settings.mode === "timed" ? formatClock(s.settings.durationMinutes * 60_000) : "untimed"}
                </span>
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink-soft">{s.attempted}</td>
              <td className={cx("tabular px-3 py-2.5 text-right font-mono", s.attempted === 0 ? "text-faint" : s.accuracy < 0.7 ? "text-bad" : "text-ink")}>
                {s.attempted === 0 ? "—" : formatPercent(s.accuracy)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink-soft">{s.attempted === 0 ? "—" : formatDuration(s.averageResponseMs)}</td>
              <td className={cx("tabular px-3 py-2.5 text-right font-mono", s.attempted === 0 ? "text-faint" : "text-accent")}>
                {s.attempted === 0 ? "—" : formatRate(s.netScorePerMinute)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onOpen(s)}
                  className="text-xs font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
