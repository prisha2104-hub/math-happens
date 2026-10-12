import { describe, expect, it } from "vitest";
import {
  type AdvancedSettings,
  DEFAULT_ADVANCED_SETTINGS,
  activeNumberTypes,
  activeOperations,
  coerceAdvanced,
  mixTotal,
  validateAdvanced,
} from "./advanced";

/** Defaults with the feature on, which is the only state validation applies to. */
function enabled(overrides: Partial<AdvancedSettings> = {}): AdvancedSettings {
  return { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, ...overrides };
}

const fieldsOf = (settings: AdvancedSettings) => validateAdvanced(settings).map((issue) => issue.field);

describe("advanced settings defaults", () => {
  it("are off, so default practice is untouched", () => {
    expect(DEFAULT_ADVANCED_SETTINGS.enabled).toBe(false);
  });

  it("have mixes that already add up to 100%", () => {
    expect(mixTotal(DEFAULT_ADVANCED_SETTINGS.operationMix)).toBe(100);
    expect(mixTotal(DEFAULT_ADVANCED_SETTINGS.formatMix)).toBe(100);
    expect(validateAdvanced(enabled())).toEqual([]);
  });

  it("never allow a zero denominator", () => {
    expect(DEFAULT_ADVANCED_SETTINGS.fractionRanges.denominator.min).toBeGreaterThanOrEqual(1);
  });
});

describe("active operations and formats", () => {
  it("drops anything at 0% and keeps canonical order", () => {
    const settings = enabled({
      operationMix: { addition: 40, subtraction: 0, multiplication: 60, division: 0, finance: 0 },
      formatMix: { integer: 75, decimal: 0, fraction: 25 },
    });
    expect(activeOperations(settings)).toEqual(["addition", "multiplication"]);
    expect(activeNumberTypes(settings)).toEqual(["integer", "fraction"]);
  });
});

describe("percentage validation", () => {
  it("requires each group to total exactly 100%", () => {
    const short = enabled({ operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 5, finance: 0 } });
    expect(validateAdvanced(short)).toEqual([{ field: "operationMix", message: "Operation shares add up to 95%, not 100%." }]);

    const over = enabled({ formatMix: { integer: 75, decimal: 30, fraction: 25 } });
    expect(validateAdvanced(over)).toEqual([{ field: "formatMix", message: "Number format shares add up to 130%, not 100%." }]);
  });

  it("accepts the example mixes from the brief", () => {
    const settings = enabled({
      operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 },
      formatMix: { integer: 75, decimal: 0, fraction: 25 },
    });
    expect(validateAdvanced(settings)).toEqual([]);
  });

  it("rejects fractional and out-of-bounds shares", () => {
    expect(fieldsOf(enabled({ operationMix: { addition: 25.5, subtraction: 25, multiplication: 25, division: 24.5, finance: 0 } }))).toEqual(["operationMix"]);
    expect(fieldsOf(enabled({ formatMix: { integer: 120, decimal: 0, fraction: -20 } }))).toEqual(["formatMix"]);
  });
});

