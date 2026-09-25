import {
  DIFFICULTY_LABELS,
  NUMBER_TYPE_LABELS,
  OPERATIONS,
  OPERATION_SYMBOLS,
  NUMBER_TYPES,
} from "@/lib/engine/types";
import { ANSWER_FORMAT_LABELS, type TrainerSettings } from "@/lib/session/types";

/** One-line human summary, e.g. "4-minute timed session · Medium · + − × ÷ · Integers · Multiple choice". */
export function describeSettings(settings: TrainerSettings): string {
  const mode =
    settings.mode === "timed"
      ? `${settings.durationMinutes}-minute timed session`
      : settings.questionLimit === null
        ? "Untimed, open-ended"
        : `Untimed, ${settings.questionLimit} question${settings.questionLimit === 1 ? "" : "s"}`;
  const operations = OPERATIONS.filter((op) => settings.operations.includes(op))
    .map((op) => OPERATION_SYMBOLS[op])
    .join(" ");
  const numbers = NUMBER_TYPES.filter((t) => settings.numberTypes.includes(t))
    .map((t) => NUMBER_TYPE_LABELS[t])
    .join(", ");
  return [settings.plan ? "Improve" : null, mode, DIFFICULTY_LABELS[settings.difficulty], operations, numbers, ANSWER_FORMAT_LABELS[settings.answerFormat]]
    .filter(Boolean)
    .join(" · ");
}
