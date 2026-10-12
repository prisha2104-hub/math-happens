import {
  type Rational,
  abs,
  add,
  div,
  gcd,
  isInteger,
  isNegative,
  lcm,
  mul,
  sub,
  terminatingDecimalPlaces,
  toNumber,
} from "@/lib/math/rational";
import { activeAdvanced } from "./advanced";
import { NUMBER_STYLE, answerDisplay, formatOperand } from "./answer";
import { DEFAULT_FINANCE_SETTINGS, type FinanceSettings } from "./finance";
import { generateDecimalProblem } from "./generators/decimals";
import { type FinanceSpec, generateFinanceSpec, renderFinance } from "./generators/finance";
import { generateFractionProblem } from "./generators/fractions";
import { generateIntegerProblem } from "./generators/integers";
import { generateRangedFractionProblem, generateRangedIntegerProblem } from "./generators/ranged";
import type { Rng } from "./rng";
import {
  type ArithmeticOperation,
  type Difficulty,
  type GeneratorSettings,
  type NumberType,
  OPERATION_SYMBOLS,
  type Question,
  type QuestionMeta,
  type RawProblem,
} from "./types";

/** How many previous question keys the generator avoids repeating. */
export const RECENT_KEY_WINDOW = 8;

export { NUMBER_STYLE, answerDisplay, formatOperand };

export interface GenerateOptions {
  settings: GeneratorSettings;
  rng: Rng;
  /** Unique id for the question; the caller decides the scheme. */
  id: string;
  /** Keys of recent questions to avoid, most recent last. */
  recentKeys?: readonly string[];
}

export function computeAnswer(operation: ArithmeticOperation, a: Rational, b: Rational): Rational {
  switch (operation) {
    case "addition":
      return add(a, b);
    case "subtraction":
      return sub(a, b);
    case "multiplication":
      return mul(a, b);
    case "division":
      return div(a, b);
  }
}

export function buildExpression(operation: ArithmeticOperation, numberType: NumberType, a: Rational, b: Rational): string {
  return `${formatOperand(a, numberType)} ${OPERATION_SYMBOLS[operation]} ${formatOperand(b, numberType)}`;
}

const COMMUTATIVE: Record<ArithmeticOperation, boolean> = {
  addition: true,
  subtraction: false,
  multiplication: true,
  division: false,
};

/** Identity for duplicate prevention; `a + b` and `b + a` share a key. */
export function questionKey(operation: ArithmeticOperation, a: Rational, b: Rational): string {
  const parts = [`${a.num}/${a.den}`, `${b.num}/${b.den}`];
  if (COMMUTATIVE[operation]) parts.sort();
  return `${operation}|${parts.join("|")}`;
}

function integerDigits(value: Rational): number {
  const whole = Math.floor(toNumber(abs(value)));
  return whole === 0 ? 0 : String(whole).length;
}

