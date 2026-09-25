import { facetLabel } from "@/lib/analysis/facets";
import { type Weakness, analyzeWeaknesses, describeTarget } from "@/lib/analysis/weakness";
import type { Rng } from "@/lib/engine/rng";
import { type TargetSpec, targetKey } from "@/lib/engine/targeted";
import type { Difficulty, NumberType, Operation } from "@/lib/engine/types";
import { itemLabel, reviewQueue, targetOfItem } from "@/lib/review/schedule";
import type { ReviewState } from "@/lib/review/types";
import type { Attempt } from "@/lib/session/types";
import { techniqueById } from "@/lib/techniques/library";

export type TargetReason = "weak-accuracy" | "slow" | "repeated-miss" | "review-due" | "fresh" | "focus" | "technique";

export const REASON_LABELS: Record<TargetReason, string> = {
  "weak-accuracy": "Low accuracy",
  slow: "Slow",
  "repeated-miss": "Repeated misses",
  "review-due": "Due for review",
  fresh: "Fresh practice",
  focus: "Your focus",
  technique: "Technique drill",
};

export interface PracticeTarget {
  target: TargetSpec;
  /** Share of questions drawn from this target; all weights in a plan sum to 1. */
  weight: number;
  reason: TargetReason;
  label: string;
  /** When set, questions are filtered so the technique applies to them. */
  techniqueId?: string;
}

export interface PracticePlan {
  targets: PracticeTarget[];
  createdAt: number;
  /** One line describing how the plan was built, shown to the user. */
  summary: string;
  /** True when there was too little history and the plan is only fresh practice. */
  coldStart: boolean;
}

export interface PracticePool {
  operations: readonly Operation[];
  numberTypes: readonly NumberType[];
  difficulty: Difficulty;
}

export interface PlanInput {
  attempts: readonly Attempt[];
  review: ReviewState;
  /** The user's own selection; fresh practice never leaves it. */
  pool: PracticePool;
  now: number;
  /** Narrow the whole plan to one skill (from the notebook or a weakness card). */
  focus?: TargetSpec | null;
  /** Drill one technique instead of the adaptive mix. */
  techniqueId?: string | null;
}

const SHARES = { weak: 0.55, review: 0.25, fresh: 0.2 };
const MAX_WEAK_TARGETS = 6;
const MAX_REVIEW_TARGETS = 6;
/** No single weak skill may take more than this share of the weak portion. */
const MAX_SINGLE_WEAK_SHARE = 0.4;

function normalize(targets: PracticeTarget[]): PracticeTarget[] {
  const total = targets.reduce((s, t) => s + t.weight, 0);
  if (total === 0) return targets;
  return targets.map((t) => ({ ...t, weight: t.weight / total }));
}

function scaleTo(targets: PracticeTarget[], share: number): PracticeTarget[] {
  return normalize(targets).map((t) => ({ ...t, weight: t.weight * share }));
}

/**
 * Normalise weights so that no target exceeds `cap` of the total (or 1/n when
 * that is larger). Excess is redistributed proportionally to the others.
 */
export function capShares(targets: PracticeTarget[], cap: number): PracticeTarget[] {
  if (targets.length === 0) return targets;
  const limit = Math.max(cap, 1 / targets.length);
  let current = normalize(targets);
  for (let round = 0; round < 10; round += 1) {
    const over = current.filter((t) => t.weight > limit + 1e-12);
    if (over.length === 0) break;
    const excess = over.reduce((s, t) => s + (t.weight - limit), 0);
    const under = current.filter((t) => t.weight <= limit + 1e-12);
    const underTotal = under.reduce((s, t) => s + t.weight, 0);
    current = current.map((t) =>
      t.weight > limit + 1e-12 ? { ...t, weight: limit } : { ...t, weight: underTotal > 0 ? t.weight + (excess * t.weight) / underTotal : t.weight + excess / under.length },
    );
  }
  return current;
}

function reasonFor(w: Weakness): TargetReason {
  if (w.signals.includes("repeat")) return "repeated-miss";
  if (w.signals.includes("speed") && !w.signals.includes("accuracy")) return "slow";
  return "weak-accuracy";
}

function freshTargets(pool: PracticePool): PracticeTarget[] {
  const targets: PracticeTarget[] = [];
  for (const numberType of pool.numberTypes) {
    for (const operation of pool.operations) {
      const target: TargetSpec = { numberType, operation, difficulty: pool.difficulty };
      targets.push({ target, weight: 1, reason: "fresh", label: describeTarget(target) });
    }
  }
  return targets;
}

