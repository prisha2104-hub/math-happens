import type { NumberType } from "@/lib/engine/types";
import { formatOperand } from "@/lib/engine/generate";
import type { Rational } from "@/lib/math/rational";
import { cx } from "@/lib/ui/cx";

interface FractionTextProps {
  value: Rational;
  numberType: NumberType;
  className?: string;
}

/**
 * Renders an operand in its number style. Fractions are stacked vertically
 * (numerator over denominator); everything else is plain text.
 */
export function FractionText({ value, numberType, className }: FractionTextProps) {
  if (numberType !== "fraction" || value.den === 1) {
    return <span className={className}>{formatOperand(value, numberType)}</span>;
  }
  return (
    <span className={cx("inline-flex items-center align-middle", className)} aria-label={`${value.num} over ${value.den}`}>
      {value.num < 0 && <span className="mr-1">−</span>}
      <span className="inline-flex flex-col items-center leading-none" aria-hidden="true">
        <span className="px-1 pb-[0.08em]">{Math.abs(value.num)}</span>
        <span className="w-full border-t-[0.06em] border-current px-1 pt-[0.1em] text-center">{value.den}</span>
      </span>
    </span>
  );
}
