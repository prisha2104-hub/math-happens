import {
  type Difficulty,
  NUMBER_TYPE_LABELS,
  type NumberType,
  OPERATION_LABELS,
  type Operation,
  type QuestionMeta,
} from "@/lib/engine/types";

/**
 * A facet is the generator variant with its difficulty/sign suffixes removed:
 * the specific kind of problem ("two-digit divisors", "tenths × hundredths")
 * inside an operation. Difficulty stays a separate axis.
 */
export function facetOf(variant: string): string {
  return variant.replace(/-(easy|medium|hard)(?=-|$)/g, "").replace(/-negative$/, "");
}

const FACET_LABELS: Record<string, string> = {
  "int-add": "Whole-number sums",
  "int-sub": "Whole-number differences",
  "int-mul-times-table": "Times-table facts",
  "int-mul-2x1-small": "Small two-digit × one-digit",
  "int-mul-2x1": "Two-digit × one-digit",
  "int-mul-2x2-small": "Small two-digit × two-digit",
  "int-mul-2x2": "Two-digit × two-digit",
  "int-mul-3x1": "Three-digit × one-digit",
  "int-div-times-table": "Division facts",
  "int-div-1digit-divisor": "One-digit divisors",
  "int-div-2digit-divisor": "Two-digit divisors",
  "int-div-2digit-divisor-large": "Two-digit divisors, long quotients",
  "int-div-1digit-divisor-large": "One-digit divisors, long quotients",
  "dec-add-1dp-1dp": "Adding tenths",
  "dec-add-1dp-2dp": "Adding tenths to hundredths",
  "dec-add-2dp-2dp": "Adding hundredths",
  "dec-add-1dp-large-2dp": "Adding large decimals",
  "dec-sub-1dp-1dp": "Subtracting tenths",
  "dec-sub-1dp-2dp": "Subtracting tenths and hundredths",
  "dec-sub-2dp-2dp": "Subtracting hundredths",
  "dec-sub-1dp-large-2dp": "Subtracting large decimals",
  "dec-mul-1dp-int": "Decimal × whole number",
  "dec-mul-tenths-int": "Tenths × whole number",
  "dec-mul-1dp-hundredths": "Tenths × hundredths",
  "dec-mul-small-2x2": "Small decimal products",
  "dec-mul-2dp-tenths": "Hundredths × tenths",
  "dec-mul-1dp-1dp": "Tenths × tenths",
  "dec-mul-2dp-sub1-1dp": "Sub-unit hundredths × tenths",
  "dec-div-by-tenths": "Dividing by tenths",
  "dec-div-by-int": "Decimal ÷ whole number",
  "dec-div-by-hundredths": "Dividing by hundredths",
  "dec-div-by-1dp": "Dividing by a decimal",
  "dec-div-2dp-to-int": "Hundredths divisor, whole quotient",
  "dec-div-1dp-to-1dp": "Decimal ÷ decimal",
  "dec-div-1dp-to-int": "Tenths divisor, whole quotient",
  "frac-add": "Adding fractions",
  "frac-sub": "Subtracting fractions",
  "frac-mul": "Multiplying fractions",
  "frac-div": "Dividing fractions",
};

export function facetLabel(facet: string, numberType: NumberType, operation: Operation): string {
  return FACET_LABELS[facet] ?? `${NUMBER_TYPE_LABELS[numberType]} · ${OPERATION_LABELS[operation].toLowerCase()}`;
}

/** Stable id for a skill: facet at a difficulty. */
export function skillId(numberType: NumberType, operation: Operation, facet: string, difficulty: Difficulty): string {
  return `${numberType}/${operation}/${facet}@${difficulty}`;
}

export const FEATURES = [
  "carry",
  "borrow",
  "two-digit-divisor",
  "decimal-divisor",
  "mixed-decimal-places",
  "unlike-denominators",
  "large-lcm",
  "cross-cancel",
  "negative-result",
] as const;

export type FeatureId = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<FeatureId, string> = {
  carry: "Carrying between columns",
  borrow: "Borrowing between columns",
  "two-digit-divisor": "Two-digit divisors",
  "decimal-divisor": "Decimal divisors",
  "mixed-decimal-places": "Mixed decimal places",
  "unlike-denominators": "Unlike denominators",
  "large-lcm": "Large common denominators",
  "cross-cancel": "Cross-cancelling",
  "negative-result": "Negative results",
};

interface Featurable {
  operation: Operation;
  numberType: NumberType;
  meta: QuestionMeta;
}

/** Structural features of a question that commonly trip people up. */
export function featuresOf({ operation, numberType, meta }: Featurable): FeatureId[] {
  const out: FeatureId[] = [];
  const additive = operation === "addition" || operation === "subtraction";
  if (numberType !== "fraction" && additive && (meta.carries ?? 0) > 0) out.push(operation === "addition" ? "carry" : "borrow");
  if (operation === "division" && numberType === "integer" && (meta.integerDigits[1] ?? 0) >= 2) out.push("two-digit-divisor");
  if (operation === "division" && numberType === "decimal" && (meta.denominators[1] ?? 1) > 1) out.push("decimal-divisor");
  if (numberType === "decimal" && additive && meta.decimalPlaces[0] !== meta.decimalPlaces[1]) out.push("mixed-decimal-places");
  if (numberType === "fraction" && additive && meta.lcm !== null) {
    const [d1 = 1, d2 = 1] = meta.denominators;
    if (meta.lcm !== d1 && meta.lcm !== d2) out.push("unlike-denominators");
    if (meta.lcm >= 24) out.push("large-lcm");
  }
  if (numberType === "fraction" && !additive && meta.crossCancel === true) out.push("cross-cancel");
  if (meta.negativeResult) out.push("negative-result");
  return out;
}
