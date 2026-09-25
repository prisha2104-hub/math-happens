import { describe, expect, it } from "vitest";
import { generateQuestion } from "@/lib/engine/generate";
import { createRng } from "@/lib/engine/rng";
import { generateTargetedQuestion, questionMatchesTarget } from "@/lib/engine/targeted";
import type { Difficulty, NumberType, Operation } from "@/lib/engine/types";
import { makeAttempt, makeSummary } from "@/lib/testing/fixtures";
import type { Attempt } from "@/lib/session/types";
import { buildOverview, filterAttempts, filterSessions, groupStats, median, stats } from "./aggregate";
import { facetOf, featuresOf, skillId } from "./facets";
import { compareRecent, dailyActivity, sessionTrend } from "./trends";
import { analyzeWeaknesses, describeTarget, weakSkills } from "./weakness";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function skillAttempt(
  overrides: Partial<Attempt> & { correct: boolean },
  skill: { numberType?: NumberType; operation?: Operation; difficulty?: Difficulty; variant?: string } = {},
): Attempt {
  const numberType = skill.numberType ?? "integer";
  const operation = skill.operation ?? "division";
  const variant = skill.variant ?? "int-div-2digit-divisor";
  return makeAttempt({
    numberType,
    operation,
    difficulty: skill.difficulty ?? "medium",
    responseMs: 3000,
    submittedAt: NOW - DAY,
    meta: { ...makeAttempt().meta, variant, integerDigits: variant.includes("2digit") ? [3, 2] : [2, 1] },
    ...overrides,
  });
}

describe("facets and features", () => {
  it("strips difficulty and sign suffixes from variants", () => {
    expect(facetOf("int-add-easy")).toBe("int-add");
    expect(facetOf("int-sub-hard-negative")).toBe("int-sub");
    expect(facetOf("frac-sub-medium")).toBe("frac-sub");
    expect(facetOf("dec-mul-small-2x2")).toBe("dec-mul-small-2x2");
    expect(facetOf("int-div-2digit-divisor-large")).toBe("int-div-2digit-divisor-large");
    expect(skillId("integer", "division", "int-div-2digit-divisor", "medium")).toBe("integer/division/int-div-2digit-divisor@medium");
  });

  it("derives structural features from metadata", () => {
    const base = makeAttempt().meta;
    expect(featuresOf({ operation: "addition", numberType: "integer", meta: { ...base, carries: 2 } })).toEqual(["carry"]);
    expect(featuresOf({ operation: "subtraction", numberType: "decimal", meta: { ...base, carries: 1, decimalPlaces: [1, 2] } })).toEqual([
      "borrow",
      "mixed-decimal-places",
    ]);
    expect(featuresOf({ operation: "division", numberType: "integer", meta: { ...base, integerDigits: [3, 2] } })).toEqual(["two-digit-divisor"]);
    expect(featuresOf({ operation: "division", numberType: "decimal", meta: { ...base, denominators: [10, 100] } })).toEqual(["decimal-divisor"]);
    expect(featuresOf({ operation: "addition", numberType: "fraction", meta: { ...base, denominators: [4, 6], lcm: 12, carries: null } })).toEqual([
      "unlike-denominators",
    ]);
    expect(featuresOf({ operation: "subtraction", numberType: "fraction", meta: { ...base, denominators: [8, 10], lcm: 40, carries: null, negativeResult: true } })).toEqual([
      "unlike-denominators",
      "large-lcm",
      "negative-result",
    ]);
    expect(featuresOf({ operation: "multiplication", numberType: "fraction", meta: { ...base, crossCancel: true } })).toEqual(["cross-cancel"]);
    expect(featuresOf({ operation: "multiplication", numberType: "integer", meta: base })).toEqual([]);
  });
});

