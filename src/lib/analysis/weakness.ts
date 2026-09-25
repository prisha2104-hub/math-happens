import { ERROR_TAG_LABELS, type ErrorTag } from "@/lib/choice/types";
import type { TargetSpec } from "@/lib/engine/targeted";
import { DIFFICULTY_LABELS, type NumberType } from "@/lib/engine/types";
import type { Attempt } from "@/lib/session/types";
import { FEATURE_LABELS, type FeatureId, facetLabel, facetOf, featuresOf, skillId } from "./facets";

export type WeaknessKind = "skill" | "feature" | "error";
export type Confidence = "insufficient" | "emerging" | "established";
export type Signal = "accuracy" | "speed" | "repeat";

export interface Weakness {
  id: string;
  kind: WeaknessKind;
  label: string;
  detail: string;
  target: TargetSpec | null;
  attempts: number;
  incorrect: number;
  accuracy: number;
  averageResponseMs: number;
  /** Mean response time of comparable questions the user answered correctly, if enough exist. */
  baselineResponseMs: number | null;
  /** averageResponseMs ÷ baseline for correct answers in this group; null without a baseline. */
  slownessRatio: number | null;
  /** Distinct questions answered wrongly more than once. */
  repeatedMisses: number;
  recentIncorrect: number;
  lastMissedAt: number | null;
  score: number;
  confidence: Confidence;
  signals: Signal[];
}

export interface WeaknessOptions {
  now?: number;
  /** Misses older than this decay to half weight. */
  halfLifeDays?: number;
  /** Minimum attempts before accuracy or speed claims are made. */
  minAttempts?: number;
  /** Minimum misses before a group is called a weakness. */
  minIncorrect?: number;
  /** Correct answers this many times slower than comparable ones count as a speed weakness. */
  slowRatio?: number;
  limit?: number;
}

const DAY_MS = 86_400_000;
/** Accuracy below this counts as a deficit even when the user's overall average is lower still. */
export const ACCURACY_BAR = 0.8;
export const DEFAULTS: Required<WeaknessOptions> = {
  now: 0,
  halfLifeDays: 14,
  minAttempts: 4,
  minIncorrect: 2,
  slowRatio: 1.5,
  limit: 12,
};

interface Group {
  id: string;
  kind: WeaknessKind;
  label: string;
  detail: string;
  target: TargetSpec | null;
  attempts: Attempt[];
  /** Attempts to compare response times against (same kind of question, wider net). */
  baseline: Attempt[];
}

