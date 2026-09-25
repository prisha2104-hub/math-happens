import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

interface ToggleChipProps {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Optional leading glyph, e.g. an operation symbol. */
  glyph?: ReactNode;
  className?: string;
}

/** A checkbox-like pill for multi-select settings. */
export function ToggleChip({ pressed, onToggle, children, glyph, className }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium tracking-tight transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        pressed
          ? "border-ink bg-ink text-paper hover:bg-ink-soft"
          : "border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink",
        className,
      )}
    >
      {glyph !== undefined && (
        <span className={cx("font-mono text-base leading-none", pressed ? "text-accent-soft" : "text-accent")} aria-hidden="true">
          {glyph}
        </span>
      )}
      {children}
    </button>
  );
}
