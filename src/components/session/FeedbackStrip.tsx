import type { Feedback } from "@/lib/session/reducer";
import { cx } from "@/lib/ui/cx";

interface FeedbackStripProps {
  feedback: Feedback | null;
}

/** Result of the previous answer; stays visible until the next one lands. */
export function FeedbackStrip({ feedback }: FeedbackStripProps) {
  return (
    <div className="flex min-h-12 flex-col items-center justify-center gap-1.5" aria-live="polite" aria-atomic="true">
      {feedback && (
        <>
          <div
            key={feedback.attemptId}
            className={cx(
              "animate-rise inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border px-4 py-2 text-sm",
              feedback.correct ? "border-good/30 bg-good-soft text-good" : "border-bad/30 bg-bad-soft text-bad",
            )}
          >
            <span className="font-semibold">{feedback.correct ? "Correct" : "Incorrect"}</span>
            <span className="tabular font-mono text-ink-soft">
              {feedback.expression} = <span className="font-semibold text-ink">{feedback.correctAnswerText}</span>
            </span>
            {!feedback.correct && (
              <span className="text-ink-soft">
                You answered <span className="tabular font-mono text-bad">{feedback.userInput}</span>
              </span>
            )}
          </div>
          {/* The shortcut for a missed word problem, while the question is still in mind. */}
          {feedback.explanation && feedback.explanation.length > 0 && (
            <p className="max-w-xl text-center text-xs leading-relaxed text-muted">{feedback.explanation.join(" ")}</p>
          )}
        </>
      )}
    </div>
  );
}
