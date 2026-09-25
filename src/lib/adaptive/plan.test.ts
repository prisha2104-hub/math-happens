import { describe, expect, it } from "vitest";
import { facetOf } from "@/lib/analysis/facets";
import { createRng } from "@/lib/engine/rng";
import { targetKey } from "@/lib/engine/targeted";
import { applyAttempts } from "@/lib/review/schedule";
import { EMPTY_REVIEW_STATE } from "@/lib/review/types";
import { createSession, sessionReducer } from "@/lib/session/reducer";
import { DEFAULT_SETTINGS, type Attempt } from "@/lib/session/types";
import { makeAttempt } from "@/lib/testing/fixtures";
import { techniqueById } from "@/lib/techniques/library";
import { type PracticePlan, buildPracticePlan, pickTarget } from "./plan";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const pool = { operations: ["addition", "multiplication"] as const, numberTypes: ["integer"] as const, difficulty: "medium" as const };

function attempt(correct: boolean, variant: string, extra: Partial<Attempt> = {}): Attempt {
  const operation = variant.includes("-div-") ? "division" : variant.includes("-mul-") ? "multiplication" : variant.includes("-sub") ? "subtraction" : "addition";
  const numberType = variant.startsWith("frac") ? "fraction" : variant.startsWith("dec") ? "decimal" : "integer";
  return makeAttempt({
    correct,
    operation,
    numberType,
    difficulty: "medium",
    submittedAt: NOW - DAY,
    responseMs: 3000,
    // Distinct expressions unless a test deliberately repeats one.
    expression: `${variant} ${extra.id ?? Math.random()}`,
    meta: { ...makeAttempt().meta, variant, integerDigits: variant.includes("2digit") ? [3, 2] : [2, 1] },
    ...extra,
  });
}

function shareOf(plan: PracticePlan, predicate: (t: PracticePlan["targets"][number]) => boolean): number {
  return plan.targets.filter(predicate).reduce((s, t) => s + t.weight, 0);
}

describe("buildPracticePlan", () => {
  it("falls back to the user's own selection when there is no history", () => {
    const plan = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW });
    expect(plan.coldStart).toBe(true);
    expect(plan.targets.map((t) => targetKey(t.target)).sort()).toEqual(["integer/addition@medium", "integer/multiplication@medium"]);
    expect(plan.targets.every((t) => t.reason === "fresh")).toBe(true);
    expect(shareOf(plan, () => true)).toBeCloseTo(1);
    expect(plan.summary).toMatch(/No history yet/);
  });

  it("gives weak skills the largest share while keeping fresh practice inside the pool", () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, i) => attempt(i >= 6, "int-div-2digit-divisor", { id: `d${i}` })),
      ...Array.from({ length: 10 }, (_, i) => attempt(true, "int-mul-2x1", { id: `m${i}` })),
    ];
    const plan = buildPracticePlan({ attempts, review: EMPTY_REVIEW_STATE, pool, now: NOW });
    expect(plan.coldStart).toBe(false);
    const weak = plan.targets.filter((t) => t.reason !== "fresh");
    expect(weak).toHaveLength(1);
    expect(weak[0]?.target.facet).toBe("int-div-2digit-divisor");
    expect(weak[0]?.reason).toBe("weak-accuracy");
    expect(shareOf(plan, (t) => t.reason !== "fresh")).toBeCloseTo(0.8);
    // Fresh targets come only from the pool (addition and multiplication), never division.
    for (const t of plan.targets.filter((t) => t.reason === "fresh")) expect(pool.operations).toContain(t.target.operation);
    expect(shareOf(plan, (t) => t.reason === "fresh")).toBeCloseTo(0.2);
  });

  it("ignores an isolated mistake", () => {
    const attempts = [...Array.from({ length: 12 }, (_, i) => attempt(true, "int-mul-2x1", { id: `m${i}` })), attempt(false, "frac-div", { id: "one" })];
    const plan = buildPracticePlan({ attempts, review: EMPTY_REVIEW_STATE, pool, now: NOW });
    expect(plan.targets.every((t) => t.reason === "fresh")).toBe(true);
  });

  it("caps any single weak skill and splits the rest across weaknesses", () => {
    const attempts = [
      ...Array.from({ length: 12 }, (_, i) => attempt(i >= 10, "int-div-2digit-divisor", { id: `a${i}` })), // very weak
      ...Array.from({ length: 12 }, (_, i) => attempt(i >= 5, "frac-add", { id: `b${i}` })),
      ...Array.from({ length: 12 }, (_, i) => attempt(i >= 6, "dec-mul-1dp-1dp", { id: `c${i}` })),
      ...Array.from({ length: 12 }, (_, i) => attempt(true, "int-mul-2x1", { id: `d${i}` })),
    ];
    const plan = buildPracticePlan({ attempts, review: EMPTY_REVIEW_STATE, pool, now: NOW });
    const weak = plan.targets.filter((t) => t.reason !== "fresh");
    expect(weak.length).toBeGreaterThanOrEqual(3);
    const weakShare = shareOf(plan, (t) => t.reason !== "fresh");
    for (const t of weak) expect(t.weight / weakShare).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it("includes skills due for review and labels speed and repetition", () => {
    const slow = Array.from({ length: 10 }, (_, i) => attempt(true, "int-div-2digit-divisor", { id: `s${i}`, responseMs: 9000 }));
    const fast = Array.from({ length: 10 }, (_, i) => attempt(true, "int-div-1digit-divisor", { id: `f${i}`, responseMs: 3000 }));
    const repeated = [
      attempt(false, "frac-sub", { id: "r1", expression: "3/4 − 1/6" }),
      attempt(false, "frac-sub", { id: "r2", expression: "3/4 − 1/6" }),
      attempt(false, "frac-sub", { id: "r3", expression: "5/6 − 1/4" }),
      attempt(true, "frac-sub", { id: "r4" }),
    ];
    const review = applyAttempts(EMPTY_REVIEW_STATE, [attempt(false, "dec-add-1dp-2dp", { id: "due" })]);
    const plan = buildPracticePlan({ attempts: [...slow, ...fast, ...repeated], review, pool, now: NOW });
    const reasons = new Map(plan.targets.map((t) => [t.target.facet ?? targetKey(t.target), t.reason]));
    expect(reasons.get("int-div-2digit-divisor")).toBe("slow");
    expect(reasons.get("frac-sub")).toBe("repeated-miss");
    expect(reasons.get("dec-add-1dp-2dp")).toBe("review-due");
    expect(shareOf(plan, (t) => t.reason === "review-due")).toBeCloseTo(0.25);
    expect(plan.summary).toMatch(/55% weak skills · 25% skills due for review · 20% fresh/);
  });

  it("does not double-count a weak skill that is also due for review", () => {
    const attempts = Array.from({ length: 10 }, (_, i) => attempt(i >= 6, "int-div-2digit-divisor", { id: `d${i}` }));
    const review = applyAttempts(EMPTY_REVIEW_STATE, attempts);
    const plan = buildPracticePlan({ attempts, review, pool, now: NOW });
    expect(plan.targets.filter((t) => t.target.facet === "int-div-2digit-divisor")).toHaveLength(1);
    expect(plan.summary).toMatch(/80% weak skills/);
  });

  it("builds a focused plan around one skill", () => {
    const focus = { numberType: "integer" as const, operation: "division" as const, difficulty: "medium" as const, facet: "int-div-2digit-divisor" };
    const plan = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW, focus });
    expect(plan.targets).toHaveLength(2);
    expect(plan.targets[0]).toMatchObject({ reason: "focus", weight: 0.75 });
    expect(plan.targets[1]).toMatchObject({ reason: "fresh", weight: 0.25 });
    expect(plan.targets[1]?.target.facet).toBeUndefined();
    const broadFocus = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW, focus: { ...focus, facet: null } });
    expect(broadFocus.targets).toHaveLength(1);
    expect(broadFocus.targets[0]?.weight).toBe(1);
  });

  it("builds a technique drill", () => {
    const plan = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW, techniqueId: "div-factor-chain" });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({ reason: "technique", techniqueId: "div-factor-chain", weight: 1 });
    const unknown = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW, techniqueId: "nope" });
    expect(unknown.targets.every((t) => t.reason === "fresh")).toBe(true);
  });

  it("picks targets in proportion to their weights", () => {
    const plan: PracticePlan = {
      targets: [
        { target: { numberType: "integer", operation: "addition", difficulty: "easy" }, weight: 0.7, reason: "weak-accuracy", label: "a" },
        { target: { numberType: "integer", operation: "division", difficulty: "easy" }, weight: 0.3, reason: "fresh", label: "b" },
      ],
      createdAt: 0,
      summary: "",
      coldStart: false,
    };
    const rng = createRng(5);
    let additions = 0;
    for (let i = 0; i < 2000; i += 1) if (pickTarget(plan, rng).target.operation === "addition") additions += 1;
    expect(additions / 2000).toBeGreaterThan(0.65);
    expect(additions / 2000).toBeLessThan(0.75);
  });
});

