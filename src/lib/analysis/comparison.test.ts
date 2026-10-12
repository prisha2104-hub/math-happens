import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANCED_SETTINGS } from "@/lib/engine/advanced";
import { DEFAULT_SETTINGS, type Attempt, type SessionSummary, type TrainerSettings } from "@/lib/session/types";
import { makeAttempt, makeSummary } from "@/lib/testing/fixtures";
import { comparabilityKey, compareSession, completionTimeMs, previousMatching, slowestArea, weakestArea } from "./comparison";

const HOUR = 3_600_000;
const T = 1_800_000_000_000;

function settings(overrides: Partial<TrainerSettings> = {}): TrainerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/** A fixed-length session that ran to its limit, which is the comparable-timing case. */
function fixedLength(id: string, endedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return makeSummary({
    id,
    endedAt,
    settings: settings({ mode: "untimed", questionLimit: 10 }),
    endReason: "limit",
    attempted: 10,
    correct: 8,
    incorrect: 2,
    accuracy: 0.8,
    elapsedMs: 120_000,
    correctPerMinute: 4,
    ...overrides,
  });
}

function skillAttempt(sessionId: string, index: number, correct: boolean, skill: Partial<Attempt> & { variant?: string } = {}): Attempt {
  const { variant = "int-add-easy", ...rest } = skill;
  return makeAttempt({
    id: `${sessionId}:a${index}`,
    sessionId,
    correct,
    meta: { ...makeAttempt().meta, variant },
    ...rest,
  });
}

describe("comparabilityKey", () => {
  it("ignores the order operations and number types were switched on in", () => {
    const a = settings({ operations: ["division", "addition"], numberTypes: ["decimal", "integer"] });
    const b = settings({ operations: ["addition", "division"], numberTypes: ["integer", "decimal"] });
    expect(comparabilityKey(a)).toBe(comparabilityKey(b));
  });

  it("separates anything that changes what is asked", () => {
    const base = settings({ mode: "untimed", questionLimit: 20 });
    const keys = [
      base,
      settings({ ...base, questionLimit: 10 }),
      settings({ ...base, questionLimit: null }),
      settings({ ...base, difficulty: "hard" }),
      settings({ ...base, answerFormat: "multiple-choice" }),
      settings({ ...base, operations: ["addition"] }),
      settings({ ...base, numberTypes: ["fraction"] }),
      settings({ mode: "timed", durationMinutes: 4 }),
      settings({ mode: "timed", durationMinutes: 5 }),
    ].map(comparabilityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves out the setting the mode ignores", () => {
    // A timed session never stops at a question limit, and an untimed one
    // never uses the duration, so neither may split an identical history.
    expect(comparabilityKey(settings({ mode: "timed", durationMinutes: 4, questionLimit: 10 }))).toBe(
      comparabilityKey(settings({ mode: "timed", durationMinutes: 4, questionLimit: 50 })),
    );
    expect(comparabilityKey(settings({ mode: "untimed", questionLimit: 10, durationMinutes: 4 }))).toBe(
      comparabilityKey(settings({ mode: "untimed", questionLimit: 10, durationMinutes: 9 })),
    );
  });

  it("separates advanced setups by the ranges and mixes actually in use", () => {
    const off = settings();
    const on = settings({ advanced: { ...DEFAULT_ADVANCED_SETTINGS, enabled: true } });
    const widerIntegers = settings({
      advanced: { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, addition: { min: 10, max: 9999 } } },
    });
    expect(comparabilityKey(off)).not.toBe(comparabilityKey(on));
    expect(comparabilityKey(on)).not.toBe(comparabilityKey(widerIntegers));

    // With integers at 0 % the operand ranges change nothing that is generated.
    const fractionsOnly = { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, formatMix: { integer: 0, decimal: 0, fraction: 100 } };
    expect(comparabilityKey(settings({ advanced: fractionsOnly }))).toBe(
      comparabilityKey(settings({ advanced: { ...fractionsOnly, operandRanges: { ...fractionsOnly.operandRanges, addition: { min: 1, max: 5 } } } })),
    );
  });

  it("separates finance setups by family mix, value style, rounding and answer mode", () => {
    const financeOn = {
      ...DEFAULT_ADVANCED_SETTINGS,
      enabled: true,
      operationMix: { addition: 0, subtraction: 0, multiplication: 0, division: 0, finance: 100 },
    };
    const base = settings({ advanced: financeOn });
    const keys = [
      base,
      settings({ advanced: { ...financeOn, finance: { ...financeOn.finance, subtypeMix: { ...financeOn.finance.subtypeMix, "basis-points": 40 } } } }),
      settings({ advanced: { ...financeOn, finance: { ...financeOn.finance, valueStyle: "decimal" } } }),
      settings({ advanced: { ...financeOn, finance: { ...financeOn.finance, answerStyle: "estimate" } } }),
      settings({ advanced: { ...financeOn, finance: { ...financeOn.finance, rounding: 2 } } }),
      settings({ advanced: { ...financeOn, finance: { ...financeOn.finance, amountRange: { min: 50, max: 900 } } } }),
    ].map(comparabilityKey);
    expect(new Set(keys).size).toBe(keys.length);

    // With finance at 0% those same settings change nothing that is asked.
    const financeOff = { ...financeOn, operationMix: { ...financeOn.operationMix, finance: 0, addition: 100 } };
    expect(comparabilityKey(settings({ advanced: financeOff }))).toBe(
      comparabilityKey(settings({ advanced: { ...financeOff, finance: { ...financeOff.finance, answerStyle: "estimate" } } })),
    );
  });

  it("separates split multiplication ranges from a shared one", () => {
    const shared = { ...DEFAULT_ADVANCED_SETTINGS, enabled: true };
    const split = { ...shared, multiplicationSecondRange: { min: 100, max: 999 } };
    expect(comparabilityKey(settings({ advanced: shared }))).not.toBe(comparabilityKey(settings({ advanced: split })));
  });

  it("keeps adaptive Improve sessions apart from ordinary practice", () => {
    const plan = { targets: [], createdAt: 0, summary: "", coldStart: false };
    expect(comparabilityKey(settings({ plan }))).not.toBe(comparabilityKey(settings()));
  });
});