/** Column carries for a + b, or borrows for |a − b|, on terminating decimals. */
export function countCarries(operation: ArithmeticOperation, a: Rational, b: Rational): number | null {
  if (operation !== "addition" && operation !== "subtraction") return null;
  const placesA = terminatingDecimalPlaces(a);
  const placesB = terminatingDecimalPlaces(b);
  if (placesA === null || placesB === null) return null;
  const places = Math.max(placesA, placesB);
  const scale = 10 ** places;
  // Both denominators divide `scale`, so these products are exact integers.
  let x = Math.abs(a.num) * (scale / a.den);
  let y = Math.abs(b.num) * (scale / b.den);
  if (operation === "subtraction" && y > x) [x, y] = [y, x];
  let carry = 0;
  let count = 0;
  while (x > 0 || y > 0) {
    const dx = x % 10;
    const dy = y % 10;
    if (operation === "addition") {
      carry = dx + dy + carry >= 10 ? 1 : 0;
    } else {
      carry = dx - dy - carry < 0 ? 1 : 0;
    }
    count += carry;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return count;
}

function crossCancel(operation: ArithmeticOperation, numberType: NumberType, a: Rational, b: Rational): boolean | null {
  if (numberType !== "fraction") return null;
  if (operation === "multiplication") return gcd(a.num, b.den) > 1 || gcd(b.num, a.den) > 1;
  if (operation === "division") return gcd(a.num, b.num) > 1 || gcd(a.den, b.den) > 1;
  return null;
}

export function buildMeta(
  variant: string,
  operation: ArithmeticOperation,
  numberType: NumberType,
  a: Rational,
  b: Rational,
  answer: Rational,
): QuestionMeta {
  const additive = operation === "addition" || operation === "subtraction";
  return {
    variant,
    integerDigits: [integerDigits(a), integerDigits(b)],
    decimalPlaces: [terminatingDecimalPlaces(a), terminatingDecimalPlaces(b)],
    denominators: [a.den, b.den],
    carries: numberType === "fraction" ? null : countCarries(operation, a, b),
    lcm: numberType === "fraction" && additive ? lcm(a.den, b.den) : null,
    crossCancel: crossCancel(operation, numberType, a, b),
    negativeResult: isNegative(answer),
    integerResult: isInteger(answer),
    resultMagnitude: Math.abs(toNumber(answer)),
  };
}

/**
 * Decimal questions keep following the difficulty tiers even with advanced
 * settings on: an operand range expressed in whole numbers has no sensible
 * meaning for decimal places, and the fraction ranges are their own control.
 */
function generateRaw(rng: Rng, numberType: NumberType, operation: ArithmeticOperation, settings: GeneratorSettings): RawProblem {
  const advanced = activeAdvanced(settings.advanced);
  switch (numberType) {
    case "integer":
      return advanced
        ? generateRangedIntegerProblem(rng, operation, advanced.operandRanges[operation], settings.difficulty, {
            secondRange: operation === "multiplication" ? advanced.multiplicationSecondRange : null,
          })
        : generateIntegerProblem(rng, operation, settings.difficulty);
    case "decimal":
      return generateDecimalProblem(rng, operation, settings.difficulty);
    case "fraction":
      return advanced
        ? generateRangedFractionProblem(rng, operation, advanced.fractionRanges, settings.difficulty)
        : generateFractionProblem(rng, operation, settings.difficulty);
  }
}

/** The finance settings in force: inert advanced settings fall back to the defaults. */
export function financeSettingsOf(settings: Pick<GeneratorSettings, "advanced">): FinanceSettings {
  return activeAdvanced(settings.advanced)?.finance ?? DEFAULT_FINANCE_SETTINGS;
}

/**
 * Assemble a finance question from its description. Prompt, answer, units and
 * explanation all come from `renderFinance`, so the same description always
 * produces the same question — which is what lets a stored attempt be
 * re-explained later.
 */
export function buildFinanceQuestion(id: string, spec: FinanceSpec, difficulty: Difficulty): Question {
  const rendered = renderFinance(spec);
  const [first = rendered.exact, second = rendered.exact] = spec.inputs;
  return {
    id,
    key: rendered.key,
    expression: rendered.expression,
    operation: "finance",
    numberType: rendered.numberType,
    difficulty,
    operands: [first, second],
    answer: rendered.answer,
    answerText: rendered.answerText,
    prompt: rendered.prompt,
    instruction: rendered.instruction ?? undefined,
    unit: rendered.unit,
    answerPlaces: rendered.places,
    tolerance: rendered.tolerance ?? undefined,
    exactAnswer: rendered.exact,
    explanation: rendered.explanation,
    meta: {
      variant: `fin-${spec.subtype}`,
      integerDigits: spec.inputs.map((value) => integerDigits(value)),
      decimalPlaces: spec.inputs.map((value) => terminatingDecimalPlaces(value)),
      denominators: spec.inputs.map((value) => value.den),
      carries: null,
      lcm: null,
      crossCancel: null,
      negativeResult: isNegative(rendered.answer),
      integerResult: isInteger(rendered.answer),
      resultMagnitude: Math.abs(toNumber(rendered.answer)),
      finance: { subtype: spec.subtype, mode: spec.mode, inputs: spec.inputs, places: spec.places, estimate: spec.estimate },
    },
  };
}

export function buildQuestion(
  id: string,
  raw: RawProblem,
  operation: ArithmeticOperation,
  numberType: NumberType,
  difficulty: GeneratorSettings["difficulty"],
): Question {
  const [a, b] = raw.operands;
  const answer = computeAnswer(operation, a, b);
  return {
    id,
    key: questionKey(operation, a, b),
    expression: buildExpression(operation, numberType, a, b),
    operation,
    numberType,
    difficulty,
    operands: [a, b],
    answer,
    answerText: formatOperand(answer, numberType),
    meta: buildMeta(raw.variant, operation, numberType, a, b, answer),
  };
}

const MAX_ATTEMPTS = 64;

/**
 * Generate a question matching the settings, avoiding any key in
 * `recentKeys`. If the pool is too small to dodge the whole window it falls
 * back to only avoiding the immediately preceding question.
 */
export function generateQuestion({ settings, rng, id, recentKeys = [] }: GenerateOptions): Question {
  if (settings.operations.length === 0) throw new Error("at least one operation is required");
  if (settings.numberTypes.length === 0) throw new Error("at least one number type is required");

  const previousKey = recentKeys[recentKeys.length - 1];
  const next = (): Question => {
    const operation = rng.pick(settings.operations);
    // Finance questions are word problems with their own numbers, so the
    // number-format choice does not apply to them.
    if (operation === "finance") {
      const spec = generateFinanceSpec({ rng, settings: financeSettingsOf(settings), difficulty: settings.difficulty });
      return buildFinanceQuestion(id, spec, settings.difficulty);
    }
    const numberType = rng.pick(settings.numberTypes);
    const raw = generateRaw(rng, numberType, operation, settings);
    return buildQuestion(id, raw, operation, numberType, settings.difficulty);
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS * 2; attempt += 1) {
    const question = next();
    const avoid = attempt < MAX_ATTEMPTS ? recentKeys : previousKey === undefined ? [] : [previousKey];
    if (!avoid.includes(question.key)) return question;
  }
  return next();
}
