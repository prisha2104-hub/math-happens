import { cx } from "@/lib/ui/cx";

interface WordmarkProps {
  size?: "sm" | "lg";
  className?: string;
}

export function Wordmark({ size = "sm", className }: WordmarkProps) {
  return (
    <span className={cx("inline-flex items-baseline gap-1.5 whitespace-nowrap font-display tracking-tight text-ink", size === "lg" ? "text-4xl" : "text-xl", className)}>
      <span className="text-accent" aria-hidden="true">
        +
      </span>
      Math Happens
    </span>
  );
}
