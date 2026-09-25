import { describe, expect, it } from "vitest";
import { makeAttempt, makeSummary } from "@/lib/testing/fixtures";
import { ensureReviewState, recordCompletedSession } from "@/lib/services/recordSession";
import { createRepositories } from "@/lib/storage/repositories";
import { MemoryAdapter } from "@/lib/storage/storage";
import {
  ADVANCE_STREAK,
  MASTERY_STAGE,
  STAGE_INTERVAL_DAYS,
  applyAttempt,
  applyAttempts,
  correctNeeded,
  describeDue,
  itemLabel,
  reviewQueue,
  skillOfAttempt,
  statusOf,
  targetOfItem,
} from "./schedule";
import { EMPTY_REVIEW_STATE } from "./types";

const DAY = 86_400_000;
const T = 1_800_000_000_000;

function attemptAt(correct: boolean, at: number, variant = "int-div-2digit-divisor") {
  return makeAttempt({ correct, submittedAt: at, operation: "division", difficulty: "medium", meta: { ...makeAttempt().meta, variant } });
}

describe("review scheduling", () => {
  it("identifies the skill of an attempt", () => {
    const skill = skillOfAttempt(attemptAt(false, T, "int-div-2digit-divisor-large"));
    expect(skill).toEqual({
      skillId: "integer/division/int-div-2digit-divisor-large@medium",
      numberType: "integer",
      operation: "division",
      difficulty: "medium",
      facet: "int-div-2digit-divisor-large",
    });
  });

  it("ignores correct answers on skills that were never missed", () => {
    expect(applyAttempt(EMPTY_REVIEW_STATE, attemptAt(true, T))).toBe(EMPTY_REVIEW_STATE);
  });

  it("makes a missed skill due immediately and tracks lapses", () => {
    const state = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T));
    const item = Object.values(state.items)[0]!;
    expect(item).toMatchObject({ stage: 0, dueAt: T, lapses: 1, streak: 0, history: [false], lastLapseAt: T });
    expect(statusOf(item, T)).toBe("due-now");
    expect(itemLabel(item)).toBe("Two-digit divisors");
    expect(targetOfItem(item)).toEqual({ numberType: "integer", operation: "division", difficulty: "medium", facet: "int-div-2digit-divisor" });
    expect(describeDue(item, T)).toBe("due now");
  });

  it("does not clear a weakness after a single correct answer", () => {
    let state = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T));
    state = applyAttempt(state, attemptAt(true, T + 60_000));
    const item = Object.values(state.items)[0]!;
    expect(item.stage).toBe(0);
    expect(item.streak).toBe(1);
    expect(statusOf(item, T + 60_000)).toBe("due-now");
    expect(correctNeeded(item)).toBe(ADVANCE_STREAK - 1);
  });

  it("advances a stage after the required streak and schedules the next review", () => {
    let state = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T));
    for (let i = 0; i < ADVANCE_STREAK; i += 1) state = applyAttempt(state, attemptAt(true, T + (i + 1) * 60_000));
    const item = Object.values(state.items)[0]!;
    expect(item.stage).toBe(1);
    expect(item.streak).toBe(0);
    expect(item.dueAt).toBe(T + ADVANCE_STREAK * 60_000 + STAGE_INTERVAL_DAYS[1]! * DAY);
    expect(statusOf(item, T + ADVANCE_STREAK * 60_000)).toBe("scheduled");
    expect(describeDue(item, T + ADVANCE_STREAK * 60_000)).toBe("due tomorrow");
  });

  it("resets to stage 0 on a later miss but remembers the lapse count", () => {
    let state = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T));
    state = applyAttempts(state, [attemptAt(true, T + 1), attemptAt(true, T + 2), attemptAt(true, T + 3), attemptAt(true, T + 4)]);
    expect(Object.values(state.items)[0]!.stage).toBe(2);
    state = applyAttempt(state, attemptAt(false, T + 5));
    const item = Object.values(state.items)[0]!;
    expect(item.stage).toBe(0);
    expect(item.lapses).toBe(2);
    expect(item.history.length).toBe(6);
  });

  it("reaches mastery only after sustained success and keeps a long interval", () => {
    let state = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T));
    let clock = T;
    for (let stage = 0; stage < MASTERY_STAGE; stage += 1) {
      for (let i = 0; i < ADVANCE_STREAK; i += 1) {
        clock += 1000;
        state = applyAttempt(state, attemptAt(true, clock));
      }
    }
    const item = Object.values(state.items)[0]!;
    expect(item.stage).toBe(MASTERY_STAGE);
    expect(statusOf(item, clock)).toBe("mastered");
    expect(describeDue(item, clock)).toBe("due in 4 weeks");
    expect(statusOf(item, item.dueAt)).toBe("due-now");
  });

  it("buckets the queue by status and sorts by due time", () => {
    let state = EMPTY_REVIEW_STATE;
    state = applyAttempt(state, attemptAt(false, T, "int-div-2digit-divisor")); // due now
    state = applyAttempt(state, attemptAt(false, T - DAY, "frac-add")); // due now, more overdue
    state = applyAttempts(state, [attemptAt(false, T, "int-mul-2x2"), attemptAt(true, T + 1, "int-mul-2x2"), attemptAt(true, T + 2, "int-mul-2x2")]); // scheduled
    let improving = applyAttempt(EMPTY_REVIEW_STATE, attemptAt(false, T, "dec-add-1dp-1dp"));
    for (let i = 0; i < ADVANCE_STREAK * 3; i += 1) improving = applyAttempt(improving, attemptAt(true, T + 10 + i, "dec-add-1dp-1dp"));
    state = { items: { ...state.items, ...improving.items }, updatedAt: T };

    const queue = reviewQueue(state, T + 5);
    expect(queue.dueNow.map((i) => i.facet)).toEqual(["frac-add", "int-div-2digit-divisor"]);
    expect(queue.scheduled.map((i) => i.facet)).toEqual(["int-mul-2x2"]);
    expect(queue.improving.map((i) => i.facet)).toEqual(["dec-add-1dp-1dp"]);
    expect(queue.mastered).toEqual([]);
  });

  it("applies attempts in chronological order regardless of input order", () => {
    const later = attemptAt(true, T + 2);
    const miss = attemptAt(false, T);
    const first = attemptAt(true, T + 1);
    const state = applyAttempts(EMPTY_REVIEW_STATE, [later, miss, first]);
    const item = Object.values(state.items)[0]!;
    expect(item.history).toEqual([false, true, true]);
    expect(item.stage).toBe(1);
  });

  it("is persisted alongside the session by the record service", async () => {
    const repos = createRepositories(new MemoryAdapter());
    const attempts = [attemptAt(false, T), attemptAt(true, T + 1)];
    await recordCompletedSession(makeSummary({ id: "s1", endedAt: T + 2 }), attempts, repos);
    expect((await repos.sessions.list()).map((s) => s.id)).toEqual(["s1"]);
    const review = await repos.review.load();
    expect(Object.keys(review.items)).toEqual(["integer/division/int-div-2digit-divisor@medium"]);
    expect(review.items["integer/division/int-div-2digit-divisor@medium"]?.streak).toBe(1);
  });
});

describe("ensureReviewState", () => {
  it("rebuilds the calendar once from stored attempts and then leaves it alone", async () => {
    const repos = createRepositories(new MemoryAdapter());
    await repos.saveCompletedSession(makeSummary({ id: "old", endedAt: T }), [attemptAt(false, T - 10), attemptAt(true, T - 5)]);
    const first = await ensureReviewState(repos, T);
    expect(Object.keys(first.items)).toEqual(["integer/division/int-div-2digit-divisor@medium"]);
    expect(first.items["integer/division/int-div-2digit-divisor@medium"]?.streak).toBe(1);
    expect(first.updatedAt).toBeGreaterThan(0);

    // A later miss recorded directly is not replayed twice.
    await repos.saveCompletedSession(makeSummary({ id: "new", endedAt: T + 100 }), [attemptAt(false, T + 50)]);
    const second = await ensureReviewState(repos, T + 200);
    expect(second).toEqual(first);
  });

  it("leaves an empty store empty", async () => {
    const repos = createRepositories(new MemoryAdapter());
    expect(await ensureReviewState(repos, T)).toEqual(EMPTY_REVIEW_STATE);
  });
});
