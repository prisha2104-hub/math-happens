import { Fragment } from "react";
import { formatDuration, formatPercent } from "@/lib/math/format";
import type { Breakdown } from "@/lib/session/types";

export interface BreakdownRow {
  key: string;
  label: string;
  glyph?: string;
  data: Breakdown;
}

export interface BreakdownSection {
  title: string;
  rows: BreakdownRow[];
}

interface BreakdownTableProps {
  sections: BreakdownSection[];
}

const cell = "tabular px-3 py-2.5 text-right font-mono";

export function BreakdownTable({ sections }: BreakdownTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="border-b border-line px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Breakdown
        </caption>
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Category
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Answered
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Correct / wrong
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Accuracy
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Avg time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sections.map((section) => (
            <Fragment key={section.title}>
              <tr className="bg-paper-deep/60">
                <th scope="colgroup" colSpan={5} className="px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {section.title}
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">
                    {row.glyph && (
                      <span className="mr-2 inline-block w-4 text-center font-mono text-accent" aria-hidden="true">
                        {row.glyph}
                      </span>
                    )}
                    {row.label}
                  </th>
                  <td className={`${cell} text-ink-soft`}>{row.data.attempted}</td>
                  <td className={`${cell} text-ink-soft`}>
                    <span className="text-good">{row.data.correct}</span>
                    <span className="text-faint"> / </span>
                    <span className={row.data.incorrect > 0 ? "text-bad" : "text-ink-soft"}>{row.data.incorrect}</span>
                  </td>
                  <td className={`${cell} text-ink`}>{formatPercent(row.data.accuracy)}</td>
                  <td className={`${cell} px-4 text-ink-soft`}>{formatDuration(row.data.averageResponseMs)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
