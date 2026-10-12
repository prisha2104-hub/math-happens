"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { WeaknessList } from "@/components/history/WeaknessList";
import { ResultsScreen, type SaveState } from "@/components/results/ResultsScreen";
import { SessionScreen } from "@/components/session/SessionScreen";
import { PageShell, SectionHeading } from "@/components/shell/PageShell";
import { Button } from "@/components/ui/Button";
import { useHistory } from "@/hooks/useHistory";
import { useStoredSettings } from "@/hooks/useStoredSettings";
import { type PracticePlan, REASON_LABELS, buildPracticePlan } from "@/lib/adaptive/plan";
import { analyzeWeaknesses } from "@/lib/analysis/weakness";
import { type TargetSpec, parseTargetKey } from "@/lib/engine/targeted";
import { NUMBER_TYPES, OPERATIONS, type NumberType, type Operation } from "@/lib/engine/types";
import { reviewQueue } from "@/lib/review/schedule";
import { recordCompletedSession } from "@/lib/services/recordSession";
import { type Attempt, type SessionSummary, type TrainerSettings, effectiveNumberTypes, effectiveOperations } from "@/lib/session/types";
import { techniqueById } from "@/lib/techniques/library";
import { cx } from "@/lib/ui/cx";
import { ReviewQueue } from "./ReviewQueue";
import { SessionOptions, type SessionOptionsValue } from "./SessionOptions";

type Screen = { name: "plan" } | { name: "session"; settings: TrainerSettings; run: number } | { name: "results"; summary: SessionSummary; attempts: Attempt[]; saveState: SaveState };

/** Answers before the adaptive lists have anything trustworthy to say. */
const BASELINE_ANSWERS = 20;

const REASON_TONE: Record<string, string> = {
  "weak-accuracy": "border-bad/30 bg-bad-soft text-bad",
  slow: "border-accent/30 bg-accent-soft text-accent-strong",
  "repeated-miss": "border-bad/30 bg-bad-soft text-bad",
  "review-due": "border-accent/30 bg-accent-soft text-accent-strong",
  fresh: "border-line-strong bg-paper-deep text-ink-soft",
  focus: "border-ink bg-ink text-paper",
  technique: "border-ink bg-ink text-paper",
};

