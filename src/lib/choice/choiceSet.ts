import { formatOperand } from "@/lib/engine/generate";
import type { Rng } from "@/lib/engine/rng";
import type { Question } from "@/lib/engine/types";
import { type Rational, equals } from "@/lib/math/rational";
import { distractorCandidates, fallbackDistractors, isSensibleDistractor, tagPriority } from "./distractors";
import type { ChoiceOption, ChoiceSet, Distractor, ErrorTag } from "./types";

export const CHOICE_COUNT = 4;

/**
 * Pick three distractors for the question: one from each of the most
 * characteristic mistake families first (so the options test different
 * misconceptions), then any remaining sensible candidates, then generic
 * near-misses. Values are compared exactly, so equivalent fractions and
 * `0.5` versus `1/2` can never appear as separate options.
 */
export function selectDistractors(question: Question, rng: Rng, count = CHOICE_COUNT - 1): Distractor[] {
  const unique: Distractor[] = [];
  for (const candidate of distractorCandidates(question)) {
    if (!isSensibleDistractor(question, candidate)) continue;
    if (unique.some((d) => equals(d.value, candidate.value))) continue;
    unique.push(candidate);
  }

  const groups = new Map<ErrorTag, Distractor[]>();
  for (const d of unique) {
    const list = groups.get(d.tag);
    if (list) list.push(d);
    else groups.set(d.tag, [d]);
  }
  const order: ErrorTag[] = [...tagPriority(question), ...groups.keys()].filter((tag, i, all) => all.indexOf(tag) === i);

  const chosen: Distractor[] = [];
  // Round-robin over tag families until we have enough or run dry.
  while (chosen.length < count) {
    let progressed = false;
    for (const tag of order) {
      const pool = groups.get(tag);
      if (!pool || pool.length === 0) continue;
      const index = rng.int(0, pool.length - 1);
      const [picked] = pool.splice(index, 1);
      if (picked) {
        chosen.push(picked);
        progressed = true;
        if (chosen.length === count) break;
      }
    }
    if (!progressed) break;
  }

  if (chosen.length < count) {
    chosen.push(...fallbackDistractors(question, count - chosen.length, chosen.map((d) => d.value)));
  }
  return chosen.slice(0, count);
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Four options with the correct one in a uniformly random position. */
export function buildChoiceSet(question: Question, rng: Rng): ChoiceSet {
  const distractors = selectDistractors(question, rng);
  const options: ChoiceOption[] = [
    { value: question.answer, text: question.answerText, tag: null },
    ...distractors.map((d) => ({ value: d.value, text: formatOperand(d.value, question.numberType), tag: d.tag })),
  ];
  const shuffled = shuffle(options, rng);
  return { options: shuffled, correctIndex: shuffled.findIndex((o) => o.tag === null) };
}

export function isCorrectChoice(set: ChoiceSet, index: number): boolean {
  return index === set.correctIndex;
}

export function choiceValue(set: ChoiceSet, index: number): Rational | null {
  return set.options[index]?.value ?? null;
}

/** Map a key press to an option index: "1"–"4" (and numpad) select options. */
export function keyToChoiceIndex(key: string): number | null {
  const index = Number.parseInt(key, 10) - 1;
  return key.length === 1 && index >= 0 && index < CHOICE_COUNT ? index : null;
}
