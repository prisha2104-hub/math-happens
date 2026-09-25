"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FEATURE_LABELS, facetLabel, facetOf, featuresOf } from "@/lib/analysis/facets";
import { questionFromAttempt } from "@/lib/analysis/reconstruct";
import { ERROR_TAG_DESCRIPTIONS, ERROR_TAG_LABELS } from "@/lib/choice/types";
import { targetKey } from "@/lib/engine/targeted";
import { DIFFICULTY_LABELS, NUMBER_TYPE_LABELS, OPERATION_LABELS, OPERATION_SYMBOLS } from "@/lib/engine/types";
import { formatDuration } from "@/lib/math/format";
import { ANSWER_FORMAT_LABELS, type Attempt } from "@/lib/session/types";
import { techniquesFor } from "@/lib/techniques/library";
import { cx } from "@/lib/ui/cx";

interface MistakeCardProps {
  attempt: Attempt;
  /** Show an "also missed n times" note. */
  repeatCount?: number;
}

function Chip({ children, tone = "default", title }: { children: React.ReactNode; tone?: "default" | "bad" | "accent"; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "bad" ? "border-bad/30 bg-bad-soft text-bad" : tone === "accent" ? "border-accent/30 bg-accent-soft text-accent-strong" : "border-line-strong text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}

export function MistakeCard({ attempt, repeatCount = 1 }: MistakeCardProps) {
  const [open, setOpen] = useState(false);
  const question = useMemo(() => questionFromAttempt(attempt), [attempt]);
  const techniques = useMemo(() => (question ? techniquesFor(question).slice(0, 2) : []), [question]);
  const facet = facetOf(attempt.meta.variant);
  const features = featuresOf(attempt);
  const tag = attempt.errorTag ?? "unclassified";
  const practiceHref = `/improve?target=${encodeURIComponent(
    targetKey({ numberType: attempt.numberType, operation: attempt.operation, difficulty: attempt.difficulty, facet }),
  )}`;
  const when = new Date(attempt.submittedAt);

  return (
    <article className="rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="tabular flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono">
            <span className="text-2xl tracking-tight text-ink sm:text-3xl">{attempt.expression}</span>
            <span className="text-lg text-muted">=</span>
            <span className="text-2xl text-good sm:text-3xl">{attempt.correctAnswerText}</span>
            <span className="text-sm text-muted">
              you answered <span className="text-bad line-through decoration-bad/60">{attempt.userInput}</span>
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip>
              <span className="font-mono text-accent">{OPERATION_SYMBOLS[attempt.operation]}</span> {OPERATION_LABELS[attempt.operation]}
            </Chip>
            <Chip>{NUMBER_TYPE_LABELS[attempt.numberType]}</Chip>
            <Chip>{DIFFICULTY_LABELS[attempt.difficulty]}</Chip>
            <Chip>{ANSWER_FORMAT_LABELS[attempt.answerFormat]}</Chip>
            <Chip tone={tag === "unclassified" ? "default" : "bad"} title={ERROR_TAG_DESCRIPTIONS[tag]}>
              {ERROR_TAG_LABELS[tag]}
            </Chip>
            <Chip>{formatDuration(attempt.responseMs)}</Chip>
            {repeatCount > 1 && <Chip tone="accent">missed {repeatCount}×</Chip>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <time dateTime={when.toISOString()} className="tabular font-mono text-xs text-muted">
            {when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </time>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {open ? "Less" : "Why?"}
          </button>
          <Link
            href={practiceHref}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Practice similar
          </Link>
        </div>
      </div>

      {open && (
        <div className="grid gap-5 border-t border-line px-5 py-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">What went wrong</h4>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {ERROR_TAG_DESCRIPTIONS[tag]}
                {tag === "unclassified" && " The typed value does not match any mistake pattern the app can verify, so no diagnosis is claimed."}
              </p>
              {attempt.choice && (
                <ul className="mt-2 grid grid-cols-2 gap-1.5">
                  {attempt.choice.options.map((option, index) => {
                    const chosen = index === attempt.choice?.selectedIndex;
                    const correct = index === attempt.choice?.correctIndex;
                    return (
                      <li
                        key={index}
                        className={cx(
                          "tabular flex items-center justify-between gap-2 rounded-md border px-2 py-1 font-mono text-xs",
                          correct ? "border-good/40 bg-good-soft text-good" : chosen ? "border-bad/40 bg-bad-soft text-bad" : "border-line text-muted",
                        )}
                      >
                        <span>
                          {index + 1}. {option.text}
                        </span>
                        <span className="font-sans text-[10px]">{correct ? "correct" : chosen ? "your pick" : option.tag ? ERROR_TAG_LABELS[option.tag].toLowerCase() : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Question profile</h4>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft">
                <dt className="text-muted">Skill</dt>
                <dd>{facetLabel(facet, attempt.numberType, attempt.operation)}</dd>
                {features.length > 0 && (
                  <>
                    <dt className="text-muted">Features</dt>
                    <dd>{features.map((f) => FEATURE_LABELS[f]).join(", ")}</dd>
                  </>
                )}
                {attempt.meta.carries !== null && (
                  <>
                    <dt className="text-muted">{attempt.operation === "subtraction" ? "Borrows" : "Carries"}</dt>
                    <dd className="tabular font-mono">{attempt.meta.carries}</dd>
                  </>
                )}
                {attempt.meta.lcm !== null && (
                  <>
                    <dt className="text-muted">Common denominator</dt>
                    <dd className="tabular font-mono">{attempt.meta.lcm}</dd>
                  </>
                )}
                {attempt.numberType === "fraction" && (
                  <>
                    <dt className="text-muted">Denominators</dt>
                    <dd className="tabular font-mono">{attempt.meta.denominators.join(", ")}</dd>
                  </>
                )}
                {attempt.numberType === "decimal" && (
                  <>
                    <dt className="text-muted">Decimal places</dt>
                    <dd className="tabular font-mono">{attempt.meta.decimalPlaces.map((p) => p ?? "–").join(", ")}</dd>
                  </>
                )}
                <dt className="text-muted">Generator</dt>
                <dd className="font-mono">{attempt.meta.variant}</dd>
              </dl>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">A faster way</h4>
            {techniques.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No library technique targets this exact shape of question yet.</p>
            ) : (
              <div className="mt-1 space-y-3">
                {techniques.map((t) => {
                  const explanation = question ? t.explain(question) : null;
                  return (
                    <div key={t.id} className="rounded-xl border border-line bg-paper px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tracking-tight text-ink">{t.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{t.summary}</p>
                        </div>
                        <Link href={`/improve?technique=${t.id}`} className="shrink-0 text-xs font-medium text-ink underline-offset-4 hover:underline">
                          Practice this
                        </Link>
                      </div>
                      {explanation && (
                        <ol className="tabular mt-2 list-decimal space-y-1 pl-5 font-mono text-xs text-ink">
                          {explanation.steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
