import { ERROR_TAG_LABELS } from "@/lib/choice/types";
import { formatDuration } from "@/lib/math/format";
import type { Attempt } from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";

interface HistoryTableProps {
  attempts: Attempt[];
}

export function HistoryTable({ attempts }: HistoryTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Question history
        </caption>
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Question
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Your answer
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Correct answer
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Result
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {attempts.map((attempt, index) => (
            <tr key={attempt.id} className={cx(!attempt.correct && "bg-bad-soft/40")}>
              <td className="tabular px-4 py-2.5 font-mono text-muted">{index + 1}</td>
              <td className="tabular px-3 py-2.5 font-mono text-ink">{attempt.expression}</td>
              <td className={cx("tabular px-3 py-2.5 text-right font-mono", attempt.correct ? "text-ink" : "text-bad line-through decoration-bad/60")}>
                {attempt.userInput}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink">{attempt.correctAnswerText}</td>
              <td className="px-3 py-2.5">
                <span className={cx("inline-flex items-center gap-1.5 text-xs font-semibold", attempt.correct ? "text-good" : "text-bad")}>
                  <span aria-hidden="true">{attempt.correct ? "✓" : "✕"}</span>
                  {attempt.correct ? "Correct" : "Incorrect"}
                </span>
                {!attempt.correct && attempt.errorTag && attempt.errorTag !== "unclassified" && (
                  <span className="mt-0.5 block text-[11px] text-muted">{ERROR_TAG_LABELS[attempt.errorTag]}</span>
                )}
              </td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-ink-soft">{formatDuration(attempt.responseMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
