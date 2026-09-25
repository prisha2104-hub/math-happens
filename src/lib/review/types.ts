import type { Difficulty, NumberType, Operation } from "@/lib/engine/types";

/**
 * Review is scheduled per skill (a number type × operation × generator facet
 * at a difficulty), not per individual question, so a missed 672 ÷ 16 puts
 * "two-digit divisors, medium" on the calendar and later reviews use fresh
 * questions from that skill.
 */
export interface ReviewItem {
  /** Stable id, e.g. "integer/division/2digit-divisor@medium". */
  skillId: string;
  numberType: NumberType;
  operation: Operation;
  difficulty: Difficulty;
  facet: string;
  /** Leitner stage 0..MAX; higher stages review less often. */
  stage: number;
  /** Epoch ms when the skill is next due. */
  dueAt: number;
  /** Total number of misses recorded for the skill. */
  lapses: number;
  /** Correct answers in a row since the latest miss. */
  streak: number;
  /** Most recent outcomes, newest last (true = correct). */
  history: boolean[];
  lastOutcomeAt: number;
  lastLapseAt: number | null;
  createdAt: number;
}

export interface ReviewState {
  items: Record<string, ReviewItem>;
  updatedAt: number;
}

export const EMPTY_REVIEW_STATE: ReviewState = { items: {}, updatedAt: 0 };