describe("aggregation", () => {
  const attempts = [
    makeAttempt({ id: "1", correct: true, responseMs: 1000, operation: "addition", numberType: "integer", difficulty: "easy", answerFormat: "open", submittedAt: 100 }),
    makeAttempt({ id: "2", correct: false, responseMs: 3000, operation: "division", numberType: "decimal", difficulty: "hard", answerFormat: "multiple-choice", submittedAt: 200, errorTag: "decimal-placement" }),
    makeAttempt({ id: "3", correct: true, responseMs: 2000, operation: "division", numberType: "decimal", difficulty: "hard", answerFormat: "multiple-choice", submittedAt: 300 }),
    makeAttempt({ id: "4", correct: false, responseMs: 8000, operation: "division", numberType: "fraction", difficulty: "medium", answerFormat: "open", submittedAt: 400, errorTag: "decimal-placement" }),
  ];

  it("computes stats including the median", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(stats([])).toMatchObject({ attempts: 0, accuracy: 0, averageResponseMs: 0 });
    expect(stats(attempts)).toMatchObject({ attempts: 4, correct: 2, incorrect: 2, accuracy: 0.5, averageResponseMs: 3500, medianResponseMs: 2500 });
  });

  it("filters by every dimension", () => {
    expect(filterAttempts(attempts, { operations: ["division"] })).toHaveLength(3);
    expect(filterAttempts(attempts, { numberTypes: ["decimal"], answerFormats: ["multiple-choice"] })).toHaveLength(2);
    expect(filterAttempts(attempts, { difficulties: ["easy"] }).map((a) => a.id)).toEqual(["1"]);
    expect(filterAttempts(attempts, { since: 250 }).map((a) => a.id)).toEqual(["3", "4"]);
    expect(filterAttempts(attempts, {})).toHaveLength(4);
    const sessions = [makeSummary({ id: "a", endedAt: 100 }), makeSummary({ id: "b", endedAt: 900, settings: { ...makeSummary().settings, answerFormat: "multiple-choice" } })];
    expect(filterSessions(sessions, { answerFormats: ["multiple-choice"] }).map((s) => s.id)).toEqual(["b"]);
    expect(filterSessions(sessions, { since: 500 }).map((s) => s.id)).toEqual(["b"]);
    expect(filterSessions(sessions, { numberTypes: ["fraction"] })).toEqual([]);
  });

  it("groups by single and multi-valued keys", () => {
    const byOp = groupStats(attempts, (a) => a.operation);
    expect(byOp.division?.attempts).toBe(3);
    expect(byOp.addition?.accuracy).toBe(1);
    const multi = groupStats(attempts, (a) => (a.correct ? ["x", "y"] : null));
    expect(multi.x?.attempts).toBe(2);
    expect(multi.y?.attempts).toBe(2);
  });

  it("builds an overview separating answer formats and counting error tags", () => {
    const overview = buildOverview(attempts, [makeSummary()]);
    expect(overview.sessions).toBe(1);
    expect(overview.questions).toBe(4);
    expect(overview.byAnswerFormat.open?.attempts).toBe(2);
    expect(overview.byAnswerFormat["multiple-choice"]?.accuracy).toBe(0.5);
    expect(overview.byDifficulty.hard?.attempts).toBe(2);
    expect(overview.byErrorTag["decimal-placement"]).toBe(2);
    expect(overview.byFacet["int-add"]?.attempts).toBe(4);
  });

  it("handles empty history", () => {
    const overview = buildOverview([], []);
    expect(overview.overall).toMatchObject({ attempts: 0, accuracy: 0 });
    expect(overview.byOperation).toEqual({});
    expect(sessionTrend([])).toEqual([]);
    expect(dailyActivity([])).toEqual([]);
    expect(compareRecent([], "accuracy")).toEqual({ recent: null, previous: null, delta: null });
    expect(analyzeWeaknesses([])).toMatchObject({ weaknesses: [], watchlist: [], overallAccuracy: 0, totalAttempts: 0 });
  });
});

