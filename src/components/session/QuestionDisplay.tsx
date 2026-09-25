import { FractionText } from "@/components/ui/FractionText";
import { OPERATION_SYMBOLS, type Question } from "@/lib/engine/types";

interface QuestionDisplayProps {
  question: Question;
}

export function QuestionDisplay({ question }: QuestionDisplayProps) {
  const [a, b] = question.operands;
  const fraction = question.numberType === "fraction";
  return (
    <div
      className="tabular flex flex-wrap items-center justify-center gap-x-[0.35em] font-medium tracking-tight text-ink"
      style={{ fontSize: fraction ? "clamp(2.25rem, 7vw, 4.25rem)" : "clamp(2.75rem, 9vw, 5.5rem)" }}
      aria-label={question.expression}
    >
      <FractionText value={a} numberType={question.numberType} />
      <span className="text-ink-soft" aria-hidden="true">
        {OPERATION_SYMBOLS[question.operation]}
      </span>
      <FractionText value={b} numberType={question.numberType} />
    </div>
  );
}