describe("previousMatching", () => {
  const current = fixedLength("current", T);

  it("takes only earlier sessions with the same settings, newest first", () => {
    const history = [
      fixedLength("older", T - 2 * HOUR),
      fixedLength("newer", T - HOUR),
      fixedLength("other-settings", T - HOUR, { settings: settings({ mode: "untimed", questionLimit: 20 }) }),
      fixedLength("after", T + HOUR),
      current,
    ];
    expect(previousMatching(current, history).map((s) => s.id)).toEqual(["newer", "older"]);
  });

  it("excludes the session itself even when it is stored under a different clock reading", () => {
    expect(previousMatching(current, [{ ...current, endedAt: T - HOUR }])).toEqual([]);
  });
});

describe("compareSession", () => {
  it("reports no previous tests for the first session with a setup", () => {
    const summary = fixedLength("first", T);
    const result = compareSession({ summary, attempts: [], history: [summary] });
    expect(result.previous).toEqual([]);
    expect(result.accuracy).toBeNull();
    expect(result.completionTime).toBeNull();
    expect(result.pace).toBeNull();
  });

  it("averages accuracy, time and pace over matching previous sessions only", () => {
    const summary = fixedLength("current", T, { accuracy: 0.9, correct: 9, incorrect: 1, elapsedMs: 100_000, correctPerMinute: 5.4 });
    const history = [
      summary,
      fixedLength("p1", T - HOUR, { accuracy: 0.6, correct: 6, incorrect: 4, elapsedMs: 180_000, correctPerMinute: 2 }),
      fixedLength("p2", T - 2 * HOUR, { accuracy: 0.8, correct: 8, incorrect: 2, elapsedMs: 140_000, correctPerMinute: 3.4 }),
      // Different settings: must not touch any figure.
      fixedLength("other", T - 3 * HOUR, { settings: settings({ mode: "timed", durationMinutes: 4 }), accuracy: 0.1, elapsedMs: 240_000 }),
    ];
    const result = compareSession({ summary, attempts: [], history });

    expect(result.previous.map((s) => s.id)).toEqual(["p1", "p2"]);
    expect(result.accuracy).toMatchObject({ current: 0.9, previousAverage: 0.7, previousBest: 0.8, samples: 2 });
    expect(result.accuracy?.delta).toBeCloseTo(0.2);
    expect(result.completionTime).toMatchObject({ current: 100_000, previousAverage: 160_000, previousBest: 140_000, delta: -60_000, samples: 2 });
    expect(result.pace).toMatchObject({ current: 5.4, previousAverage: 2.7, previousBest: 3.4, samples: 2 });
    expect(result.timingExcluded).toBe(0);
  });

  it("only compares completion time when the workload was fixed and finished", () => {
    const timed = makeSummary({ id: "t", endedAt: T, settings: settings({ mode: "timed", durationMinutes: 4 }), elapsedMs: 240_000, correctPerMinute: 6 });
    const earlierTimed = makeSummary({ id: "t0", endedAt: T - HOUR, settings: settings({ mode: "timed", durationMinutes: 4 }), elapsedMs: 240_000, correctPerMinute: 4 });
    const timedResult = compareSession({ summary: timed, attempts: [], history: [timed, earlierTimed] });
    expect(completionTimeMs(timed)).toBeNull();
    expect(timedResult.completionTime).toBeNull();
    expect(timedResult.pace).toMatchObject({ current: 6, previousAverage: 4 });

    // A fixed-length session abandoned early has no comparable time either.
    const abandoned = fixedLength("abandoned", T - HOUR, { endReason: "manual", attempted: 4, elapsedMs: 30_000 });
    const summary = fixedLength("current", T);
    const result = compareSession({ summary, attempts: [], history: [summary, abandoned] });
    expect(completionTimeMs(abandoned)).toBeNull();
    expect(result.completionTime).toBeNull();
    expect(result.timingExcluded).toBe(1);
    expect(result.previous).toHaveLength(1);
  });

  it("leaves sessions with no answers out of the accuracy figures", () => {
    const summary = fixedLength("current", T, { accuracy: 0.5 });
    const empty = fixedLength("empty", T - HOUR, { attempted: 0, correct: 0, incorrect: 0, accuracy: 0, elapsedMs: 0, correctPerMinute: 0, endReason: "manual" });
    const result = compareSession({ summary, attempts: [], history: [summary, empty] });
    expect(result.previous).toHaveLength(1);
    expect(result.accuracy).toBeNull();
    expect(result.pace).toBeNull();
  });

  it("drops figures a legacy or damaged record does not actually have", () => {
    const summary = fixedLength("current", T);
    // A record missing the counts a later build added: it still matches, but
    // contributes nothing rather than a guessed figure.
    const partial = { ...fixedLength("legacy", T - HOUR) } as Record<string, unknown>;
    delete partial.attempted;
    delete partial.accuracy;
    delete partial.elapsedMs;
    const result = compareSession({ summary, attempts: [], history: [summary, partial as unknown as SessionSummary] });
    expect(result.previous).toHaveLength(1);
    expect(result.accuracy).toBeNull();
    expect(result.pace).toBeNull();
    expect(result.completionTime).toBeNull();
    expect(result.timingExcluded).toBe(1);
  });

  it("counts the sessions the weakest area was drawn from", () => {
    const summary = fixedLength("current", T);
    const previous = fixedLength("p1", T - HOUR);
    const attempts = [skillAttempt("current", 1, false), skillAttempt("current", 2, true)];
    const previousAttempts = [skillAttempt("p1", 1, true), skillAttempt("p1", 2, false)];
    const result = compareSession({ summary, attempts, history: [summary, previous], previousAttempts });
    expect(result.weakestSessions).toBe(2);
  });
});