function PlanPanel({ plan }: { plan: PracticePlan }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-sm text-ink-soft">{plan.summary}</p>
      <ol className="mt-3 space-y-2">
        {plan.targets.map((t, i) => (
          <li key={`${t.label}-${i}`} className="flex items-center gap-3">
            <span className="tabular w-10 shrink-0 text-right font-mono text-sm text-ink">{Math.round(t.weight * 100)}%</span>
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-paper-deep" role="presentation">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(3, Math.round(t.weight * 100))}%` }} />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.label}</span>
            <span className={cx("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", REASON_TONE[t.reason])}>{REASON_LABELS[t.reason]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ImprovePage() {
  const router = useRouter();
  const params = useSearchParams();
  const focusParam = params.get("target");
  const techniqueParam = params.get("technique");
  const focus: TargetSpec | null = useMemo(() => (focusParam ? parseTargetKey(focusParam) : null), [focusParam]);
  const technique = techniqueParam ? techniqueById(techniqueParam) : null;

  const { attempts, review, status, reload, loadedAt } = useHistory();
  const { settings } = useStoredSettings();
  const [options, setOptions] = useState<SessionOptionsValue | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "plan" });
  const runCounter = useRef(0);
  // "Now" is the moment the history snapshot loaded, so analysis is a pure function of the data.
  const now = loadedAt;

  const effectiveOptions = useMemo<SessionOptionsValue>(
    () =>
      options ?? {
        mode: settings.mode,
        durationMinutes: settings.durationMinutes,
        questionLimit: settings.questionLimit ?? 20,
        answerFormat: settings.answerFormat,
      },
    [options, settings],
  );

  const plan = useMemo(() => {
    // With advanced settings on, the percentages decide what may be practised,
    // so the plan is restricted to them as well as drawn from them.
    const operations = effectiveOperations(settings);
    const numberTypes = effectiveNumberTypes(settings);
    return buildPracticePlan({
      attempts,
      review,
      pool: { operations, numberTypes, difficulty: settings.difficulty },
      now,
      focus,
      techniqueId: technique?.id ?? null,
      restrict: settings.advanced.enabled ? { operations, numberTypes } : null,
    });
  }, [attempts, review, settings, now, focus, technique]);
  const weakness = useMemo(() => analyzeWeaknesses(attempts, { now }), [attempts, now]);
  const queue = useMemo(() => reviewQueue(review, now), [review, now]);
  // Two different problems deserve two different lists: questions that are
  // getting missed, and questions that are right but cost too much time.
  const missed = useMemo(() => weakness.weaknesses.filter((w) => w.signals.includes("accuracy") || w.signals.includes("repeat")).slice(0, 5), [weakness]);
  const slow = useMemo(() => weakness.weaknesses.filter((w) => w.signals.includes("speed") && !w.signals.includes("accuracy")).slice(0, 4), [weakness]);

  const start = useCallback(
    (override: Partial<SessionOptionsValue> = {}) => {
    const options = { ...effectiveOptions, ...override };
    const operations = [...new Set(plan.targets.map((t) => t.target.operation))].sort((a, b) => OPERATIONS.indexOf(a) - OPERATIONS.indexOf(b)) as Operation[];
    const numberTypes = [...new Set(plan.targets.map((t) => t.target.numberType))].sort((a, b) => NUMBER_TYPES.indexOf(a) - NUMBER_TYPES.indexOf(b)) as NumberType[];
    const sessionSettings: TrainerSettings = {
      mode: options.mode,
      durationMinutes: options.durationMinutes,
      questionLimit: options.mode === "untimed" ? options.questionLimit : null,
      difficulty: settings.difficulty,
      operations,
      numberTypes,
      answerFormat: options.answerFormat,
      advanced: settings.advanced,
      plan,
    };
    runCounter.current += 1;
    setScreen({ name: "session", settings: sessionSettings, run: runCounter.current });
    },
    [plan, effectiveOptions, settings.difficulty, settings.advanced],
  );

  const handleFinished = useCallback(
    (summary: SessionSummary, sessionAttempts: Attempt[]) => {
      setScreen((current) => (current.name === "results" && current.summary.id === summary.id ? current : { name: "results", summary, attempts: sessionAttempts, saveState: "saving" }));
      recordCompletedSession(summary, sessionAttempts)
        .then(() => {
          setScreen((current) => (current.name === "results" && current.summary.id === summary.id ? { ...current, saveState: "saved" } : current));
          reload();
        })
        .catch(() => setScreen((current) => (current.name === "results" && current.summary.id === summary.id ? { ...current, saveState: "failed" } : current)));
    },
    [reload],
  );

  if (screen.name === "session") {
    return <SessionScreen key={screen.run} settings={screen.settings} onFinished={handleFinished} />;
  }

  if (screen.name === "results") {
    return (
      <PageShell width="narrow">
        <ResultsScreen
          summary={screen.summary}
          attempts={screen.attempts}
          saveState={screen.saveState}
          title="Improve session"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setScreen({ name: "plan" })}>
                Back to plan
              </Button>
              <Button variant="primary" size="sm" onClick={() => start()}>
                Improve again
              </Button>
            </>
          }
        />
      </PageShell>
    );
  }

  const focused = focus !== null || technique !== null;
  const focusLabel = technique ? technique.title : plan.targets[0]?.label;
  const recentMisses = attempts.filter((a) => !a.correct && now - a.submittedAt <= 7 * 86_400_000).slice(-5).reverse();

  return (
    <PageShell
      title="Improve"
      lede="Targeted practice built from your own misses, slow spots and review calendar. Train mode is untouched; this is the other door."
      actions={
        focused ? (
          <Button variant="ghost" size="sm" onClick={() => router.push("/improve")}>
            Clear focus
          </Button>
        ) : undefined
      }
    >
      {status === "loading" ? (
        <p className="text-sm text-muted">Loading your history…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-8">
            <section aria-label="Plan">
              <SectionHeading hint={focused ? `Focused on: ${focusLabel}` : "What should I practise next?"}>{focused ? "Focused practice" : "This session's plan"}</SectionHeading>
              {plan.coldStart && !focused && (
                <div className="mb-3 flex flex-col gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
                  {attempts.length < BASELINE_ANSWERS ? (
                    <>
                      <span>
                        {attempts.length === 0 ? "There is no history to adapt to yet." : `Only ${attempts.length} answers so far — too few to call anything a weakness.`} A short
                        mixed session sets a baseline, and from then on weak skills and due reviews steer the plan.
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => start({ mode: "untimed", questionLimit: BASELINE_ANSWERS })}>
                          Start a {BASELINE_ANSWERS}-question baseline
                        </Button>
                        <Link href="/" className="text-ink underline underline-offset-4">
                          Prefer to start in Train?
                        </Link>
                      </span>
                    </>
                  ) : (
                    "Nothing has enough evidence to count as a weakness yet, so this session uses your current Train selection."
                  )}
                </div>
              )}
              <PlanPanel plan={plan} />
            </section>

            <section aria-label="Session options" className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-card">
              <SectionHeading hint="Timing and answer format for this Improve session. Your Train settings are not changed.">Session</SectionHeading>
              <SessionOptions value={effectiveOptions} onChange={setOptions} />
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-xs text-muted">
                  Difficulty follows your Train setting ({settings.difficulty}). Questions are fresh every time — the plan targets skills, not specific questions.
                </span>
                <Button variant="primary" size="lg" onClick={() => start()} className="shrink-0 sm:min-w-44">
                  Start improving
                </Button>
              </div>
            </section>

            {!focused && (
              <>
                <section aria-label="Frequent mistakes">
                  <SectionHeading hint="Ranked by recent misses. Nothing appears here on the strength of a single wrong answer.">Where the mistakes are</SectionHeading>
                  {missed.length > 0 ? (
                    <WeaknessList weaknesses={missed} watchlist={weakness.watchlist} overallAccuracy={weakness.overallAccuracy} compact />
                  ) : (
                    <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-muted">
                      {attempts.length < BASELINE_ANSWERS
                        ? "Too little history to call anything a weakness. A short mixed session gives these lists something to work from."
                        : "No kind of question has been missed often enough to count. Keep going and anything that slips will show up here."}
                    </p>
                  )}
                </section>

                <section aria-label="Correct but slow">
                  <SectionHeading hint="Answered right, but slower than comparable questions — the cheapest points to win back.">Where the time goes</SectionHeading>
                  {slow.length > 0 ? (
                    <WeaknessList weaknesses={slow} watchlist={[]} overallAccuracy={weakness.overallAccuracy} compact />
                  ) : (
                    <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-muted">
                      Nothing is dragging: your correct answers take about the same time across the question types you have practised.
                    </p>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <section aria-label="Review calendar">
              <SectionHeading hint="Skills come back on a schedule until they stick.">Due for review</SectionHeading>
              <ReviewQueue queue={queue} now={now} />
            </section>

            <section aria-label="Recent misses">
              <SectionHeading
                hint="From the last seven days."
                actions={
                  <Link href="/notebook" className="text-xs font-medium text-ink underline-offset-4 hover:underline">
                    Open notebook
                  </Link>
                }
              >
                Questions needing immediate review
              </SectionHeading>
              {recentMisses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-muted">No misses in the last week.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-4">
                  {recentMisses.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="tabular font-mono text-sm text-ink">{a.expression}</span>
                      <span className="tabular font-mono text-xs text-muted">
                        <span className="text-bad line-through">{a.userInput}</span> → {a.correctAnswerText}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}