function decay(ageMs: number, halfLifeDays: number): number {
  return 0.5 ** (Math.max(0, ageMs) / (halfLifeDays * DAY_MS));
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

function mostCommonTarget(attempts: Attempt[]): TargetSpec | null {
  const counts = new Map<string, { target: TargetSpec; n: number }>();
  for (const a of attempts) {
    const target: TargetSpec = { numberType: a.numberType, operation: a.operation, difficulty: a.difficulty, facet: facetOf(a.meta.variant) };
    const key = `${a.numberType}/${a.operation}@${a.difficulty}#${target.facet}`;
    const entry = counts.get(key) ?? { target, n: 0 };
    entry.n += 1;
    counts.set(key, entry);
  }
  let best: { target: TargetSpec; n: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return best?.target ?? null;
}

function buildGroups(attempts: readonly Attempt[]): Group[] {
  const bySkill = new Map<string, Attempt[]>();
  const byFeature = new Map<string, Attempt[]>();
  const byError = new Map<ErrorTag, Attempt[]>();
  const byOpType = new Map<string, Attempt[]>();
  const byOpTypeDifficulty = new Map<string, Attempt[]>();

  const push = <K>(map: Map<K, Attempt[]>, key: K, a: Attempt) => {
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  };

  for (const a of attempts) {
    const facet = facetOf(a.meta.variant);
    push(bySkill, skillId(a.numberType, a.operation, facet, a.difficulty), a);
    for (const feature of featuresOf(a)) push(byFeature, `${feature}|${a.numberType}`, a);
    if (!a.correct && a.errorTag && a.errorTag !== "unclassified") push(byError, a.errorTag, a);
    push(byOpType, `${a.numberType}/${a.operation}`, a);
    push(byOpTypeDifficulty, `${a.numberType}/${a.operation}@${a.difficulty}`, a);
  }

  const groups: Group[] = [];
  for (const [id, list] of bySkill) {
    const sample = list[0] as Attempt;
    const facet = facetOf(sample.meta.variant);
    groups.push({
      id: `skill:${id}`,
      kind: "skill",
      label: facetLabel(facet, sample.numberType, sample.operation),
      detail: `${DIFFICULTY_LABELS[sample.difficulty]} · ${sample.numberType}s`,
      target: { numberType: sample.numberType, operation: sample.operation, difficulty: sample.difficulty, facet },
      attempts: list,
      baseline: byOpTypeDifficulty.get(`${sample.numberType}/${sample.operation}@${sample.difficulty}`) ?? [],
    });
  }
  for (const [key, list] of byFeature) {
    const [feature, numberType] = key.split("|") as [FeatureId, NumberType];
    const sample = list[0] as Attempt;
    const commonest = mostCommonTarget(list.filter((a) => !a.correct)) ?? mostCommonTarget(list);
    groups.push({
      id: `feature:${key}`,
      kind: "feature",
      label: FEATURE_LABELS[feature],
      detail: `${numberType}s · ${sample.operation}`,
      target: commonest ? { ...commonest, facet: null, feature } : null,
      attempts: list,
      baseline: byOpType.get(`${numberType}/${sample.operation}`) ?? [],
    });
  }
  for (const [tag, list] of byError) {
    groups.push({
      id: `error:${tag}`,
      kind: "error",
      label: ERROR_TAG_LABELS[tag],
      detail: "recurring mistake pattern",
      target: mostCommonTarget(list),
      attempts: list,
      baseline: [],
    });
  }
  return groups;
}

function evaluate(group: Group, overallAccuracy: number, options: Required<WeaknessOptions>): Weakness {
  const { now, halfLifeDays, minAttempts, minIncorrect, slowRatio } = options;
  const wrong = group.attempts.filter((a) => !a.correct);
  const right = group.attempts.filter((a) => a.correct);
  const attempts = group.attempts.length;
  const accuracy = attempts === 0 ? 0 : right.length / attempts;

  // Speed is judged on correct answers only, against correct answers to comparable questions.
  const groupIds = new Set(group.attempts.map((a) => a.id));
  const comparable = group.baseline.filter((a) => a.correct && !groupIds.has(a.id)).map((a) => a.responseMs);
  const baselineResponseMs = comparable.length >= minAttempts ? mean(comparable) : null;
  const ownCorrectResponse = mean(right.map((a) => a.responseMs));
  const slownessRatio = baselineResponseMs && ownCorrectResponse && baselineResponseMs > 0 ? ownCorrectResponse / baselineResponseMs : null;

  const weightedIncorrect = wrong.reduce((s, a) => s + decay(now - a.submittedAt, halfLifeDays), 0);
  const recentIncorrect = wrong.filter((a) => now - a.submittedAt <= 14 * DAY_MS).length;
  const missCounts = new Map<string, number>();
  for (const a of wrong) missCounts.set(a.expression, (missCounts.get(a.expression) ?? 0) + 1);
  const repeatedMisses = [...missCounts.values()].filter((n) => n >= 2).length;
  const lastMissedAt = wrong.length === 0 ? null : Math.max(...wrong.map((a) => a.submittedAt));

  const signals: Signal[] = [];
  // Judge against the user's own average or a fixed bar, whichever is stricter.
  const accuracyDeficit = Math.max(0, Math.max(overallAccuracy, ACCURACY_BAR) - accuracy);
  if (group.kind === "error" || (attempts >= minAttempts && wrong.length >= minIncorrect && accuracyDeficit > 0.05)) signals.push("accuracy");
  const slow = slownessRatio !== null && right.length >= minAttempts && slownessRatio >= slowRatio;
  if (slow) signals.push("speed");
  if (repeatedMisses > 0) signals.push("repeat");

  // Score: recency-weighted misses scaled by how far below par the group is,
  // plus speed and repetition terms. A lone slip cannot outrank a pattern.
  const accuracyScore = group.kind === "error" ? weightedIncorrect : weightedIncorrect * (0.5 + accuracyDeficit * 2);
  const speedScore = slow && slownessRatio !== null ? (slownessRatio - 1) * Math.min(right.length, 20) * 0.35 : 0;
  const repeatScore = repeatedMisses * 0.75;
  const score = Math.round((accuracyScore + speedScore + repeatScore) * 100) / 100;

  let confidence: Confidence = "insufficient";
  if (group.kind === "error") {
    confidence = wrong.length >= minIncorrect + 1 ? "established" : wrong.length >= minIncorrect ? "emerging" : "insufficient";
  } else if (signals.length > 0) {
    const strongAccuracy = attempts >= minAttempts * 2 && wrong.length >= minIncorrect + 1 && accuracyDeficit >= 0.1;
    const strongSpeed = slow && right.length >= minAttempts * 2;
    confidence = strongAccuracy || strongSpeed ? "established" : "emerging";
  }

  return {
    id: group.id,
    kind: group.kind,
    label: group.label,
    detail: group.detail,
    target: group.target,
    attempts,
    incorrect: wrong.length,
    accuracy,
    averageResponseMs: mean(group.attempts.map((a) => a.responseMs)) ?? 0,
    baselineResponseMs,
    slownessRatio,
    repeatedMisses,
    recentIncorrect,
    lastMissedAt,
    score,
    confidence,
    signals,
  };
}

export interface WeaknessReport {
  /** Ranked patterns with enough evidence, strongest first. */
  weaknesses: Weakness[];
  /** Patterns with some misses but too little data to call. */
  watchlist: Weakness[];
  overallAccuracy: number;
  totalAttempts: number;
}

/**
 * Find what the user struggles with. Groups attempts by skill (facet at a
 * difficulty), by structural feature and by mistake category, judges each
 * group on accuracy against the user's own average, on speed against
 * comparable questions, and on repeated misses, and refuses to promote a
 * group to a weakness without a minimum of evidence.
 */
export function analyzeWeaknesses(attempts: readonly Attempt[], options: WeaknessOptions = {}): WeaknessReport {
  const resolved: Required<WeaknessOptions> = { ...DEFAULTS, ...options, now: options.now ?? Date.now() };
  const totalAttempts = attempts.length;
  const overallAccuracy = totalAttempts === 0 ? 0 : attempts.filter((a) => a.correct).length / totalAttempts;
  const evaluated = buildGroups(attempts).map((g) => evaluate(g, overallAccuracy, resolved));
  const ranked = evaluated.filter((w) => w.score > 0).sort((a, b) => b.score - a.score || b.incorrect - a.incorrect);
  return {
    weaknesses: ranked.filter((w) => w.confidence !== "insufficient").slice(0, resolved.limit),
    watchlist: ranked.filter((w) => w.confidence === "insufficient" && w.incorrect > 0).slice(0, resolved.limit),
    overallAccuracy,
    totalAttempts,
  };
}

/** Skill-level weaknesses only, for building practice targets. */
export function weakSkills(report: WeaknessReport): Weakness[] {
  return report.weaknesses.filter((w) => w.kind === "skill" && w.target !== null);
}

export function describeTarget(target: TargetSpec): string {
  const facet = target.facet ? facetLabel(target.facet, target.numberType, target.operation) : null;
  const feature = target.feature ? FEATURE_LABELS[target.feature] : null;
  const base = `${target.operation} · ${target.numberType}s · ${DIFFICULTY_LABELS[target.difficulty]}`;
  return [facet ?? feature, base].filter(Boolean).join(" — ");
}
