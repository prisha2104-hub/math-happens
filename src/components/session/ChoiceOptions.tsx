"use client";

import type { ChoiceSet } from "@/lib/choice/types";
import { cx } from "@/lib/ui/cx";

interface ChoiceOptionsProps {
  choices: ChoiceSet;
  /** Index picked by the user while the verdict is showing, otherwise null. */
  selectedIndex: number | null;
  disabled: boolean;
  onChoose: (index: number) => void;
  /** Clicking an option while the verdict is showing moves on instead of answering again. */
  onContinue: () => void;
}

/**
 * Four answer options, selectable by click, tap or the 1–4 keys. During the
 * reveal the picked option turns green or red and the correct one is always
 * highlighted, so a miss teaches the right answer before moving on.
 *
 * The options stay focusable during the reveal (they are `aria-disabled`, not
 * `disabled`) so keyboard focus is not thrown back to the document and a
 * second click lands on something that moves the session forward instead of
 * on a dead control. Answering twice is impossible regardless: the reducer
 * ignores a pick while a verdict is showing.
 */
export function ChoiceOptions({ choices, selectedIndex, disabled, onChoose, onContinue }: ChoiceOptionsProps) {
  const revealing = selectedIndex !== null;
  // Finance answers carry units ("$1,250m", "-8,600%"), so the type steps
  // down when the longest option would otherwise be cut off on a phone.
  const longest = Math.max(...choices.options.map((option) => option.text.length));
  const size = longest > 10 ? "text-lg sm:text-2xl" : longest > 7 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl";
  return (
    <div className="grid w-full max-w-xl grid-cols-2 gap-2.5 sm:gap-3" role="group" aria-label="Answer options">
      {choices.options.map((option, index) => {
        const isCorrect = index === choices.correctIndex;
        const isSelected = index === selectedIndex;
        const tone = !revealing ? "idle" : isCorrect ? "correct" : isSelected ? "wrong" : "muted";
        return (
          <button
            key={index}
            type="button"
            disabled={disabled}
            aria-disabled={revealing || undefined}
            onClick={() => (revealing ? onContinue() : onChoose(index))}
            aria-label={`Option ${index + 1}: ${option.text}`}
            aria-pressed={isSelected}
            className={cx(
              "group relative flex min-h-16 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left sm:min-h-20 sm:px-5",
              // The verdict colours land in the same frame as the click; only
              // the idle hover state is worth animating.
              revealing ? "transition-none" : "transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              tone === "idle" && "border-line-strong bg-surface hover:border-ink disabled:hover:border-line-strong",
              tone === "correct" && "border-good bg-good-soft",
              tone === "wrong" && "border-bad bg-bad-soft",
              tone === "muted" && "border-line bg-surface opacity-50",
              revealing && "cursor-pointer",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              className={cx(
                "tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold",
                tone === "correct"
                  ? "border-good bg-good text-white"
                  : tone === "wrong"
                    ? "border-bad bg-bad text-white"
                    : "border-line-strong bg-paper-deep text-muted group-hover:border-ink group-hover:text-ink",
              )}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span
              className={cx(
                "tabular min-w-0 flex-1 truncate font-mono tracking-tight",
                size,
                tone === "correct" ? "text-good" : tone === "wrong" ? "text-bad line-through decoration-bad/60" : "text-ink",
              )}
            >
              {option.text}
            </span>
            {revealing && isCorrect && (
              <span className="text-xs font-semibold text-good" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
