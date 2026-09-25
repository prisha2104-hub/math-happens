"use client";

import Link from "next/link";
import type { Weakness } from "@/lib/analysis/weakness";
import { targetKey } from "@/lib/engine/targeted";
import { formatDuration, formatPercent } from "@/lib/math/format";
import { cx } from "@/lib/ui/cx";

interface WeaknessListProps {
  weaknesses: Weakness[];
  watchlist?: Weakness[];
  overallAccuracy: number;
  /** Where "Practice" should lead; the target key is appended as ?target=. */
  practiceHref?: string;
  compact?: boolean;
}

const CONFIDENCE_LABEL = { established: "Established", emerging: "Emerging", insufficient: "Needs more data" } as const;
const KIND_LABEL = { skill: "Skill", feature: "Pattern", error: "Mistake type" } as const;

export function practiceLink(base: string, weakness: Weakness): string | null {
  return weakness.target ? `${base}?target=${encodeURIComponent(targetKey(weakness.target))}` : null;
}

/** Ranked weaknesses with the evidence behind each one, so the claim is checkable. */
export function WeaknessList({ weaknesses: all, watchlist = [], overallAccuracy, practiceHref = "/improve", compact = false }: WeaknessListProps) {
  // A structural pattern that carries the same name as a listed skill (e.g. "Two-digit divisors") adds no information; show the skill.
  const skillLabels = new Set(all.filter((w) => w.kind === "skill").map((w) => w.label));
  const weaknesses = all.filter((w) => !(w.kind === "feature" && skillLabels.has(w.label)));
  if (weaknesses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-muted">
        {watchlist.length > 0 ? (
          <>
            No pattern has enough evidence yet. {watchlist.length} {watchlist.length === 1 ? "area has" : "areas have"} a miss or two — keep training and they will
            either fade or firm up.
          </>
        ) : (
          "Nothing stands out yet. Weaknesses appear here once a skill has been missed a few times or is consistently slow."
        )}
      </div>
    );
  }
  return (
    <ol className={cx("grid gap-2.5", compact ? "" : "lg:grid-cols-2")}>
      {weaknesses.map((w, index) => {
        const href = practiceLink(practiceHref, w);
        const accuracyGap = overallAccuracy - w.accuracy;
        return (
          <li key={w.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular font-mono text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="truncate font-semibold tracking-tight text-ink">{w.label}</h3>
                  <span
                    className={cx(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      w.confidence === "established" ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line-strong text-muted",
                    )}
                  >
                    {CONFIDENCE_LABEL[w.confidence]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {KIND_LABEL[w.kind]} · {w.detail}
                </p>
              </div>
              {href && (
                <Link
                  href={href}
                  className="shrink-0 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Practice
                </Link>
              )}
            </div>
            <dl className="tabular grid grid-cols-3 gap-2 font-mono text-xs text-ink-soft">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted">Accuracy</dt>
                <dd className={cx("text-sm", w.signals.includes("accuracy") ? "text-bad" : "text-ink")}>
                  {w.kind === "error" ? `${w.incorrect} misses` : formatPercent(w.accuracy)}
                  {w.kind !== "error" && accuracyGap > 0.05 && <span className="ml-1 text-[10px] text-muted">({formatPercent(accuracyGap)} below your average)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted">Speed</dt>
                <dd className={cx("text-sm", w.signals.includes("speed") ? "text-bad" : "text-ink")}>
                  {formatDuration(w.averageResponseMs)}
                  {w.slownessRatio !== null && w.slownessRatio >= 1.2 && <span className="ml-1 text-[10px] text-muted">({w.slownessRatio.toFixed(1)}× comparable)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.08em] text-muted">Evidence</dt>
                <dd className="text-sm text-ink">
                  {w.kind === "error" ? `${w.recentIncorrect} recent` : `${w.incorrect}/${w.attempts} wrong`}
                  {w.repeatedMisses > 0 && <span className="ml-1 text-[10px] text-muted">· {w.repeatedMisses} repeated</span>}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}