describe("speed that rushing cannot flatter", () => {
  const withMedian = (id: string, endedAt: number, median: number | null | undefined, overrides: Partial<SessionSummary> = {}) =>
    fixedLength(id, endedAt, { medianCorrectResponseMs: median, ...overrides });

  it("compares the median time per correct answer and finds a personal best", () => {
    const summary = withMedian("current", T, 2600, { accuracy: 0.9, correct: 9, incorrect: 1 });
    const history = [summary, withMedian("p1", T - HOUR, 4000, { accuracy: 0.6 }), withMedian("p2", T - 2 * HOUR, 3000, { accuracy: 0.8 })];
    const result = compareSession({ summary, attempts: [], history });
    expect(result.medianCorrect).toMatchObject({ current: 2600, previousAverage: 3500, previousBest: 3000, samples: 2 });
    expect(result.medianCorrect?.delta).toBe(-900);
    expect(result.personalBests).toContain("speed");
    expect(result.personalBests).toContain("accuracy");
  });

  it("leaves sessions recorded before the figure existed out of it, and says how many", () => {
    const summary = withMedian("current", T, 2600);
    // A legacy record has no median at all; it must not be read as zero.
    const legacy = { ...fixedLength("legacy", T - HOUR) } as Record<string, unknown>;
    delete legacy.medianCorrectResponseMs;
    const result = compareSession({ summary, attempts: [], history: [summary, legacy as unknown as SessionSummary] });
    expect(result.medianCorrect).toBeNull();
    expect(result.medianCorrectMissing).toBe(1);
    expect(result.personalBests).not.toContain("speed");
  });

  it("does not call a slower session a personal best", () => {
    const summary = withMedian("current", T, 5000, { accuracy: 0.5 });
    const result = compareSession({ summary, attempts: [], history: [summary, withMedian("p1", T - HOUR, 3000, { accuracy: 0.9 })] });
    expect(result.personalBests).toEqual([]);
    expect(result.medianCorrect?.delta).toBe(2000);
  });
});

