import { facetLabel, facetOf, skillId } from "@/lib/analysis/facets";
import type { TargetSpec } from "@/lib/engine/targeted";
import type { Attempt } from "@/lib/session/types";
import { type ReviewItem, type ReviewState } from "./types";

const DAY_MS = 86_400_000;

/**
 * Leitner-style schedule. A miss puts the skill at stage 0 (due immediately);
 * every ADVANCE_STREAK correct answers in a row move it up one stage and push
 * the next review out by the stage's interval. The table is deliberately
 * short and readable so the user can see exactly why something is due.
 */
export const STAGE_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_STAGE = STAGE_INTERVAL_DAYS.length - 1;
/** Stage from which a skill counts as mastered (still reviewed, rarely). */
export const MASTERY_STAGE = 5;
/** Stage from which a skill counts as improving. */
export const IMPROVING_STAGE = 3;
/** Consecutive correct answers needed to advance a stage. */
export const ADVANCE_STREAK = 2;
const HISTORY_LENGTH = 10;

export interface SkillRef {
  skillId: string;
  numberType: Attempt["numberType"];
  operation: Attempt["operation"];
  difficulty: Attempt["difficulty"];
  facet: string;
}

export function skillOfAttempt(attempt: Attempt): SkillRef {
  const facet = facetOf(attempt.meta.variant);
  return {
    skillId: skillId(attempt.numberType, attempt.operation, facet, attempt.difficulty),
    numberType: attempt.numberType,
    operation: attempt.operation,
    difficulty: attempt.difficulty,
    facet,
  };
}

export function itemLabel(item: ReviewItem): string {
  return facetLabel(item.facet, item.numberType, item.operation);
}

export function targetOfItem(item: ReviewItem): TargetSpec {
  return { numberType: item.numberType, operation: item.operation, difficulty: item.difficulty, facet: item.facet };
}

function newItem(skill: SkillRef, now: number): ReviewItem {
  return {
    ...skill,
    stage: 0,
    dueAt: now,
    lapses: 0,
    streak: 0,
    history: [],
    lastOutcomeAt: now,
    lastLapseAt: null,
    createdAt: now,
  };
}

/**
 * Fold one attempt into the schedule. Only skills that have been missed at
 * least once are tracked; a correct answer on an untracked skill changes
 * nothing. A single correct answer never clears a tracked skill — it takes
 * ADVANCE_STREAK in a row to move up a stage, and MASTERY_STAGE stages to be
 * called mastered.
 */
export function applyAttempt(state: ReviewState, attempt: Attempt, now = attempt.submittedAt): ReviewState {
  const skill = skillOfAttempt(attempt);
  const existing = state.items[skill.skillId];
  if (attempt.correct && !existing) return state;

  const base = existing ?? newItem(skill, now);
  const history = [...base.history, attempt.correct].slice(-HISTORY_LENGTH);
  let next: ReviewItem;
  if (!attempt.correct) {
    next = { ...base, stage: 0, dueAt: now, lapses: base.lapses + 1, streak: 0, history, lastOutcomeAt: now, lastLapseAt: now };
  } else {
    const streak = base.streak + 1;
    if (streak >= ADVANCE_STREAK) {
      const stage = Math.min(base.stage + 1, MAX_STAGE);
      next = { ...base, stage, streak: 0, dueAt: now + STAGE_INTERVAL_DAYS[stage]! * DAY_MS, history, lastOutcomeAt: now };
    } else {
      next = { ...base, streak, history, lastOutcomeAt: now };
    }
  }
  return { items: { ...state.items, [skill.skillId]: next }, updatedAt: Math.max(state.updatedAt, now) };
}

export function applyAttempts(state: ReviewState, attempts: readonly Attempt[]): ReviewState {
  return [...attempts].sort((a, b) => a.submittedAt - b.submittedAt).reduce((acc, attempt) => applyAttempt(acc, attempt), state);
}

export type ReviewStatus = "due-now" | "scheduled" | "improving" | "mastered";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  "due-now": "Due now",
  scheduled: "Due later",
  improving: "Improving",
  mastered: "Mastered",
};

export function statusOf(item: ReviewItem, now: number): ReviewStatus {
  if (item.dueAt <= now) return "due-now";
  if (item.stage >= MASTERY_STAGE) return "mastered";
  if (item.stage >= IMPROVING_STAGE) return "improving";
  return "scheduled";
}

export interface ReviewQueue {
  dueNow: ReviewItem[];
  scheduled: ReviewItem[];
  improving: ReviewItem[];
  mastered: ReviewItem[];
}

/** Items bucketed by status; due items most overdue first, the rest soonest first. */
export function reviewQueue(state: ReviewState, now: number): ReviewQueue {
  const queue: ReviewQueue = { dueNow: [], scheduled: [], improving: [], mastered: [] };
  for (const item of Object.values(state.items)) {
    switch (statusOf(item, now)) {
      case "due-now":
        queue.dueNow.push(item);
        break;
      case "scheduled":
        queue.scheduled.push(item);
        break;
      case "improving":
        queue.improving.push(item);
        break;
      case "mastered":
        queue.mastered.push(item);
        break;
    }
  }
  const byDue = (a: ReviewItem, b: ReviewItem) => a.dueAt - b.dueAt;
  queue.dueNow.sort(byDue);
  queue.scheduled.sort(byDue);
  queue.improving.sort(byDue);
  queue.mastered.sort(byDue);
  return queue;
}

/** "due now", "due tomorrow", "due in 3 days", "due in 2 weeks". */
export function describeDue(item: ReviewItem, now: number): string {
  const diff = item.dueAt - now;
  if (diff <= 0) return "due now";
  const days = Math.ceil(diff / DAY_MS);
  if (days <= 1) return "due tomorrow";
  if (days < 14) return `due in ${days} days`;
  return `due in ${Math.round(days / 7)} weeks`;
}

/** Correct answers still needed before the skill moves up a stage. */
export function correctNeeded(item: ReviewItem): number {
  return Math.max(0, ADVANCE_STREAK - item.streak);
}
