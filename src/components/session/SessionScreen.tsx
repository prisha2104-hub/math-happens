"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { useSession } from "@/hooks/useSession";
import { formatClock } from "@/lib/math/format";
import { summarizeSession } from "@/lib/session/reducer";
import { type Attempt, type SessionSummary, type TrainerSettings, timeLimitMs } from "@/lib/session/types";
import { keyToChoiceIndex } from "@/lib/choice/choiceSet";
import { cx } from "@/lib/ui/cx";
import { AnswerInput } from "./AnswerInput";
import { ChoiceOptions } from "./ChoiceOptions";
import { FeedbackStrip } from "./FeedbackStrip";
import { QuestionDisplay } from "./QuestionDisplay";

interface SessionScreenProps {
  settings: TrainerSettings;
  onFinished: (summary: SessionSummary, attempts: Attempt[]) => void;
}

function needsSymbolKeys(settings: TrainerSettings): boolean {
  // Fractions need "/", and hard subtraction can produce negative answers needing "-".
  return settings.numberTypes.includes("fraction") || (settings.difficulty === "hard" && settings.operations.includes("subtraction"));
}

interface Draft {
  questionId: string;
  text: string;
}

export function SessionScreen({ settings, onFinished }: SessionScreenProps) {
  const { state, elapsed, remaining, submit, choose, togglePause, resume, end, clearInputError } = useSession(settings);
  // The typed answer belongs to one question; a new question therefore starts blank.
  const [draft, setDraft] = useState<Draft | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastSubmittedQuestion = useRef<string | null>(null);
  const reported = useRef(false);

  const multipleChoice = settings.answerFormat === "multiple-choice";
  const running = state.status === "running";
  const paused = state.status === "paused";
  const question = state.question;
  const value = draft !== null && draft.questionId === question?.id ? draft.text : "";
  const correct = state.attempts.filter((a) => a.correct).length;
  const incorrect = state.attempts.length - correct;
  const limit = timeLimitMs(settings);
  const lowTime = remaining !== null && remaining <= 10_000;
  const canChoose = multipleChoice && running && state.reveal === null;

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (running && !multipleChoice) focusInput();
  }, [running, multipleChoice, question?.id, focusInput]);

  // Escape toggles pause without stealing digits from the answer field; in
  // multiple choice the digits 1–4 pick an option.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        togglePause();
        return;
      }
      if (!canChoose || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = keyToChoiceIndex(event.key);
      if (index !== null) {
        event.preventDefault();
        choose(index);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePause, canChoose, choose]);

  useEffect(() => {
    if (state.status !== "finished" || reported.current) return;
    reported.current = true;
    onFinished(summarizeSession(state, performance.now()), state.attempts);
  }, [state, onFinished]);

  const handleSubmit = () => {
    if (!running || !question) return;
    // Guard against a double Enter racing the state update for the same question.
    if (lastSubmittedQuestion.current === question.id && state.inputError === null) return;
    lastSubmittedQuestion.current = question.id;
    submit(value);
  };

  const handleChange = (text: string) => {
    if (!question) return;
    setDraft({ questionId: question.id, text });
    if (state.inputError) clearInputError();
    lastSubmittedQuestion.current = null;
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Wordmark className="text-muted" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={togglePause} disabled={state.status === "finished"} aria-pressed={paused}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="danger" size="sm" onClick={end} disabled={state.status === "finished"}>
            End session
          </Button>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Session status">
        <StatusCell label={limit === null ? "Elapsed" : "Time left"} shortLabel="Time" tone={lowTime ? "accent" : "default"}>
          {formatClock(limit === null ? elapsed : remaining ?? 0)}
        </StatusCell>
        <StatusCell label="Answered" shortLabel="Total">
          {state.attempts.length}
          {settings.mode === "untimed" && settings.questionLimit !== null && (
            <span className="text-sm text-muted sm:text-base"> / {settings.questionLimit}</span>
          )}
        </StatusCell>
        <StatusCell label="Correct" shortLabel="Right" tone="good">
          {correct}
        </StatusCell>
        <StatusCell label="Incorrect" shortLabel="Wrong" tone="bad">
          {incorrect}
        </StatusCell>
      </section>

      {limit !== null && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line" role="presentation">
          <div
            className={cx("h-full rounded-full transition-[width] duration-100 ease-linear", lowTime ? "bg-accent" : "bg-ink")}
            style={{ width: `${Math.max(0, Math.min(100, ((remaining ?? 0) / limit) * 100))}%` }}
          />
        </div>
      )}

      <section
        className="flex flex-1 flex-col items-center justify-center gap-8 py-14 sm:py-20"
        onClick={(event) => {
          if (running && !(event.target instanceof HTMLButtonElement)) focusInput();
        }}
      >
        {paused ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="font-display text-5xl tracking-tight text-ink">Paused</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              The clock is stopped and answers are not accepted. Press <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-xs">Esc</kbd> or
              resume to continue.
            </p>
            <Button variant="primary" onClick={resume}>
              Resume
            </Button>
          </div>
        ) : question ? (
          <QuestionDisplay question={question} />
        ) : (
          <p className="font-display text-4xl text-muted">Finishing…</p>
        )}

        {multipleChoice ? (
          state.choices && !paused ? (
            <ChoiceOptions choices={state.choices} selectedIndex={state.reveal?.selectedIndex ?? null} disabled={!running} onChoose={choose} />
          ) : null
        ) : (
          <AnswerInput
            inputRef={inputRef}
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            disabled={!running}
            error={state.inputError}
            flashKey={state.lastFeedback?.attemptId ?? null}
            flashTone={state.lastFeedback ? (state.lastFeedback.correct ? "good" : "bad") : null}
            numericKeyboard={!needsSymbolKeys(settings)}
          />
        )}

        <FeedbackStrip feedback={state.lastFeedback} />

        <p className="text-center text-xs text-muted">
          {multipleChoice ? (
            <>
              Press <kbd className="font-mono">1</kbd>–<kbd className="font-mono">4</kbd> or tap an option · <kbd className="font-mono">Esc</kbd> to pause
            </>
          ) : (
            <>
              <kbd className="font-mono">Enter</kbd> to submit · <kbd className="font-mono">Esc</kbd> to pause · fractions as{" "}
              <span className="font-mono">3/4</span>
            </>
          )}
        </p>
      </section>
    </main>
  );
}

interface StatusCellProps {
  label: string;
  /** Shown on narrow screens where four full labels do not fit. */
  shortLabel: string;
  children: React.ReactNode;
  tone?: "default" | "good" | "bad" | "accent";
}

function StatusCell({ label, shortLabel, children, tone = "default" }: StatusCellProps) {
  const tones = { default: "text-ink", good: "text-good", bad: "text-bad", accent: "text-accent" };
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface px-2.5 py-2.5 sm:px-4 sm:py-3">
      <span className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-muted sm:text-[11px] sm:tracking-[0.08em]">
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={cx("tabular font-mono text-lg leading-none tracking-tight sm:text-2xl", tones[tone])}>{children}</span>
    </div>
  );
}
