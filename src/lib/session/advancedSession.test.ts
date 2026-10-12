import { describe, expect, it } from "vitest";
import type { PracticePlan } from "@/lib/adaptive/plan";
import { type AdvancedSettings, DEFAULT_ADVANCED_SETTINGS } from "@/lib/engine/advanced";
import { NUMBER_TYPES, type NumberType, OPERATIONS, type Operation, isArithmetic } from "@/lib/engine/types";
import { type SessionState, createSession, sessionReducer } from "./reducer";
import { DEFAULT_SETTINGS, type TrainerSettings, effectiveNumberTypes, effectiveOperations } from "./types";

const T0 = 1_000_000;
const W0 = 1_700_000_000_000;

const MIX: AdvancedSettings = {
  ...DEFAULT_ADVANCED_SETTINGS,
  enabled: true,
  operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 },
  formatMix: { integer: 75, decimal: 0, fraction: 25 },
  operandRanges: {
    addition: { min: 10, max: 1000 },
    subtraction: { min: 10, max: 1000 },
    multiplication: { min: 2, max: 20 },
    division: { min: 4, max: 400 },
  },
  fractionRanges: { numerator: { min: 1, max: 9 }, denominator: { min: 2, max: 12 } },
};

/** Play a whole session out, collecting the question asked at each step. */
function playOut(settings: TrainerSettings, seed: number, steps: number) {
  let state: SessionState = createSession(settings, { id: "s1", seed, now: T0, wallClock: W0 });
  const asked = [];
  for (let i = 0; i < steps; i += 1) {
    if (!state.question) break;
    asked.push(state.question);
    state = sessionReducer(state, { type: "submit", input: state.question.answerText, now: T0 + (i + 1) * 1000, wallClock: W0 + (i + 1) * 1000 });
  }
  return { asked, state };
}

function tally<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const key of keys) counts[key] = 0;
  for (const value of values) counts[value] += 1;
  return counts;
}