/**
 * Build a practice plan. Weak skills (by accuracy, speed and repeated misses)
 * take the largest share, skills due for review the next, and a slice of fresh
 * questions from the user's own selection keeps the session from becoming a
 * grind. Isolated mistakes never reach the plan because the weakness report
 * already requires a minimum of evidence, and no single weak skill can take
 * more than 40 % of the weak share.
 */
export function buildPracticePlan({ attempts, review, pool, now, focus = null, techniqueId = null }: PlanInput): PracticePlan {
  if (techniqueId) {
    const technique = techniqueById(techniqueId);
    if (technique) {
      const target: TargetSpec = { ...technique.practice, facet: technique.practice.facet ?? null, feature: technique.practice.feature ?? null };
      return {
        targets: [{ target, weight: 1, reason: "technique", label: technique.title, techniqueId }],
        createdAt: now,
        summary: `Every question is chosen so that "${technique.title}" applies.`,
        coldStart: false,
      };
    }
  }

  if (focus) {
    const broad: TargetSpec = { numberType: focus.numberType, operation: focus.operation, difficulty: focus.difficulty };
    const focused: PracticeTarget = { target: focus, weight: 0.75, reason: "focus", label: describeTarget(focus) };
    const related: PracticeTarget = { target: broad, weight: 0.25, reason: "fresh", label: describeTarget(broad) };
    const distinct = targetKey(focus) === targetKey(broad);
    return {
      targets: distinct ? [{ ...focused, weight: 1 }] : [focused, related],
      createdAt: now,
      summary: distinct ? `Fresh questions from ${describeTarget(focus)}.` : `Mostly ${focused.label}, with some wider ${focus.operation} practice mixed in.`,
      coldStart: false,
    };
  }

  const report = analyzeWeaknesses(attempts, { now });
  const weakByKey = new Map<string, PracticeTarget>();
  for (const w of report.weaknesses) {
    if (w.kind !== "skill" || !w.target) continue;
    if (weakByKey.size >= MAX_WEAK_TARGETS) break;
    const key = targetKey(w.target);
    if (!weakByKey.has(key)) weakByKey.set(key, { target: w.target, weight: w.score, reason: reasonFor(w), label: w.label });
  }
  const weak = capShares([...weakByKey.values()], MAX_SINGLE_WEAK_SHARE);

  const due = reviewQueue(review, now).dueNow.slice(0, MAX_REVIEW_TARGETS);
  const reviewTargets: PracticeTarget[] = [];
  for (const item of due) {
    const target = targetOfItem(item);
    const key = targetKey(target);
    const existing = weakByKey.get(key);
    if (existing) continue; // already covered by the weak share; the review share goes to other due skills
    reviewTargets.push({ target, weight: 1, reason: "review-due", label: facetLabel(item.facet, item.numberType, item.operation) || itemLabel(item) });
  }

  const fresh = freshTargets(pool);
  const hasWeak = weak.length > 0;
  const hasReview = reviewTargets.length > 0;

  let targets: PracticeTarget[];
  let summary: string;
  if (!hasWeak && !hasReview) {
    targets = normalize(fresh);
    summary =
      attempts.length === 0
        ? "No history yet, so this is ordinary practice from your selection. Weak spots will steer future plans."
        : "Nothing stands out as weak yet, so this is ordinary practice from your selection.";
  } else {
    const weakShare = hasWeak ? (hasReview ? SHARES.weak : SHARES.weak + SHARES.review) : 0;
    const reviewShare = hasReview ? (hasWeak ? SHARES.review : SHARES.weak + SHARES.review) : 0;
    targets = normalize([...scaleTo(weak, weakShare), ...scaleTo(reviewTargets, reviewShare), ...scaleTo(fresh, SHARES.fresh)]);
    const parts = [
      hasWeak ? `${Math.round(weakShare * 100)}% weak skills` : null,
      hasReview ? `${Math.round(reviewShare * 100)}% skills due for review` : null,
      `${Math.round(SHARES.fresh * 100)}% fresh questions from your selection`,
    ].filter(Boolean);
    summary = parts.join(" · ");
  }

  return { targets: targets.sort((a, b) => b.weight - a.weight), createdAt: now, summary, coldStart: !hasWeak && !hasReview };
}

/** Weighted random choice of the next target. */
export function pickTarget(plan: PracticePlan, rng: Rng): PracticeTarget {
  const total = plan.targets.reduce((s, t) => s + t.weight, 0);
  let roll = rng.next() * total;
  for (const target of plan.targets) {
    roll -= target.weight;
    if (roll <= 0) return target;
  }
  return plan.targets[plan.targets.length - 1] as PracticeTarget;
}
