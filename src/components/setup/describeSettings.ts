import {
  DIFFICULTY_LABELS,
  NUMBER_TYPE_LABELS,
  OPERATIONS,
  OPERATION_SYMBOLS,
  NUMBER_TYPES,
} from "@/lib/engine/types";
import { ANSWER_FORMAT_LABELS, type TrainerSettings, effectiveNumberTypes, effectiveOperations } from "@/lib/session/types";

/** One-line human summary, e.g. "4-minute timed session · Medium · + − × ÷ · Integers · Multiple choice". */
export function describeSettings(settings: TrainerSettings): string {
  const mode =
    settings.mode === "timed"
      ? `${settings.durationMinutes}-minute timed session`
      : settings.questionLimit === null
        ? "Untimed, open-ended"
        : `Untimed, ${settings.questionLimit} question${settings.questionLimit === 1 ? "" : "s"}`;
  const selectedOperations = effectiveOperations(settings);
  const selectedNumberTypes = effectiveNumberTypes(settings);
  // A finance-only session has no number format to speak of: its questions
  // are word problems that bring their own numbers.
  const financeOnly = selectedOperations.length === 1 && selectedOperations[0] === "finance";
  const operations = financeOnly
    ? "Finance maths"
    : OPERATIONS.filter((op) => selectedOperations.includes(op))
        .map((op) => OPERATION_SYMBOLS[op])
        .join(" ");
  const numbers = financeOnly
    ? null
    : NUMBER_TYPES.filter((t) => selectedNumberTypes.includes(t))
        .map((t) => NUMBER_TYPE_LABELS[t])
        .join(", ");
  return [
    settings.plan ? "Improve" : null,
    mode,
    DIFFICULTY_LABELS[settings.difficulty],
    operations,
    numbers,
    ANSWER_FORMAT_LABELS[settings.answerFormat],
    settings.advanced.enabled ? "Advanced settings on" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
