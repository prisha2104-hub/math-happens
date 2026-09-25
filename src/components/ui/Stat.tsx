import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "good" | "bad";
  className?: string;
}

const TONES = {
  default: "text-ink",
  accent: "text-accent",
  good: "text-good",
  bad: "text-bad",
};

/** Labelled figure for summary grids. */
export function Stat({ label, value, hint, tone = "default", className }: StatProps) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5", className)}>
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className={cx("tabular font-mono text-2xl leading-none tracking-tight", TONES[tone])}>{value}</span>
      {hint !== undefined && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
