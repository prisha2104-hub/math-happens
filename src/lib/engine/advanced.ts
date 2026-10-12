import {
  ARITHMETIC_OPERATIONS,
  type ArithmeticOperation,
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  type NumberType,
  OPERATIONS,
  OPERATION_LABELS,
  type Operation,
} from "./types";
import {
  DEFAULT_FINANCE_SETTINGS,
  FINANCE_ANSWER_STYLES,
  FINANCE_SUBTYPES,
  FINANCE_VALUE_STYLES,
  type FinanceAnswerStyle,
  type FinanceSettings,
  type FinanceSubtype,
  type FinanceValueStyle,
  MAX_FINANCE_AMOUNT,
  MAX_FINANCE_ROUNDING,
  MIN_FINANCE_AMOUNT,
  financeMixTotal,
} from "./finance";

/**
 * Optional per-operation control over the generators: how big the operands
 * are, how the questions are split between operations and number formats, and
 * what fractions are built from.
 *
 * While `enabled` is false every other field is ignored and generation follows
 * the difficulty tiers exactly as it always has, so the default practice
 * behaviour is preserved until the user opts in.
 */
export interface NumericRange {
  min: number;
  max: number;
}

export interface FractionRanges {
  numerator: NumericRange;
  denominator: NumericRange;
}

export interface AdvancedSettings {
  enabled: boolean;
  /** Inclusive operand bounds per arithmetic operation. Both operands of a question obey them. */
  operandRanges: Record<ArithmeticOperation, NumericRange>;
  /**
   * Optional separate bounds for the second multiplication operand, so
   * lopsided products such as four-digit × three-digit can be practised.
   * null means both operands share `operandRanges.multiplication`.
   */
  multiplicationSecondRange: NumericRange | null;
  /** Share of questions per operation as whole percentages summing to 100. */
  operationMix: Record<Operation, number>;
  /** Share of questions per number format as whole percentages summing to 100. */
  formatMix: Record<NumberType, number>;
  fractionRanges: FractionRanges;
  /** Finance maths families and how their numbers are drawn. */
  finance: FinanceSettings;
}

export const MIN_OPERAND = 1;
export const MAX_OPERAND = 1_000_000;
/** Numerators and denominators stay small enough that fraction products remain safe integers. */
export const MIN_FRACTION_PART = 1;
export const MAX_FRACTION_PART = 999;

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  enabled: false,
  operandRanges: {
    addition: { min: 10, max: 999 },
    subtraction: { min: 10, max: 999 },
    multiplication: { min: 2, max: 99 },
    division: { min: 2, max: 999 },
  },
  multiplicationSecondRange: null,
  // Finance starts at 0%: switching advanced settings on must not change what
  // an existing setup practises.
  operationMix: { addition: 25, subtraction: 25, multiplication: 25, division: 25, finance: 0 },
  formatMix: { integer: 100, decimal: 0, fraction: 0 },
  fractionRanges: { numerator: { min: 1, max: 9 }, denominator: { min: 2, max: 12 } },
  finance: DEFAULT_FINANCE_SETTINGS,
};

/** Field a validation message belongs beside. */
export type AdvancedField =
  | `operandRange.${ArithmeticOperation}`
  | "multiplicationSecondRange"
  | "operationMix"
  | "formatMix"
  | "fractionRanges.numerator"
  | "fractionRanges.denominator"
  | "financeMix"
  | "financeAmountRange";

export interface AdvancedIssue {
  field: AdvancedField;
  message: string;
}

export function mixTotal(mix: Record<string, number>): number {
  return Object.values(mix).reduce((sum, share) => sum + (Number.isFinite(share) ? share : 0), 0);
}

/** Operations with a share above zero, in canonical order. */
export function activeOperations(advanced: AdvancedSettings): Operation[] {
  return OPERATIONS.filter((op) => advanced.operationMix[op] > 0);
}

/** Number formats with a share above zero, in canonical order. */
export function activeNumberTypes(advanced: AdvancedSettings): NumberType[] {
  return NUMBER_TYPES.filter((type) => advanced.formatMix[type] > 0);
}

/** The advanced settings to apply, or null when they are off or absent. */
export function activeAdvanced(advanced: AdvancedSettings | null | undefined): AdvancedSettings | null {
  return advanced && advanced.enabled ? advanced : null;
}

