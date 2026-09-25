"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEFAULT_FILTERS, FilterBar, type FilterState, toHistoryFilters } from "@/components/history/FilterBar";
import { EmptyState, PageShell, SectionHeading } from "@/components/shell/PageShell";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { useHistory } from "@/hooks/useHistory";
import { filterAttempts } from "@/lib/analysis/aggregate";
import { dayKey } from "@/lib/analysis/trends";
import { ERROR_TAGS, ERROR_TAG_LABELS, type ErrorTag } from "@/lib/choice/types";
import type { Attempt } from "@/lib/session/types";
import { MistakeCard } from "./MistakeCard";

const PAGE_SIZE = 25;

function dayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function NotebookPage() {
  const { attempts, status, loadedAt } = useHistory();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [tags, setTags] = useState<ErrorTag[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const mistakes = useMemo(() => attempts.filter((a) => !a.correct).sort((a, b) => b.submittedAt - a.submittedAt), [attempts]);
  const repeatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mistakes) counts.set(m.expression, (counts.get(m.expression) ?? 0) + 1);
    return counts;
  }, [mistakes]);
  const presentTags = useMemo(() => ERROR_TAGS.filter((t) => mistakes.some((m) => (m.errorTag ?? "unclassified") === t)), [mistakes]);

  const visible = useMemo(() => {
    const filtered = filterAttempts(mistakes, toHistoryFilters(filters, loadedAt));
    return tags.length === 0 ? filtered : filtered.filter((m) => tags.includes(m.errorTag ?? "unclassified"));
  }, [mistakes, filters, tags, loadedAt]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Attempt[]>();
    for (const m of visible.slice(0, limit)) {
      const key = dayKey(m.submittedAt);
      const list = byDay.get(key);
      if (list) list.push(m);
      else byDay.set(key, [m]);
    }
    return [...byDay.entries()];
  }, [visible, limit]);

  const today = dayKey(loadedAt || 0);
  const yesterday = dayKey((loadedAt || 0) - 86_400_000);
  const lede = "Every miss, with what went wrong and a faster way through. Practise the skill behind a mistake rather than the same question again.";

  if (status === "loading") {
    return (
      <PageShell title="Mistake notebook" lede={lede}>
        <p className="text-sm text-muted">Loading…</p>
      </PageShell>
    );
  }

  if (mistakes.length === 0) {
    return (
      <PageShell title="Mistake notebook" lede={lede}>
        <EmptyState
          title={attempts.length === 0 ? "Nothing to review yet" : "No mistakes recorded"}
          action={
            <Link href="/" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-strong">
              Start training
            </Link>
          }
        >
          {attempts.length === 0
            ? "Wrong answers from your sessions will collect here, each with a diagnosis and a technique that would have made it easier."
            : `${attempts.length} answers so far and every one of them correct. The notebook fills in only when something goes wrong.`}
        </EmptyState>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Mistake notebook"
      lede={lede}
      actions={
        <Link href="/improve" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong">
          Practise weak skills
        </Link>
      }
    >
      <FilterBar value={filters} onChange={setFilters} />
      {presentTags.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Mistake type">
          <span className="mr-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">Mistake type</span>
          {presentTags.map((tag) => (
            <ToggleChip key={tag} pressed={tags.includes(tag)} onToggle={() => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]))}>
              {ERROR_TAG_LABELS[tag]}
              <span className="tabular font-mono text-[11px] opacity-70">{mistakes.filter((m) => (m.errorTag ?? "unclassified") === tag).length}</span>
            </ToggleChip>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SectionHeading hint={`${visible.length} of ${mistakes.length} mistakes shown`}>Entries</SectionHeading>
        {visible.length === 0 ? (
          <EmptyState title="No mistakes match">Loosen the filters to see more.</EmptyState>
        ) : (
          <div className="space-y-8">
            {groups.map(([day, list]) => (
              <section key={day} aria-label={dayLabel(day, today, yesterday)}>
                <h3 className="mb-3 font-display text-2xl tracking-tight text-ink">{dayLabel(day, today, yesterday)}</h3>
                <div className="space-y-3">
                  {list.map((m) => (
                    <MistakeCard key={m.id} attempt={m} repeatCount={repeatCounts.get(m.expression) ?? 1} />
                  ))}
                </div>
              </section>
            ))}
            {visible.length > limit && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Show {Math.min(PAGE_SIZE, visible.length - limit)} more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
