"use client";

import Link from "next/link";
import { useState } from "react";
import { DIFFICULTY_LABELS } from "@/lib/engine/types";
import { targetKey } from "@/lib/engine/targeted";
import {
  ADVANCE_STREAK,
  MASTERY_STAGE,
  type ReviewQueue as Queue,
  STAGE_INTERVAL_DAYS,
  correctNeeded,
  describeDue,
  itemLabel,
  targetOfItem,
} from "@/lib/review/schedule";
import type { ReviewItem } from "@/lib/review/types";
import { cx } from "@/lib/ui/cx";

interface ReviewQueueProps {
  queue: Queue;
  now: number;
}

function ItemRow({ item, now, tone }: { item: ReviewItem; now: number; tone: "due" | "later" | "improving" | "mastered" }) {
  const needed = correctNeeded(item);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{itemLabel(item)}</span>
          <span className="text-[11px] text-muted">{DIFFICULTY_LABELS[item.difficulty]}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          <span className={cx(tone === "due" && "text-accent-strong")}>{describeDue(item, now)}</span>
          {" · "}stage {item.stage}/{MASTERY_STAGE} · {item.lapses} {item.lapses === 1 ? "miss" : "misses"}
          {tone === "due" && needed > 0 && ` · ${needed} more correct to advance`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular font-mono text-[11px] text-faint" aria-label="recent outcomes">
          {item.history.slice(-6).map((ok, i) => (
            <span key={i} className={ok ? "text-good" : "text-bad"}>
              {ok ? "●" : "○"}
            </span>
          ))}
        </span>
        {tone === "due" && (
          <Link
            href={`/improve?target=${encodeURIComponent(targetKey(targetOfItem(item)))}`}
            className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Review
          </Link>
        )}
      </div>
    </li>
  );
}

function Bucket({ title, items, now, tone, hint, defaultOpen = false }: { title: string; items: ReviewItem[]; now: number; tone: "due" | "later" | "improving" | "mastered"; hint: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2">
          <span className={cx("h-2 w-2 rounded-full", tone === "due" ? "bg-accent" : tone === "later" ? "bg-line-strong" : tone === "improving" ? "bg-good/60" : "bg-good")} aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-ink">{title}</span>
          <span className="tabular font-mono text-xs text-muted">{items.length}</span>
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      {open && items.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {items.map((item) => (
            <ItemRow key={item.skillId} item={item} now={now} tone={tone} />
          ))}
        </ul>
      )}
      {open && items.length === 0 && <p className="mt-2 text-xs text-faint">Nothing here yet.</p>}
    </div>
  );
}

/** The spaced-review calendar, bucketed so the user can see what is due and why. */
export function ReviewQueue({ queue, now }: ReviewQueueProps) {
  const total = queue.dueNow.length + queue.scheduled.length + queue.improving.length + queue.mastered.length;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-5 py-6 text-sm text-muted">
        No skills are on the review calendar. A skill is added the first time you miss a question in it; it then comes back after {STAGE_INTERVAL_DAYS.slice(1).join(", ")} days as you keep
        getting it right ({ADVANCE_STREAK} correct in a row per step).
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Bucket title="Due now" items={queue.dueNow} now={now} tone="due" hint="Missed recently or scheduled for today. Improve sessions draw from these." defaultOpen />
      <Bucket title="Due later" items={queue.scheduled} now={now} tone="later" hint="Answered correctly recently; coming back in a few days to check it stuck." />
      <Bucket title="Improving" items={queue.improving} now={now} tone="improving" hint="Several correct reviews in a row; intervals are stretching out." />
      <Bucket title="Mastered" items={queue.mastered} now={now} tone="mastered" hint="Reviewed successfully across weeks. Still checked occasionally." />
    </div>
  );
}
