"use client";

import Link from "next/link";
import { useMemo } from "react";
import { EmptyState, PageShell, SectionHeading } from "@/components/shell/PageShell";
import { useHistory } from "@/hooks/useHistory";
import { questionFromAttempt } from "@/lib/analysis/reconstruct";
import { TECHNIQUES, exampleQuestion, techniquesFor } from "@/lib/techniques/library";
import { CATEGORY_LABELS, TECHNIQUE_CATEGORIES, type Technique } from "@/lib/techniques/types";
import { cx } from "@/lib/ui/cx";

function TechniqueCard({ technique, highlight }: { technique: Technique; highlight?: string }) {
  const example = exampleQuestion(technique);
  const explanation = technique.explain(example);
  return (
    <article id={technique.id} className={cx("flex flex-col gap-4 rounded-2xl border bg-surface px-5 py-5 shadow-card", highlight ? "border-accent/40" : "border-line")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {highlight && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-strong">{highlight}</p>}
          <h3 className="font-display text-2xl tracking-tight text-ink">{technique.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{technique.summary}</p>
        </div>
        <Link
          href={`/improve?technique=${technique.id}`}
          className="inline-flex h-10 shrink-0 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Practice this technique
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">When it helps</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{technique.whenUseful}</p>
        </div>
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Worked example</h4>
          <p className="tabular mt-1 font-mono text-lg text-ink">
            {example.expression} = <span className="text-good">{example.answerText}</span>
          </p>
          {explanation && (
            <ol className="tabular mt-2 list-decimal space-y-1 pl-5 font-mono text-xs text-ink">
              {explanation.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}

export function TechniquesPage() {
  const { attempts, status, loadedAt } = useHistory();

  // Techniques that would have made recent misses easier, by how many misses they cover.
  const suggested = useMemo(() => {
    const counts = new Map<string, number>();
    const recent = attempts.filter((a) => !a.correct && loadedAt - a.submittedAt <= 30 * 86_400_000);
    for (const attempt of recent) {
      const question = questionFromAttempt(attempt);
      if (!question) continue;
      for (const t of techniquesFor(question)) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
    return TECHNIQUES.map((t) => ({ technique: t, misses: counts.get(t.id) ?? 0 }))
      .filter((s) => s.misses >= 2)
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 3);
  }, [attempts, loadedAt]);

  const lede = "Ways to make each kind of problem genuinely easier in your head. Every worked example is computed exactly, and every technique can be drilled on its own.";

  return (
    <PageShell title="Techniques" lede={lede}>
      {status === "ready" && (
        <section className="mb-10" aria-label="Suggested techniques">
          <SectionHeading hint="Based on which techniques apply to the questions you missed in the last 30 days.">Suggested for your recent mistakes</SectionHeading>
          {suggested.length === 0 ? (
            <EmptyState title="No suggestions yet">Once a few misses share a shape, the techniques that would have helped appear here first.</EmptyState>
          ) : (
            <div className="grid gap-3">
              {suggested.map(({ technique, misses }) => (
                <TechniqueCard key={technique.id} technique={technique} highlight={`Would have helped with ${misses} recent ${misses === 1 ? "miss" : "misses"}`} />
              ))}
            </div>
          )}
        </section>
      )}

      {TECHNIQUE_CATEGORIES.map((category) => (
        <section key={category} className="mb-10" aria-label={CATEGORY_LABELS[category]}>
          <SectionHeading>{CATEGORY_LABELS[category]}</SectionHeading>
          <div className="grid gap-3">
            {TECHNIQUES.filter((t) => t.category === category).map((t) => (
              <TechniqueCard key={t.id} technique={t} />
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