describe("trends", () => {
  it("orders sessions by time and skips empty ones", () => {
    const points = sessionTrend([
      makeSummary({ id: "late", endedAt: 300, accuracy: 0.9 }),
      makeSummary({ id: "empty", endedAt: 200, attempted: 0 }),
      makeSummary({ id: "early", endedAt: 100, accuracy: 0.5 }),
    ]);
    expect(points.map((p) => p.sessionId)).toEqual(["early", "late"]);
    expect(points[0]?.accuracy).toBe(0.5);
  });

  it("compares recent sessions with the previous window", () => {
    const points = sessionTrend(Array.from({ length: 10 }, (_, i) => makeSummary({ id: `s${i}`, endedAt: i, netScorePerMinute: i < 5 ? 2 : 4 })));
    expect(compareRecent(points, "netScorePerMinute")).toEqual({ recent: 4, previous: 2, delta: 2 });
    expect(compareRecent(points.slice(0, 3), "netScorePerMinute").previous).toBeNull();
  });

  it("rolls attempts up by day", () => {
    const day = new Date(2026, 8, 24, 10).getTime();
    const daily = dailyActivity([
      makeAttempt({ submittedAt: day, correct: true }),
      makeAttempt({ submittedAt: day + 3600_000, correct: false }),
      makeAttempt({ submittedAt: day + DAY, correct: true }),
    ]);
    expect(daily).toEqual([
      { day: "2026-09-24", attempts: 2, correct: 1, accuracy: 0.5 },
      { day: "2026-09-25", attempts: 1, correct: 1, accuracy: 1 },
    ]);
  });
});

describe("weakness detection", () => {
  it("does not call a single mistake a weakness", () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, i) => skillAttempt({ id: `ok${i}`, correct: true }, { variant: "int-mul-2x2" })),
      skillAttempt({ id: "miss", correct: false, errorTag: "arithmetic-slip" }),
    ];
    const report = analyzeWeaknesses(attempts, { now: NOW });
    expect(report.weaknesses).toEqual([]);
    expect(report.watchlist.some((w) => w.id.startsWith("skill:") && w.incorrect === 1)).toBe(true);
    for (const w of report.watchlist) expect(w.confidence).toBe("insufficient");
  });

  it("surfaces a specific facet rather than the whole operation", () => {
    const attempts = [
      // Two-digit divisors: 6 of 10 wrong.
      ...Array.from({ length: 10 }, (_, i) => skillAttempt({ id: `two${i}`, correct: i >= 6, errorTag: i < 6 ? "arithmetic-slip" : null })),
      // One-digit divisors: all right.
      ...Array.from({ length: 10 }, (_, i) => skillAttempt({ id: `one${i}`, correct: true }, { variant: "int-div-1digit-divisor" })),
    ];
    const report = analyzeWeaknesses(attempts, { now: NOW });
    const top = report.weaknesses[0];
    expect(top?.kind).toBe("skill");
    expect(top?.label).toBe("Two-digit divisors");
    expect(top?.confidence).toBe("established");
    expect(top?.signals).toContain("accuracy");
    expect(top?.target).toMatchObject({ numberType: "integer", operation: "division", difficulty: "medium", facet: "int-div-2digit-divisor" });
    expect(report.weaknesses.some((w) => w.label === "One-digit divisors")).toBe(false);
    // The structural feature is reported too, with two-digit divisor attempts only.
    const feature = report.weaknesses.find((w) => w.kind === "feature");
    expect(feature?.label).toBe("Two-digit divisors");
    expect(feature?.attempts).toBe(10);
    expect(describeTarget(top!.target!)).toMatch(/Two-digit divisors/);
  });

  it("flags slow-but-correct skills as speed weaknesses", () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, i) => skillAttempt({ id: `slow${i}`, correct: true, responseMs: 9000 })),
      ...Array.from({ length: 10 }, (_, i) => skillAttempt({ id: `fast${i}`, correct: true, responseMs: 3000 }, { variant: "int-div-1digit-divisor" })),
    ];
    const report = analyzeWeaknesses(attempts, { now: NOW });
    const slow = report.weaknesses.find((w) => w.kind === "skill" && w.label === "Two-digit divisors");
    expect(slow).toBeDefined();
    expect(slow?.signals).toEqual(["speed"]);
    expect(slow?.slownessRatio).toBeCloseTo(3);
    expect(slow?.baselineResponseMs).toBe(3000);
    expect(slow?.confidence).toBe("established");
    expect(slow?.incorrect).toBe(0);
  });

  it("counts repeated misses of the same question and recurring error tags", () => {
    const attempts = [
      skillAttempt({ id: "r1", correct: false, expression: "672 ÷ 16", errorTag: "decimal-placement" }),
      skillAttempt({ id: "r2", correct: false, expression: "672 ÷ 16", errorTag: "decimal-placement" }),
      skillAttempt({ id: "r3", correct: false, expression: "846 ÷ 18", errorTag: "decimal-placement" }),
      skillAttempt({ id: "r4", correct: true }),
    ];
    const report = analyzeWeaknesses(attempts, { now: NOW });
    const skill = report.weaknesses.find((w) => w.kind === "skill");
    expect(skill?.repeatedMisses).toBe(1);
    expect(skill?.signals).toContain("repeat");
    const error = report.weaknesses.find((w) => w.kind === "error");
    expect(error?.label).toBe("Decimal placement");
    expect(error?.confidence).toBe("established");
    expect(error?.target?.facet).toBe("int-div-2digit-divisor");
  });

  it("weights recent misses more than old ones", () => {
    const recent = Array.from({ length: 6 }, (_, i) => skillAttempt({ id: `a${i}`, correct: i >= 3, submittedAt: NOW - DAY }));
    const old = Array.from({ length: 6 }, (_, i) => skillAttempt({ id: `b${i}`, correct: i >= 3, submittedAt: NOW - 120 * DAY }, { variant: "int-div-1digit-divisor" }));
    const report = analyzeWeaknesses([...recent, ...old], { now: NOW });
    const labels = report.weaknesses.filter((w) => w.kind === "skill").map((w) => w.label);
    expect(labels.indexOf("Two-digit divisors")).toBeLessThan(labels.indexOf("One-digit divisors"));
    expect(weakSkills(report).every((w) => w.target !== null)).toBe(true);
  });

  it("ignores unclassified tags when grouping mistakes", () => {
    const attempts = Array.from({ length: 5 }, (_, i) => skillAttempt({ id: `u${i}`, correct: false, errorTag: "unclassified" }));
    const report = analyzeWeaknesses(attempts, { now: NOW });
    expect(report.weaknesses.some((w) => w.kind === "error")).toBe(false);
  });
});