describe("range validation", () => {
  it("accepts a plain range such as 10–1,000", () => {
    const settings = enabled({
      operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, addition: { min: 10, max: 1000 } },
    });
    expect(validateAdvanced(settings)).toEqual([]);
  });

  it("explains an inverted range beside its own operation", () => {
    const settings = enabled({
      operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, multiplication: { min: 500, max: 20 } },
    });
    expect(validateAdvanced(settings)).toEqual([
      { field: "operandRange.multiplication", message: "Multiplication minimum cannot be above the maximum." },
    ]);
  });

  it("rejects bounds outside the supported span and non-whole values", () => {
    const settings = enabled({
      operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, addition: { min: 0, max: 9_999_999 } },
    });
    const messages = validateAdvanced(settings);
    expect(messages).toHaveLength(2);
    expect(messages.every((issue) => issue.field === "operandRange.addition")).toBe(true);
    expect(fieldsOf(enabled({ operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, addition: { min: 1.5, max: 10 } } }))).toEqual([
      "operandRange.addition",
    ]);
  });

  it("requires division to have room for a dividend and a divisor", () => {
    const tooNarrow = enabled({ operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, division: { min: 500, max: 600 } } });
    expect(validateAdvanced(tooNarrow)).toEqual([
      {
        field: "operandRange.division",
        message: "Division needs a maximum of at least 1,000 so a dividend and divisor both fit the range.",
      },
    ]);
    const wideEnough = enabled({ operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, division: { min: 500, max: 1000 } } });
    expect(validateAdvanced(wideEnough)).toEqual([]);
  });

  it("ignores ranges for operations and formats excluded by a 0% share", () => {
    const settings = enabled({
      operationMix: { addition: 100, subtraction: 0, multiplication: 0, division: 0, finance: 0 },
      operandRanges: {
        addition: { min: 10, max: 99 },
        subtraction: { min: 900, max: 2 },
        multiplication: { min: 0, max: 0 },
        division: { min: 500, max: 501 },
      },
    });
    expect(validateAdvanced(settings)).toEqual([]);

    // Integers excluded: the operand ranges stop mattering entirely.
    const fractionsOnly = enabled({
      formatMix: { integer: 0, decimal: 0, fraction: 100 },
      operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, addition: { min: 900, max: 2 } },
    });
    expect(validateAdvanced(fractionsOnly)).toEqual([]);
  });

  it("validates fraction ranges only when fractions are in the mix", () => {
    const ranges = { numerator: { min: 5, max: 1 }, denominator: { min: 0, max: 12 } };
    expect(validateAdvanced(enabled({ formatMix: { integer: 100, decimal: 0, fraction: 0 }, fractionRanges: ranges }))).toEqual([]);

    const fields = fieldsOf(enabled({ formatMix: { integer: 50, decimal: 0, fraction: 50 }, fractionRanges: ranges }));
    expect(fields).toContain("fractionRanges.numerator");
    expect(fields).toContain("fractionRanges.denominator");
  });

  it("names a zero denominator specifically", () => {
    const settings = enabled({
      formatMix: { integer: 0, decimal: 0, fraction: 100 },
      fractionRanges: { numerator: { min: 1, max: 9 }, denominator: { min: 0, max: 12 } },
    });
    const messages = validateAdvanced(settings).map((issue) => issue.message);
    expect(messages).toContain("Minimum must be between 1 and 999.");
  });
});

describe("coercion from storage", () => {
  it("falls back to the defaults for missing or junk data", () => {
    expect(coerceAdvanced(undefined)).toEqual(DEFAULT_ADVANCED_SETTINGS);
    expect(coerceAdvanced(null)).toEqual(DEFAULT_ADVANCED_SETTINGS);
    expect(coerceAdvanced("nonsense")).toEqual(DEFAULT_ADVANCED_SETTINGS);
    expect(coerceAdvanced({ enabled: "yes" }).enabled).toBe(false);
  });

  it("keeps recognised fields and rounds numbers", () => {
    const coerced = coerceAdvanced({
      enabled: true,
      operationMix: { addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 },
      formatMix: { integer: 75, decimal: 0, fraction: 25 },
      operandRanges: { addition: { min: 10.4, max: 1000.6 } },
      fractionRanges: { denominator: { min: 3, max: 8 } },
    });
    expect(coerced.enabled).toBe(true);
    expect(coerced.operationMix).toEqual({ addition: 40, subtraction: 20, multiplication: 30, division: 10, finance: 0 });
    expect(coerced.formatMix).toEqual({ integer: 75, decimal: 0, fraction: 25 });
    expect(coerced.operandRanges.addition).toEqual({ min: 10, max: 1001 });
    // Unspecified operations and the numerator keep their defaults.
    expect(coerced.operandRanges.division).toEqual(DEFAULT_ADVANCED_SETTINGS.operandRanges.division);
    expect(coerced.fractionRanges.denominator).toEqual({ min: 3, max: 8 });
    expect(coerced.fractionRanges.numerator).toEqual(DEFAULT_ADVANCED_SETTINGS.fractionRanges.numerator);
  });

  it("keeps invalid-but-numeric values so the user sees their own input explained", () => {
    const coerced = coerceAdvanced({ enabled: true, operandRanges: { division: { min: 500, max: 600 } } });
    expect(coerced.operandRanges.division).toEqual({ min: 500, max: 600 });
    expect(fieldsOf(coerced)).toEqual(["operandRange.division"]);
  });

  it("restores the default mix when a stored mix has lost every share", () => {
    const coerced = coerceAdvanced({ enabled: true, operationMix: { addition: 0, subtraction: 0, multiplication: 0, division: 0, finance: 0 } });
    expect(coerced.operationMix).toEqual(DEFAULT_ADVANCED_SETTINGS.operationMix);
  });
});
