import { applyAttempts } from "@/lib/review/schedule";
import type { ReviewState } from "@/lib/review/types";
import type { Attempt, SessionSummary } from "@/lib/session/types";
import { getRepositories } from "@/lib/storage/client";
import type { Repositories } from "@/lib/storage/repositories";

/**
 * Review state for a store that predates the review calendar: rebuild it once
 * by replaying every stored attempt in order, then mark it initialised so the
 * replay never runs again. Stores that already have review state are untouched.
 */
export async function ensureReviewState(repos: Repositories = getRepositories(), now = Date.now()): Promise<ReviewState> {
  const review = await repos.review.load();
  if (review.updatedAt > 0) return review;
  const attempts = await repos.attempts.listAll();
  if (attempts.length === 0) return review;
  const rebuilt = applyAttempts(review, attempts);
  const initialised = { ...rebuilt, updatedAt: Math.max(rebuilt.updatedAt, now) };
  await repos.review.save(initialised);
  return initialised;
}

/**
 * Persist a finished session and fold its answers into the review schedule.
 * The session is written first so a review-state failure never loses answers.
 */
export async function recordCompletedSession(summary: SessionSummary, attempts: Attempt[], repos: Repositories = getRepositories()): Promise<void> {
  await repos.saveCompletedSession(summary, attempts);
  const review = await repos.review.load();
  await repos.review.save(applyAttempts(review, attempts));
}
