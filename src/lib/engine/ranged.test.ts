import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "@/lib/answer/validate";
import { toMixed } from "@/lib/math/rational";
import { type AdvancedSettings, DEFAULT_ADVANCED_SETTINGS, type NumericRange } from "./advanced";
import { RECENT_KEY_WINDOW, generateQuestion } from "./generate";
import { createRng } from "./rng";
import {
  SYMBOL_TO_OPERATION,
  addDecimals,
  computeFraction,
  decimalsEqual,
  fractionToString,
  mulDecimals,
  parseDecimalString,
  parseFractionString,
  scaledToString,
  splitExpression,
  subDecimals,
} from "./testing/independent-arithmetic";
import { ARITHMETIC_OPERATIONS, type ArithmeticOperation, DIFFICULTIES, type Difficulty, NUMBER_TYPES, type NumberType, type Operation, type Question } from "./types";

const SAMPLE_SIZE = 250;

function advanced(overrides: Partial<AdvancedSettings> = {}): AdvancedSettings {
  return { ...DEFAULT_ADVANCED_SETTINGS, enabled: true, ...overrides };
}

function withRange(operation: Operation, range: NumericRange): AdvancedSettings {
  return advanced({ operandRanges: { ...DEFAULT_ADVANCED_SETTINGS.operandRanges, [operation]: range } });
}

/** Questions for one operation × format, generated through the real entry point. */
function sample(
  operation: Operation,
  numberType: NumberType,
  settings: AdvancedSettings,
  difficulty: Difficulty = "medium",
  count = SAMPLE_SIZE,
): Question[] {
  const rng = createRng(0x5eed + count);
  const questions: Question[] = [];
  const recentKeys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const question = generateQuestion({
      settings: { operations: [operation], numberTypes: [numberType], difficulty, advanced: settings },
      rng,
      id: `q${i}`,
      recentKeys,
    });
    questions.push(question);
    recentKeys.push(question.key);
    if (recentKeys.length > RECENT_KEY_WINDOW) recentKeys.shift();
  }
  return questions;
}

describe("advanced settings stay inert while off", () => {
  it("produces the same questions as having no advanced settings at all", () => {
    const expressions = (settings: AdvancedSettings | null) => {
      const rng = createRng(4242);
      return Array.from(
        { length: 40 },
        (_, i) =>
          generateQuestion({
            settings: { operations: [...ARITHMETIC_OPERATIONS], numberTypes: [...NUMBER_TYPES], difficulty: "medium", advanced: settings },
            rng,
            id: `q${i}`,
          }).expression,
      );
    };
    // Defaults are off, so they must not change a single question.
    expect(expressions(DEFAULT_ADVANCED_SETTINGS)).toEqual(expressions(null));
    expect(expressions({ ...DEFAULT_ADVANCED_SETTINGS, enabled: false })).toEqual(expressions(null));
  });
});

describe("integer operand ranges", () => {
  const range = { min: 10, max: 1000 };

  it("keeps both operands inside the range for every operation", () => {
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "integer", withRange(operation, range))) {
        const [a, b] = question.operands;
        expect(Math.abs(a.num), question.expression).toBeGreaterThanOrEqual(range.min);
        expect(Math.abs(a.num), question.expression).toBeLessThanOrEqual(range.max);
        expect(Math.abs(b.num), question.expression).toBeGreaterThanOrEqual(range.min);
        expect(Math.abs(b.num), question.expression).toBeLessThanOrEqual(range.max);
        expect(a.den).toBe(1);
        expect(b.den).toBe(1);
      }
    }
  });

  it("honours a different range per operation in one session", () => {
    const settings = advanced({
      operandRanges: {
        addition: { min: 10, max: 99 },
        subtraction: { min: 100, max: 999 },
        multiplication: { min: 2, max: 12 },
        division: { min: 20, max: 400 },
      },
    });
    const limits: Record<ArithmeticOperation, NumericRange> = settings.operandRanges;
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "integer", settings)) {
        for (const operand of question.operands) {
          expect(Math.abs(operand.num), `${operation} ${question.expression}`).toBeGreaterThanOrEqual(limits[operation].min);
          expect(Math.abs(operand.num), `${operation} ${question.expression}`).toBeLessThanOrEqual(limits[operation].max);
        }
      }
    }
  });

  it("keeps division exact with both operands in range and a quotient above one", () => {
    for (const bounds of [
      { min: 2, max: 999 },
      { min: 10, max: 1000 },
      { min: 50, max: 100 },
    ]) {
      for (const question of sample("division", "integer", withRange("division", bounds))) {
        const [dividend, divisor] = question.operands;
        expect(question.answer.den, question.expression).toBe(1);
        expect(dividend.num % divisor.num, question.expression).toBe(0);
        expect(question.answer.num, question.expression).toBeGreaterThanOrEqual(2);
        expect(dividend.num).toBeLessThanOrEqual(bounds.max);
        expect(divisor.num).toBeGreaterThanOrEqual(bounds.min);
      }
    }
  });

  it("still only allows negative results on hard subtraction", () => {
    const settings = withRange("subtraction", { min: 10, max: 1000 });
    for (const difficulty of ["easy", "medium"] as const) {
      for (const question of sample("subtraction", "integer", settings, difficulty)) {
        expect(question.answer.num, question.expression).toBeGreaterThanOrEqual(0);
      }
    }
    const hard = sample("subtraction", "integer", settings, "hard", 400);
    expect(hard.some((question) => question.answer.num < 0)).toBe(true);
  });

  it("verifies every answer against independent BigInt arithmetic", () => {
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "integer", withRange(operation, { min: 12, max: 5000 }))) {
        const { left, symbol, right } = splitExpression(question.expression);
        expect(SYMBOL_TO_OPERATION[symbol]).toBe(operation);
        const a = parseDecimalString(left);
        const b = parseDecimalString(right);
        const answerText = question.answerText.replace(/,/g, "");
        if (operation === "division") {
          expect(decimalsEqual(mulDecimals(parseDecimalString(answerText), b), a), question.expression).toBe(true);
          continue;
        }
        const expected = operation === "addition" ? addDecimals(a, b) : operation === "subtraction" ? subDecimals(a, b) : mulDecimals(a, b);
        expect(answerText, question.expression).toBe(scaledToString(expected));
      }
    }
  });

  it("survives degenerate ranges without hanging or throwing", () => {
    for (const bounds of [
      { min: 7, max: 7 },
      { min: 1, max: 1 },
      { min: 900, max: 2 },
      { min: 500, max: 600 },
      { min: 1_000_000, max: 1_000_000 },
    ]) {
      for (const operation of ARITHMETIC_OPERATIONS) {
        const questions = sample(operation, "integer", withRange(operation, bounds), "medium", 30);
        expect(questions).toHaveLength(30);
        for (const question of questions) {
          expect(Number.isSafeInteger(question.answer.num), question.expression).toBe(true);
          expect(question.operands[1].num, question.expression).not.toBe(0);
        }
      }
    }
  });
});

