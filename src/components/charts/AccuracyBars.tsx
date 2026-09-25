import type { Stats } from "@/lib/analysis/aggregate";
import { formatDuration, formatPercent } from "@/lib/math/format";
import { cx } from "@/lib/ui/cx";

export interface AccuracyRow {
  key: string;
  label: string;
  glyph?: string;
  stats: Stats;
}

interface AccuracyBarsProps {
  title: string;
  rows: AccuracyRow[];
  /** Rows with fewer attempts than this are shown but flagged as thin evidence. */
  minAttempts?: number;
  /** Reference accuracy drawn as a tick, typically the overall figure. */
  reference?: number;
}

/** Horizontal accuracy bars with attempt counts and average time — one question per row: "where am I weakest?" */
export function AccuracyBars({ title, rows, minAttempts = 5, reference }: AccuracyBarsProps) {
  const visible = rows.filter((r) => r.stats.attempts > 0);
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No answers in this selection.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {visible.map((row) => {
            const thin = row.stats.attempts < minAttempts;
            const pct = Math.round(row.stats.accuracy * 100);
            return (
              <li key={row.key} className={cx(thin && "opacity-70")}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">
                    {row.glyph && (
                      <span className="mr-1.5 inline-block w-3 font-mono text-accent" aria-hidden="true">
                        {row.glyph}
                      </span>
                    )}
                    {row.label}
                  </span>
                  <span className="tabular shrink-0 font-mono text-xs text-muted">
                    <span className={cx("text-sm", pct < 70 ? "text-bad" : "text-ink")}>{formatPercent(row.stats.accuracy)}</span>
                    {" · "}
                    {row.stats.attempts} {thin ? "(few)" : ""} · {formatDuration(row.stats.averageResponseMs)}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep" role="presentation">
                  <div className={cx("h-full rounded-full", pct < 70 ? "bg-bad" : pct < 85 ? "bg-accent" : "bg-good")} style={{ width: `${pct}%` }} />
                  {reference !== undefined && (
                    <span className="absolute top-0 h-full w-px bg-ink/50" style={{ left: `${Math.round(reference * 100)}%` }} aria-hidden="true" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
