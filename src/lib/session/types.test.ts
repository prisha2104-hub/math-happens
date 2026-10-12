import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANCED_SETTINGS } from "@/lib/engine/advanced";
import { DEFAULT_SETTINGS, type TrainerSettings, coerceSessionSettings, coerceSettings, validateSettings } from "./types";

describe("settings migration", () => {
  it("defaults existing saved configurations to open answers", () => {
    const phaseOne = {
      mode: "timed",
      durationMinutes: 4,
      questionLimit: null,
      difficulty: "hard",
      operations: ["division"],
      numberTypes: ["decimal"],
    };
    const coerced = coerceSettings(phaseOne);
    expect(coerced.answerFormat).toBe("open");
    expect(coerced).toMatchObject({ difficulty: "hard", operations: ["division"], numberTypes: ["decimal"] });
  });

  it("keeps a saved multiple-choice preference and rejects junk", () => {
    expect(coerceSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice" }).answerFormat).toBe("multiple-choice");
    expect(coerceSettings({ ...DEFAULT_SETTINGS, answerFormat: "telepathy" }).answerFormat).toBe("open");
    expect(coerceSettings(null).answerFormat).toBe("open");
    expect(DEFAULT_SETTINGS.answerFormat).toBe("open");
  });

  it("validates independently of the answer format", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice" })).toEqual([]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, answerFormat: "multiple-choice", operations: [] })).toHaveLength(1);
  });

  it("gives advanced settings the defaults when they are absent", () => {
    expect(coerceSettings({ mode: "timed" }).advanced).toEqual(DEFAULT_ADVANCED_SETTINGS);
    expect(coerceSettings(null).advanced.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.advanced.enabled).toBe(false);
  });

  it("round-trips advanced settings through coercion", () => {
    const advanced = {
      ...DEFAULT_ADVANCED_SETTINGS,
      enabled: true,
      operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 },
      formatMix: { integer: 75, decimal: 0, fraction: 25 },
    };
    expect(coerceSettings({ ...DEFAULT_SETTINGS, advanced }).advanced).toEqual(advanced);
  });
});

describe("validation with advanced settings on", () => {
  const withAdvanced = (advanced: Partial<typeof DEFAULT_ADVANCED_SETTINGS>): TrainerSettings => ({
    ...DEFAULT_SETTINGS,
    advanced: { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, ...advanced },
  });

  it("accepts the defaults", () => {
    expect(validateSettings(withAdvanced({}))).toEqual([]);
  });

  it("points at the highlighted fields rather than repeating each message", () => {
    const one = validateSettings(withAdvanced({ operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 5, finance: 0 } }));
    expect(one).toEqual(["Advanced settings need a fix — see the highlighted field below."]);

    const several = validateSettings(
      withAdvanced({
        operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 5, finance: 0 },
        formatMix: { integer: 10, decimal: 0, fraction: 10 },
      }),
    );
    expect(several).toEqual(["Advanced settings need fixes — see the highlighted fields below."]);
  });

  it("stops asking for operation and number type toggles, since the mixes replace them", () => {
    // An empty toggle selection is irrelevant while the percentages are in charge.
    expect(validateSettings(withAdvanced({}))).toEqual([]);
    expect(validateSettings({ ...withAdvanced({}), operations: [], numberTypes: [] })).toEqual([]);
    // With advanced settings off the toggles matter again.
    expect(validateSettings({ ...DEFAULT_SETTINGS, operations: [], numberTypes: [] })).toHaveLength(2);
  });

  it("does not ask for a number format when only Finance maths is selected", () => {
    // Finance questions are word problems with their own numbers.
    expect(validateSettings({ ...DEFAULT_SETTINGS, operations: ["finance"], numberTypes: [] })).toEqual([]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, operations: ["finance", "addition"], numberTypes: [] })).toEqual(["Select at least one number type."]);
  });

  it("still validates the timer and question limit", () => {
    expect(validateSettings({ ...withAdvanced({}), durationMinutes: 99 })).toHaveLength(1);
    expect(validateSettings({ ...withAdvanced({}), questionLimit: 9999 })).toHaveLength(1);
  });
});

describe("settings of a stored session", () => {
  const plan = {
    targets: [
      { target: { numberType: "integer", operation: "division", difficulty: "hard", facet: "int-div-2digit-divisor", feature: null }, weight: 0.6, reason: "weak-accuracy", label: "Two-digit divisors" },
      { target: { numberType: "decimal", operation: "addition", difficulty: "hard" }, weight: 0.4, reason: "fresh", label: "Decimals" },
    ],
    createdAt: 123,
    summary: "55% weak skills",
    coldStart: false,
  };

  it("keeps the Improve plan a preference would drop", () => {
    const stored = { ...DEFAULT_SETTINGS, difficulty: "hard", plan };
    // Saved preferences must never carry a plan …
    expect(coerceSettings(stored).plan).toBeUndefined();
    // … but a session that was run keeps it, so it is still recognisable as adaptive practice.
    const session = coerceSessionSettings(stored);
    expect(session.plan?.targets).toHaveLength(2);
    expect(session.plan?.targets[0]).toMatchObject({ reason: "weak-accuracy", label: "Two-digit divisors" });
    expect(session.plan?.targets[0]?.target).toMatchObject({ numberType: "integer", operation: "division", difficulty: "hard", facet: "int-div-2digit-divisor" });
    expect(session.plan?.summary).toBe("55% weak skills");
  });

  it("drops malformed plans and targets instead of trusting them", () => {
    expect(coerceSessionSettings({ ...DEFAULT_SETTINGS }).plan).toBeUndefined();
    expect(coerceSessionSettings({ ...DEFAULT_SETTINGS, plan: { targets: "nope" } }).plan).toBeUndefined();
    const messy = coerceSessionSettings({
      ...DEFAULT_SETTINGS,
      plan: { targets: [{ target: { numberType: "quaternion", operation: "division", difficulty: "hard" } }, { target: { numberType: "integer", operation: "addition", difficulty: "easy" }, reason: "from-the-future" }] },
    });
    expect(messy.plan?.targets).toHaveLength(1);
    expect(messy.plan?.targets[0]).toMatchObject({ reason: "fresh", weight: 0, label: "" });
    expect(messy.plan?.createdAt).toBe(0);
  });
});