describe("slowestArea", () => {
  const slow = { operation: "division", numberType: "integer", variant: "int-div-2digit-divisor" } as const;

  it("names the kind of question that is right but slow", () => {
    const attempts = [
      ...Array.from({ length: 6 }, (_, i) => skillAttempt("s", i, true, { responseMs: 2000 })),
      ...Array.from({ length: 4 }, (_, i) => skillAttempt("s", 10 + i, true, { ...slow, responseMs: 7000 })),
    ];
    const area = slowestArea(attempts);
    expect(area).toMatchObject({ scope: "skill", label: "Two-digit divisors", correct: 4 });
    expect(area?.medianMs).toBe(7000);
    expect(area?.elsewhereMs).toBe(2000);
    expect(area?.ratio).toBeCloseTo(3.5);
  });

  it("says nothing when times are even, or when there is too little to compare", () => {
    const even = Array.from({ length: 10 }, (_, i) => skillAttempt("s", i, true, { responseMs: 2000 + (i % 2) * 100, ...(i > 4 ? slow : {}) }));
    expect(slowestArea(even)).toBeNull();
    // Wrong answers are not counted: being slow and wrong is a mistake, not slowness.
    const mostlyWrong = Array.from({ length: 8 }, (_, i) => skillAttempt("s", i, false, { responseMs: 9000, ...(i > 3 ? slow : {}) }));
    expect(slowestArea(mostlyWrong)).toBeNull();
    expect(slowestArea([])).toBeNull();
  });

  it("carries a practice target so it can be drilled", () => {
    const attempts = [
      ...Array.from({ length: 6 }, (_, i) => skillAttempt("s", i, true, { responseMs: 1500 })),
      ...Array.from({ length: 4 }, (_, i) => skillAttempt("s", 10 + i, true, { ...slow, responseMs: 6000 })),
    ];
    expect(slowestArea(attempts)?.target).toMatchObject({ numberType: "integer", operation: "division", facet: "int-div-2digit-divisor" });
  });
});

describe("weakestArea", () => {
  const division = { operation: "division", numberType: "integer", variant: "int-div-2digit-divisor" } as const;
  const multiplication = { operation: "multiplication", numberType: "integer", variant: "int-mul-2x1" } as const;

  it("names the least accurate skill once it has enough answers", () => {
    const attempts = [
      ...Array.from({ length: 5 }, (_, i) => skillAttempt("s", i, i > 0)), // additions: 4 of 5
      ...Array.from({ length: 5 }, (_, i) => skillAttempt("s", 10 + i, i === 0, division)), // divisions: 1 of 5
      ...Array.from({ length: 5 }, (_, i) => skillAttempt("s", 20 + i, true, multiplication)),
    ];
    const { area, reason } = weakestArea(attempts);
    expect(reason).toBeNull();
    expect(area).toMatchObject({ scope: "skill", label: "Two-digit divisors", attempts: 5, correct: 1, incorrect: 4 });
    expect(area?.accuracy).toBeCloseTo(0.2);
  });

  it("falls back to the broader topic when no single skill has enough answers", () => {
    const attempts = [
      ...Array.from({ length: 3 }, (_, i) => skillAttempt("s", i, false, division)),
      ...Array.from({ length: 3 }, (_, i) => skillAttempt("s", 10 + i, true, { ...division, variant: "int-div-1digit-divisor" })),
      ...Array.from({ length: 4 }, (_, i) => skillAttempt("s", 20 + i, true, multiplication)),
    ];
    const { area } = weakestArea(attempts);
    expect(area).toMatchObject({ scope: "topic", label: "Integers · division", attempts: 6, incorrect: 3 });
  });

  it("says nothing when there is too little evidence, no miss, or no outlier", () => {
    expect(weakestArea([])).toEqual({ area: null, reason: "too-few-answers" });
    expect(weakestArea([skillAttempt("s", 1, false), skillAttempt("s", 2, true, division)])).toEqual({ area: null, reason: "too-few-answers" });
    expect(weakestArea(Array.from({ length: 8 }, (_, i) => skillAttempt("s", i, true)))).toEqual({ area: null, reason: "no-misses" });

    // Misses spread evenly: no group is worse than the average of the rest.
    const even = [
      ...Array.from({ length: 5 }, (_, i) => skillAttempt("s", i, i > 0)),
      ...Array.from({ length: 5 }, (_, i) => skillAttempt("s", 10 + i, i > 0, division)),
    ];
    expect(weakestArea(even)).toEqual({ area: null, reason: "nothing-stands-out" });

    // A single kind of question cannot be weakest against itself.
    expect(weakestArea(Array.from({ length: 6 }, (_, i) => skillAttempt("s", i, i > 1)))).toEqual({ area: null, reason: "nothing-stands-out" });
  });
});
