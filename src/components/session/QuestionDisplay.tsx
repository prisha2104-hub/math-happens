import { FractionText } from "@/components/ui/FractionText";
import { OPERATION_SYMBOLS, type Question } from "@/lib/engine/types";
import { UNIT_HINTS } from "@/lib/engine/units";

interface QuestionDisplayProps {
  question: Question;
}

/**
 * Word problems read as a sentence at a size that stays legible on a phone,
 * with the rounding or estimation instruction and the unit the answer is
 * wanted in underneath. Two-operand arithmetic keeps the big display it had.
 */
function PromptDisplay({ question }: { question: Question }) {
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
      <p className="text-balance text-2xl font-medium leading-snug tracking-tight text-ink sm:text-3xl" aria-label={question.prompt}>
        {question.prompt}
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded-full border border-line-strong bg-paper-deep px-2 py-0.5">Answer in {UNIT_HINTS[question.unit ?? "plain"]}</span>
        {question.instruction && <span className="text-ink-soft">{question.instruction}</span>}
      </p>
    </div>
  );
}

export function QuestionDisplay({ question }: QuestionDisplayProps) {
  if (question.prompt !== undefined) return <PromptDisplay question={question} />;
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
