import type { NumericRange } from "./advanced";

/**
 * Finance maths settings: which question families appear, how friendly the
 * numbers are, and whether answers must be exact.
 *
 * These live inside the advanced settings but have working defaults, so
 * ticking the Finance maths operation is enough to start practising — the
 * defaults lean on the families that transfer everywhere (percentages,
 * percentage changes, fraction conversions, ratios and weighted averages) and
 * keep the specialised valuation families as a small share.
 */
export const FINANCE_SUBTYPES = [
  "percent-of",
  "reverse-percent",
  "percent-change",
  "fraction-to-percent",
  "weighted-average",
  "successive-returns",
  "basis-points",
  "profit-margin",
  "valuation-multiple",
  "enterprise-value",
  "expected-value",
  "compounding",
] as const;

export type FinanceSubtype = (typeof FINANCE_SUBTYPES)[number];

export const FINANCE_SUBTYPE_LABELS: Record<FinanceSubtype, string> = {
  "percent-of": "Percentages",
  "reverse-percent": "Reverse percentages",
  "percent-change": "Percentage changes",
  "fraction-to-percent": "Fractions and decimals to percentages",
  "weighted-average": "Ratios and weighted averages",
  "successive-returns": "Successive returns",
  "basis-points": "Basis points",
  "profit-margin": "Profit margins",
  "valuation-multiple": "Valuation multiples",
  "enterprise-value": "Enterprise and equity value",
  "expected-value": "Expected value",
  compounding: "Compounding",
};

/** One concrete example per family, shown beside its share in the settings. */
export const FINANCE_SUBTYPE_EXAMPLES: Record<FinanceSubtype, string> = {
  "percent-of": "What is 25% of 76?",
  "reverse-percent": "18 is 12% of what?",
  "percent-change": "$80 → $92: what is the gain?",
  "fraction-to-percent": "Express 3/8 as a percentage",
  "weighted-average": "60% returns 10%, 40% loses 5%",
  "successive-returns": "−20% then +20%",
  "basis-points": "4.25% → 4.60% in basis points",
  "profit-margin": "Revenue $250, profit $40",
  "valuation-multiple": "$84 price, $7 EPS",
  "enterprise-value": "Equity $500m, debt $100m, cash $30m",
  "expected-value": "40% of +$30, otherwise −$10",
  compounding: "$100 at 10% for 2 years",
};

/**
 * Default share of finance questions per family, as whole percentages
 * summing to 100. The first five carry the weight because they are the
 * skills every other family is built from.
 */
export const DEFAULT_FINANCE_MIX: Record<FinanceSubtype, number> = {
  "percent-of": 20,
  "reverse-percent": 10,
  "percent-change": 20,
  "fraction-to-percent": 12,
  "weighted-average": 12,
  "successive-returns": 6,
  "basis-points": 5,
  "profit-margin": 5,
  "valuation-multiple": 4,
  "enterprise-value": 2,
  "expected-value": 2,
  compounding: 2,
};

/** How the numbers in a prompt are drawn. */
export const FINANCE_VALUE_STYLES = ["whole", "mixed", "decimal"] as const;
export type FinanceValueStyle = (typeof FINANCE_VALUE_STYLES)[number];

export const FINANCE_VALUE_STYLE_LABELS: Record<FinanceValueStyle, string> = {
  whole: "Whole numbers",
  mixed: "Mixed",
  decimal: "Decimals",
};

/** Whether the exact answer is required or an estimate inside a band counts. */
export const FINANCE_ANSWER_STYLES = ["exact", "estimate"] as const;
export type FinanceAnswerStyle = (typeof FINANCE_ANSWER_STYLES)[number];

export const FINANCE_ANSWER_STYLE_LABELS: Record<FinanceAnswerStyle, string> = {
  exact: "Exact answers",
  estimate: "Estimates allowed",
};

export const MIN_FINANCE_AMOUNT = 4;
export const MAX_FINANCE_AMOUNT = 100_000;
export const MAX_FINANCE_ROUNDING = 2;

export interface FinanceSettings {
  /** Share of finance questions per family, whole percentages summing to 100. */
  subtypeMix: Record<FinanceSubtype, number>;
  valueStyle: FinanceValueStyle;
  answerStyle: FinanceAnswerStyle;
  /**
   * Decimal places answers are asked for when the exact value does not come
   * out round. The instruction is always written on the question.
   */
  rounding: number;
  /** Bounds for the money amounts and bases the prompts are built from. */
  amountRange: NumericRange;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  subtypeMix: DEFAULT_FINANCE_MIX,
  valueStyle: "mixed",
  answerStyle: "exact",
  rounding: 1,
  amountRange: { min: 20, max: 600 },
};

/** Families with a share above zero, in canonical order. */
export function activeFinanceSubtypes(finance: FinanceSettings): FinanceSubtype[] {
  return FINANCE_SUBTYPES.filter((subtype) => finance.subtypeMix[subtype] > 0);
}

export function financeMixTotal(finance: FinanceSettings): number {
  return FINANCE_SUBTYPES.reduce((sum, subtype) => sum + (Number.isFinite(finance.subtypeMix[subtype]) ? finance.subtypeMix[subtype] : 0), 0);
}

export function isFinanceSubtype(value: unknown): value is FinanceSubtype {
  return typeof value === "string" && (FINANCE_SUBTYPES as readonly string[]).includes(value);
}