describe("a finite session with advanced settings", () => {
  const settings: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: 20, advanced: MIX };

  it("matches the requested percentages exactly over the session", () => {
    const { asked, state } = playOut(settings, 2024, 20);
    expect(asked).toHaveLength(20);
    expect(state.status).toBe("finished");
    expect(state.endReason).toBe("limit");
    expect(tally(asked.map((q) => q.operation), OPERATIONS)).toEqual({ addition: 8, subtraction: 4, multiplication: 6, division: 2, finance: 0 });
    expect(tally(asked.map((q) => q.numberType), NUMBER_TYPES)).toEqual({ integer: 15, decimal: 0, fraction: 5 });
  });

  it("keeps every operand inside the range set for its operation", () => {
    const { asked } = playOut(settings, 7, 20);
    for (const question of asked) {
      if (question.numberType !== "integer") continue;
      if (!isArithmetic(question.operation)) continue;
      const range = MIX.operandRanges[question.operation];
      for (const operand of question.operands) {
        expect(Math.abs(operand.num), question.expression).toBeGreaterThanOrEqual(range.min);
        expect(Math.abs(operand.num), question.expression).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it("builds a schedule up front and leaves it alone as the session runs", () => {
    const state = createSession(settings, { id: "s1", seed: 5, now: T0, wallClock: W0 });
    expect(state.mixSchedule).toHaveLength(20);
    const next = sessionReducer(state, { type: "submit", input: state.question?.answerText ?? "", now: T0 + 1000, wallClock: W0 + 1000 });
    expect(next.mixSchedule).toEqual(state.mixSchedule);
  });

  it("spreads fractions across more than one operation", () => {
    const longer: TrainerSettings = { ...settings, questionLimit: 100 };
    const { asked } = playOut(longer, 31, 100);
    const fractionOperations = new Set(asked.filter((q) => q.numberType === "fraction").map((q) => q.operation));
    expect(fractionOperations.size).toBeGreaterThan(1);
  });
});

describe("an open-ended session with advanced settings", () => {
  it("samples by weight and never leaves the chosen mix", () => {
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: null, advanced: MIX };
    const { asked, state } = playOut(settings, 88, 400);
    expect(state.mixSchedule).toBeNull();
    expect(asked).toHaveLength(400);

    const operations = tally(asked.map((q) => q.operation), OPERATIONS);
    for (const op of OPERATIONS) {
      expect(operations[op] / asked.length, op).toBeCloseTo(MIX.operationMix[op] / 100, 1);
    }
    const formats = tally(asked.map((q) => q.numberType), NUMBER_TYPES);
    expect(formats.decimal).toBe(0);
    expect(formats.fraction / asked.length).toBeCloseTo(0.25, 1);
  });

  it("excludes anything set to 0%", () => {
    const advanced: AdvancedSettings = {
      ...MIX,
      operationMix: { addition: 0, subtraction: 0, multiplication: 100, division: 0, finance: 0 },
      formatMix: { integer: 0, decimal: 0, fraction: 100 },
    };
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "timed", durationMinutes: 10, advanced };
    const { asked } = playOut(settings, 12, 120);
    expect(asked).toHaveLength(120);
    for (const question of asked) {
      expect(question.operation).toBe<Operation>("multiplication");
      expect(question.numberType).toBe<NumberType>("fraction");
      for (const operand of question.operands) {
        expect(operand.den).toBeGreaterThanOrEqual(2);
        expect(operand.den).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("adaptive practice with advanced settings", () => {
  it("stays inside the configured ranges when following a plan", () => {
    const plan: PracticePlan = {
      targets: [
        { target: { numberType: "integer", operation: "multiplication", difficulty: "hard" }, weight: 0.5, reason: "weak-accuracy", label: "weak" },
        { target: { numberType: "integer", operation: "division", difficulty: "hard" }, weight: 0.5, reason: "review-due", label: "due" },
      ],
      createdAt: 0,
      summary: "test plan",
      coldStart: false,
    };
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: null, advanced: MIX, plan };
    const { asked } = playOut(settings, 404, 120);
    expect(asked).toHaveLength(120);
    for (const question of asked) {
      // The plan still decides the skill, but the numbers obey the user's range.
      if (!isArithmetic(question.operation)) continue;
      const range = MIX.operandRanges[question.operation];
      for (const operand of question.operands) {
        expect(Math.abs(operand.num), question.expression).toBeGreaterThanOrEqual(range.min);
        expect(Math.abs(operand.num), question.expression).toBeLessThanOrEqual(range.max);
      }
      if (question.operation === "division") expect(question.answer.den, question.expression).toBe(1);
    }
  });
});

describe("the effective selection", () => {
  it("follows the toggles while advanced settings are off", () => {
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, operations: ["addition"], numberTypes: ["decimal"] };
    expect(effectiveOperations(settings)).toEqual(["addition"]);
    expect(effectiveNumberTypes(settings)).toEqual(["decimal"]);
  });

  it("follows the mixes while advanced settings are on", () => {
    const settings: TrainerSettings = { ...DEFAULT_SETTINGS, operations: ["addition"], numberTypes: ["decimal"], advanced: MIX };
    // Finance sits at 0% in this mix, so it is not among the effective operations.
    expect(effectiveOperations(settings)).toEqual(OPERATIONS.filter((op) => op !== "finance"));
    expect(effectiveNumberTypes(settings)).toEqual(["integer", "fraction"]);
  });
});

describe("default practice is preserved", () => {
  it("asks exactly the same questions as before when advanced settings are untouched", () => {
    const base: TrainerSettings = { ...DEFAULT_SETTINGS, mode: "untimed", questionLimit: 25, numberTypes: ["integer", "decimal", "fraction"] };
    const withDefaults = playOut(base, 777, 25).asked.map((q) => q.expression);
    // The same session with the `advanced` field stripped back to its default.
    const untouched = playOut({ ...base, advanced: { ...DEFAULT_ADVANCED_SETTINGS } }, 777, 25).asked.map((q) => q.expression);
    expect(withDefaults).toEqual(untouched);
    expect(createSession(base, { id: "s1", seed: 777, now: T0, wallClock: W0 }).mixSchedule).toBeNull();
  });
});