describe("plan-driven sessions", () => {
  it("draws every question from the plan and honours facets", () => {
    const focus = { numberType: "integer" as const, operation: "division" as const, difficulty: "medium" as const, facet: "int-div-2digit-divisor" };
    const plan: PracticePlan = {
      targets: [{ target: focus, weight: 1, reason: "focus", label: "x" }],
      createdAt: NOW,
      summary: "",
      coldStart: false,
    };
    let state = createSession({ ...DEFAULT_SETTINGS, mode: "untimed", operations: ["division"], plan }, { id: "p", seed: 3, now: 0, wallClock: NOW });
    for (let i = 0; i < 25; i += 1) {
      expect(state.question?.operation).toBe("division");
      expect(facetOf(state.question!.meta.variant)).toBe("int-div-2digit-divisor");
      state = sessionReducer(state, { type: "submit", input: state.question!.answerText, now: (i + 1) * 1000, wallClock: NOW + (i + 1) * 1000 });
    }
    expect(state.attempts).toHaveLength(25);
  });

  it("filters technique drills so the technique applies", () => {
    const technique = techniqueById("div-factor-chain")!;
    const plan: PracticePlan = {
      targets: [{ target: { ...technique.practice, facet: technique.practice.facet ?? null, feature: null }, weight: 1, reason: "technique", label: technique.title, techniqueId: technique.id }],
      createdAt: NOW,
      summary: "",
      coldStart: false,
    };
    let state = createSession({ ...DEFAULT_SETTINGS, mode: "untimed", plan }, { id: "t", seed: 4, now: 0, wallClock: NOW });
    let applied = 0;
    for (let i = 0; i < 20; i += 1) {
      if (technique.applies(state.question!)) applied += 1;
      state = sessionReducer(state, { type: "submit", input: state.question!.answerText, now: (i + 1) * 1000, wallClock: NOW + (i + 1) * 1000 });
    }
    expect(applied).toBeGreaterThanOrEqual(18);
  });

  it("works with multiple choice and keeps the plan on the summary", () => {
    const plan = buildPracticePlan({ attempts: [], review: EMPTY_REVIEW_STATE, pool, now: NOW });
    const state = createSession({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice", plan }, { id: "m", seed: 9, now: 0, wallClock: NOW });
    expect(state.choices?.options).toHaveLength(4);
    expect(state.settings.plan?.targets.length).toBe(2);
  });
});