describe("fraction ranges", () => {
  const ranges = { numerator: { min: 1, max: 9 }, denominator: { min: 2, max: 12 } };

  it("keeps numerators and denominators inside the configured ranges", () => {
    const settings = advanced({ fractionRanges: ranges });
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "fraction", settings)) {
        for (const operand of question.operands) {
          expect(Math.abs(operand.num), question.expression).toBeGreaterThanOrEqual(ranges.numerator.min);
          expect(Math.abs(operand.num), question.expression).toBeLessThanOrEqual(ranges.numerator.max);
          expect(operand.den, question.expression).toBeGreaterThanOrEqual(ranges.denominator.min);
          expect(operand.den, question.expression).toBeLessThanOrEqual(ranges.denominator.max);
        }
      }
    }
  });

  it("never produces a zero denominator, even when the range asks for one", () => {
    const settings = advanced({ fractionRanges: { numerator: { min: 1, max: 5 }, denominator: { min: 0, max: 0 } } });
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "fraction", settings, "medium", 40)) {
        for (const operand of question.operands) expect(operand.den, question.expression).toBeGreaterThan(0);
        expect(question.answer.den).toBeGreaterThan(0);
      }
    }
  });

  it("allows improper fractions when the numerator range reaches past the denominator", () => {
    const settings = advanced({ fractionRanges: { numerator: { min: 5, max: 20 }, denominator: { min: 2, max: 4 } } });
    const questions = sample("addition", "fraction", settings, "medium", 200);
    expect(questions.some((question) => question.operands.some((operand) => operand.num > operand.den))).toBe(true);
    for (const question of questions) {
      for (const operand of question.operands) {
        expect(operand.num, question.expression).toBeGreaterThanOrEqual(5);
        expect(operand.num, question.expression).toBeLessThanOrEqual(20);
      }
    }
  });

  it("verifies every fraction answer against independent BigInt arithmetic", () => {
    const settings = advanced({ fractionRanges: { numerator: { min: 1, max: 15 }, denominator: { min: 2, max: 16 } } });
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "fraction", settings)) {
        const { left, symbol, right } = splitExpression(question.expression);
        expect(SYMBOL_TO_OPERATION[symbol]).toBe(operation);
        const expected = computeFraction(operation, parseFractionString(left), parseFractionString(right));
        expect(question.answerText, question.expression).toBe(fractionToString(expected));
      }
    }
  });

  it("never divides by zero and never asks x ÷ x", () => {
    const settings = advanced({ fractionRanges: { numerator: { min: 1, max: 6 }, denominator: { min: 2, max: 9 } } });
    for (const question of sample("division", "fraction", settings, "medium", 300)) {
      expect(question.operands[1].num, question.expression).not.toBe(0);
      expect(question.answerText, question.expression).not.toBe("1");
    }
  });

  it("accepts every equivalent written form of a fraction answer", () => {
    const settings = advanced({ fractionRanges: { numerator: { min: 1, max: 11 }, denominator: { min: 2, max: 9 } } });
    for (const operation of ARITHMETIC_OPERATIONS) {
      for (const question of sample(operation, "fraction", settings, "medium", 60)) {
        // The canonical answer the app would show.
        expect(evaluateAnswer(question, question.answerText).verdict, question.expression).toBe("correct");
        // The same value scaled up, which must still be accepted exactly.
        const scaled = `${question.answer.num * 3}/${question.answer.den * 3}`;
        expect(evaluateAnswer(question, scaled).verdict, `${question.expression} as ${scaled}`).toBe("correct");
        // A mixed number for any improper positive answer.
        const { whole, num, den } = toMixed(question.answer);
        if (whole > 0 && num > 0) {
          expect(evaluateAnswer(question, `${whole} ${num}/${den}`).verdict, `${question.expression} as mixed`).toBe("correct");
        }
        // And a wrong value must be rejected.
        const wrong = `${question.answer.num + 1}/${question.answer.den}`;
        expect(evaluateAnswer(question, wrong).verdict, `${question.expression} as ${wrong}`).toBe("incorrect");
      }
    }
  });
});

describe("decimals keep following the difficulty tiers", () => {
  it("is unaffected by operand ranges", () => {
    const settings = withRange("addition", { min: 500, max: 900 });
    for (const difficulty of DIFFICULTIES) {
      for (const question of sample("addition", "decimal", settings, difficulty, 60)) {
        expect(question.expression).toContain(".");
        expect(question.meta.decimalPlaces.every((places) => places !== null)).toBe(true);
      }
    }
  });
});