function isWholeShare(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function rangeIssues(range: NumericRange, min: number, max: number, label: string): string[] {
  const out: string[] = [];
  for (const [bound, value] of [
    ["Minimum", range.min],
    ["Maximum", range.max],
  ] as const) {
    if (!Number.isInteger(value)) out.push(`${bound} must be a whole number.`);
    else if (value < min || value > max) out.push(`${bound} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
  }
  if (out.length === 0 && range.min > range.max) out.push(`${label} minimum cannot be above the maximum.`);
  return out;
}

/**
 * Validate the fields that will actually be used. A group excluded by a 0 %
 * share is not validated, so setting an operation to 0 % is enough to silence
 * complaints about its range.
 */
export function validateAdvanced(advanced: AdvancedSettings): AdvancedIssue[] {
  const issues: AdvancedIssue[] = [];
  const add = (field: AdvancedField, message: string) => issues.push({ field, message });

  const operationTotal = mixTotal(advanced.operationMix);
  if (!OPERATIONS.every((op) => isWholeShare(advanced.operationMix[op]))) {
    add("operationMix", "Each share must be a whole number between 0 and 100.");
  } else if (operationTotal !== 100) {
    add("operationMix", `Operation shares add up to ${operationTotal}%, not 100%.`);
  }

  const formatTotal = mixTotal(advanced.formatMix);
  if (!NUMBER_TYPES.every((type) => isWholeShare(advanced.formatMix[type]))) {
    add("formatMix", "Each share must be a whole number between 0 and 100.");
  } else if (formatTotal !== 100) {
    add("formatMix", `Number format shares add up to ${formatTotal}%, not 100%.`);
  }

  // Operand ranges only drive integer questions, so they are irrelevant when
  // integers are excluded by the format mix.
  if ((advanced.formatMix.integer ?? 0) > 0) {
    for (const op of ARITHMETIC_OPERATIONS) {
      if ((advanced.operationMix[op] ?? 0) <= 0) continue;
      const range = advanced.operandRanges[op];
      const field = `operandRange.${op}` as const;
      const problems = rangeIssues(range, MIN_OPERAND, MAX_OPERAND, OPERATION_LABELS[op]);
      for (const message of problems) add(field, message);
      // Division keeps both operands in range and stays exact, so the dividend
      // is divisor × quotient with a quotient of at least 2.
      if (problems.length === 0 && op === "division" && range.max < range.min * 2) {
        add(field, `Division needs a maximum of at least ${(range.min * 2).toLocaleString()} so a dividend and divisor both fit the range.`);
      }
    }
    if (advanced.multiplicationSecondRange !== null && (advanced.operationMix.multiplication ?? 0) > 0) {
      for (const message of rangeIssues(advanced.multiplicationSecondRange, MIN_OPERAND, MAX_OPERAND, "Second operand")) {
        add("multiplicationSecondRange", message);
      }
    }
  }

  // Finance settings are only in play when finance questions are.
  if ((advanced.operationMix.finance ?? 0) > 0) {
    const total = financeMixTotal(advanced.finance);
    if (!FINANCE_SUBTYPES.every((subtype) => isWholeShare(advanced.finance.subtypeMix[subtype]))) {
      add("financeMix", "Each share must be a whole number between 0 and 100.");
    } else if (total !== 100) {
      add("financeMix", `Finance question shares add up to ${total}%, not 100%.`);
    }
    for (const message of rangeIssues(advanced.finance.amountRange, MIN_FINANCE_AMOUNT, MAX_FINANCE_AMOUNT, "Amount")) {
      add("financeAmountRange", message);
    }
  }

  if ((advanced.formatMix.fraction ?? 0) > 0) {
    const { numerator, denominator } = advanced.fractionRanges;
    for (const message of rangeIssues(numerator, MIN_FRACTION_PART, MAX_FRACTION_PART, "Numerator")) {
      add("fractionRanges.numerator", message);
    }
    for (const message of rangeIssues(denominator, MIN_FRACTION_PART, MAX_FRACTION_PART, "Denominator")) {
      add("fractionRanges.denominator", message);
    }
    if (Number.isInteger(denominator.min) && denominator.min < 1) {
      add("fractionRanges.denominator", "Denominators must be at least 1 — a denominator of zero is undefined.");
    }
  }

  return issues;
}

/** Human-readable summary of what is switched on, for the setup summary line. */
export function describeAdvanced(advanced: AdvancedSettings): string {
  const ops = activeOperations(advanced).map((op) => `${advanced.operationMix[op]}% ${OPERATION_LABELS[op].toLowerCase()}`);
  const formats = activeNumberTypes(advanced).map((type) => `${advanced.formatMix[type]}% ${NUMBER_TYPE_LABELS[type].toLowerCase()}`);
  return [ops.join(", "), formats.join(", ")].filter((part) => part.length > 0).join(" · ");
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function coerceRange(input: unknown, fallback: NumericRange): NumericRange {
  const raw = isRecord(input) ? input : {};
  const read = (value: unknown, defaultValue: number) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : defaultValue);
  return { min: read(raw.min, fallback.min), max: read(raw.max, fallback.max) };
}

function coerceShares<T extends string>(input: unknown, keys: readonly T[], fallback: Record<T, number>): Record<T, number> {
  const raw = isRecord(input) ? input : null;
  if (!raw) return { ...fallback };
  const out = {} as Record<T, number>;
  for (const key of keys) {
    const value = raw[key];
    out[key] = typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
  }
  // A stored mix that lost every share would block the Start button with no
  // obvious cause, so fall back to the defaults instead.
  return mixTotal(out) === 0 ? { ...fallback } : out;
}

function coerceOneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Finance settings written by a build that did not have them (or had fewer
 * families) fall back to the defaults field by field, so an older stored
 * configuration keeps working and simply gains the new families at their
 * default shares.
 */
export function coerceFinance(input: unknown): FinanceSettings {
  const raw = isRecord(input) ? input : null;
  if (raw === null) return DEFAULT_FINANCE_SETTINGS;
  const rounding = typeof raw.rounding === "number" && Number.isFinite(raw.rounding) ? Math.round(raw.rounding) : DEFAULT_FINANCE_SETTINGS.rounding;
  return {
    subtypeMix: coerceShares<FinanceSubtype>(raw.subtypeMix, FINANCE_SUBTYPES, DEFAULT_FINANCE_SETTINGS.subtypeMix),
    valueStyle: coerceOneOf<FinanceValueStyle>(FINANCE_VALUE_STYLES, raw.valueStyle, DEFAULT_FINANCE_SETTINGS.valueStyle),
    answerStyle: coerceOneOf<FinanceAnswerStyle>(FINANCE_ANSWER_STYLES, raw.answerStyle, DEFAULT_FINANCE_SETTINGS.answerStyle),
    rounding: Math.min(MAX_FINANCE_ROUNDING, Math.max(0, rounding)),
    amountRange: coerceRange(raw.amountRange, DEFAULT_FINANCE_SETTINGS.amountRange),
  };
}

/**
 * Coerce unknown data (settings written by an older build, a hand-edited
 * export) into advanced settings, falling back field by field. Values are kept
 * even when they fail validation so the user sees their own numbers next to
 * the explanation rather than having them silently replaced.
 */
export function coerceAdvanced(input: unknown): AdvancedSettings {
  const raw = isRecord(input) ? input : {};
  const rangesRaw = isRecord(raw.operandRanges) ? raw.operandRanges : {};
  const fractionRaw = isRecord(raw.fractionRanges) ? raw.fractionRanges : {};
  const operandRanges = {} as Record<ArithmeticOperation, NumericRange>;
  for (const op of ARITHMETIC_OPERATIONS) operandRanges[op] = coerceRange(rangesRaw[op], DEFAULT_ADVANCED_SETTINGS.operandRanges[op]);
  return {
    enabled: raw.enabled === true,
    operandRanges,
    // Absent means "both operands share one range", which is what every
    // configuration saved before this option existed meant.
    multiplicationSecondRange: isRecord(raw.multiplicationSecondRange)
      ? coerceRange(raw.multiplicationSecondRange, DEFAULT_ADVANCED_SETTINGS.operandRanges.multiplication)
      : null,
    operationMix: coerceShares(raw.operationMix, OPERATIONS, DEFAULT_ADVANCED_SETTINGS.operationMix),
    formatMix: coerceShares(raw.formatMix, NUMBER_TYPES, DEFAULT_ADVANCED_SETTINGS.formatMix),
    fractionRanges: {
      numerator: coerceRange(fractionRaw.numerator, DEFAULT_ADVANCED_SETTINGS.fractionRanges.numerator),
      denominator: coerceRange(fractionRaw.denominator, DEFAULT_ADVANCED_SETTINGS.fractionRanges.denominator),
    },
    finance: coerceFinance(raw.finance),
  };
}