describe("targeted generation", () => {
  it("honours facet and feature targets and stays within the skill", () => {
    const rng = createRng(31);
    for (let i = 0; i < 100; i += 1) {
      const q = generateTargetedQuestion({
        target: { numberType: "integer", operation: "division", difficulty: "medium", facet: "int-div-2digit-divisor" },
        rng,
        id: `t${i}`,
      });
      expect(q.operation).toBe("division");
      expect(facetOf(q.meta.variant)).toBe("int-div-2digit-divisor");
      expect(q.operands[1].num).toBeGreaterThanOrEqual(11);
    }
    for (let i = 0; i < 100; i += 1) {
      const q = generateTargetedQuestion({ target: { numberType: "integer", operation: "addition", difficulty: "medium", feature: "carry" }, rng, id: `c${i}` });
      expect(q.meta.carries).toBeGreaterThan(0);
    }
    for (let i = 0; i < 50; i += 1) {
      const q = generateTargetedQuestion({ target: { numberType: "fraction", operation: "addition", difficulty: "hard", feature: "large-lcm" }, rng, id: `f${i}` });
      expect(q.meta.lcm).toBeGreaterThanOrEqual(24);
    }
  });

  it("relaxes impossible constraints instead of failing", () => {
    const rng = createRng(32);
    // Easy fraction addition never has an LCM ≥ 24; the generator must still return an easy fraction sum.
    const q = generateTargetedQuestion({ target: { numberType: "fraction", operation: "addition", difficulty: "easy", feature: "large-lcm" }, rng, id: "x", triesPerTier: 10 });
    expect(q.numberType).toBe("fraction");
    expect(q.operation).toBe("addition");
    expect(q.difficulty).toBe("easy");
    const stale = generateQuestion({ settings: { operations: ["addition"], numberTypes: ["fraction"], difficulty: "easy" }, rng, id: "y" });
    expect(questionMatchesTarget(stale, { numberType: "fraction", operation: "addition", difficulty: "easy", facet: "no-such-facet" })).toBe(false);
    expect(questionMatchesTarget(stale, { numberType: "fraction", operation: "addition", difficulty: "easy", facet: "no-such-facet" }, { ignoreFacet: true })).toBe(true);
  });
});
