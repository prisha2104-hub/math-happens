"use client";

import { type RefObject, useEffect, useId } from "react";
import { cx } from "@/lib/ui/cx";

interface AnswerInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  error: string | null;
  /** Changes whenever a new answer was judged; drives the flash animation. */
  flashKey: string | null;
  flashTone: "good" | "bad" | null;
  /** Use the numeric keyboard on touch devices when no answer can need "/" or "-". */
  numericKeyboard: boolean;
}

const FLASH_RGB = { good: "44, 122, 75", bad: "179, 38, 30" };

export function AnswerInput({ inputRef, value, onChange, onSubmit, disabled, error, flashKey, flashTone, numericKeyboard }: AnswerInputProps) {
  const errorId = useId();

  // Brief ring in the verdict colour after each judged answer.
  useEffect(() => {
    const element = inputRef.current;
    if (flashKey === null || flashTone === null || !element || typeof element.animate !== "function") return;
    const rgb = FLASH_RGB[flashTone];
    const animation = element.animate(
      [
        { boxShadow: `0 0 0 0 rgba(${rgb}, 0.5)`, borderColor: `rgb(${rgb})` },
        { boxShadow: `0 0 0 10px rgba(${rgb}, 0)`, borderColor: `rgb(${rgb})`, offset: 0.75 },
        { boxShadow: `0 0 0 10px rgba(${rgb}, 0)` },
      ],
      { duration: 650, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [flashKey, flashTone, inputRef]);

  return (
    <form
      className="flex w-full max-w-xs flex-col items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode={numericKeyboard ? "decimal" : "text"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-label="Your answer"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        placeholder={disabled ? "" : "Answer"}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "tabular h-16 w-full rounded-xl border-2 bg-surface text-center font-mono text-3xl text-ink placeholder:text-faint",
          "transition-colors focus:outline-none disabled:bg-paper-deep disabled:text-muted",
          error ? "border-bad" : "border-line-strong focus:border-ink",
        )}
      />
      <div className="min-h-5 text-center text-sm" aria-live="polite">
        {error && (
          <span id={errorId} className="text-bad">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
