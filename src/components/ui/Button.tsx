import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/ui/cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong border-transparent shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]",
  secondary: "bg-surface text-ink border-line-strong hover:bg-paper-deep",
  ghost: "bg-transparent text-ink-soft border-transparent hover:bg-paper-deep hover:text-ink",
  danger: "bg-surface text-bad border-line-strong hover:border-bad hover:bg-bad-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium tracking-tight transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
