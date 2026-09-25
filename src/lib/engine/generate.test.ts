import { describe, expect, it } from "vitest";
import { rational } from "@/lib/math/rational";
import {
  RECENT_KEY_WINDOW,
  buildQuestion,
  countCarries,
  generateQuestion,
  questionKey,
} from "./generate";
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
import {
  DIFFICULTIES,
  type Difficulty,
  NUMBER_TYPES,
  type NumberType,
  OPERATIONS,
  type Operation,
  type Question,
} from "./types";

const SAMPLE_SIZE = 300;

function sample(operation: Operation, numberType: NumberType, difficulty: Difficulty, count = SAMPLE_SIZE): Question[] {
  const rng = createRng(0xc0ffee + count);
  const questions: Question[] = [];
  const recentKeys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const question = generateQuestion({
      settings: { operations: [operation], numberTypes: [numberType], difficulty },
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

function stripCommas(text: string): string {
  return text.replace(/,/g, "");
}

describe("illustrative problems from the brief", () => {
  const cases: { op: Operation; type: NumberType; a: [number, number]; b: [number, number]; expression: string; answer: string }[] = [
    { op: "division", type: "integer", a: [72, 1], b: [9, 1], expression: "72 ÷ 9", answer: "8" },
    { op: "division", type: "integer", a: [672, 1], b: [16, 1], expression: "672 ÷ 16", answer: "42" },
    { op: "division", type: "integer", a: [2736, 1], b: [24, 1], expression: "2,736 ÷ 24", answer: "114" },
    { op: "addition", type: "decimal", a: [24, 10], b: [375, 100], expression: "2.4 + 3.75", answer: "6.15" },
    { op: "multiplication", type: "decimal", a: [12, 10], b: [35, 100], expression: "1.2 × 0.35", answer: "0.42" },
    { op: "division", type: "decimal", a: [72, 10], b: [3, 10], expression: "7.2 ÷ 0.3", answer: "24" },
    { op: "division", type: "decimal", a: [48, 10], b: [6, 100], expression: "4.8 ÷ 0.06", answer: "80" },
    { op: "addition", type: "fraction", a: [1, 2], b: [1, 4], expression: "1/2 + 1/4", answer: "3/4" },
    { op: "subtraction", type: "fraction", a: [3, 4], b: [1, 6], expression: "3/4 − 1/6", answer: "7/12" },
    { op: "multiplication", type: "fraction", a: [5, 8], b: [4, 7], expression: "5/8 × 4/7", answer: "5/14" },
    { op: "division", type: "fraction", a: [3, 4], b: [2, 5], expression: "3/4 ÷ 2/5", answer: "15/8" },
  ];

  for (const c of cases) {
    it(`${c.expression} = ${c.answer}`, () => {
      const question = buildQuestion(
        "id",
        { variant: "test", operands: [rational(...c.a), rational(...c.b)] },
        c.op,
        c.type,
        "medium",
      );
      expect(question.expression).toBe(c.expression);
      expect(question.answerText).toBe(c.answer);
    });
  }

  it("collapses whole-number fraction results and keeps negatives", () => {
    const whole = buildQuestion("id", { variant: "t", operands: [rational(1, 2), rational(1, 2)] }, "addition", "fraction", "easy");
    expect(whole.answerText).toBe("1");
    expect(whole.meta.integerResult).toBe(true);
    const negative = buildQuestion("id", { variant: "t", operands: [rational(1, 6), rational(3, 4)] }, "subtraction", "fraction", "hard");
    expect(negative.answerText).toBe("-7/12");
    expect(negative.meta.negativeResult).toBe(true);
  });
});

describe("every operation × number type × difficulty", () => {
  for (const numberType of NUMBER_TYPES) {
    for (const operation of OPERATIONS) {
      for (const difficulty of DIFFICULTIES) {
        describe(`${numberType} ${operation} ${difficulty}`, () => {
          const questions = sample(operation, numberType, difficulty);

          it("tags every question correctly", () => {
            for (const q of questions) {
              expect(q.operation).toBe(operation);
              expect(q.numberType).toBe(numberType);
              expect(q.difficulty).toBe(difficulty);
              expect(q.id).toMatch(/^q\d+$/);
              expect(q.meta.variant).toMatch(new RegExp(`^${numberType.slice(0, 3)}(?:c)?-`));
              expect(q.answer.den).toBeGreaterThan(0);
              expect(Number.isSafeInteger(q.answer.num)).toBe(true);
            }
          });

          it("never divides by zero and keeps operands positive", () => {
            for (const q of questions) {
              expect(q.operands[0].num).toBeGreaterThan(0);
              expect(q.operands[1].num).toBeGreaterThan(0);
            }
          });

          it("has answers that match an independent calculation", () => {
            for (const q of questions) {
              const { left, symbol, right } = splitExpression(q.expression);
              expect(SYMBOL_TO_OPERATION[symbol]).toBe(operation);
              const answerText = stripCommas(q.answerText);

              if (numberType === "fraction") {
                const expected = computeFraction(operation, parseFractionString(left), parseFractionString(right));
                expect(answerText, q.expression).toBe(fractionToString(expected));
                continue;
              }

              const a = parseDecimalString(left);
              const b = parseDecimalString(right);
              if (operation === "division") {
                // answer × divisor must reproduce the dividend exactly.
                const product = mulDecimals(parseDecimalString(answerText), b);
                expect(decimalsEqual(product, a), q.expression).toBe(true);
                continue;
              }
              const expected =
                operation === "addition" ? addDecimals(a, b) : operation === "subtraction" ? subDecimals(a, b) : mulDecimals(a, b);
              expect(answerText, q.expression).toBe(scaledToString(expected));
            }
          });

          it("produces display strings in the question's number style", () => {
            for (const q of questions) {
              if (numberType === "integer") {
                expect(q.answerText).toMatch(/^-?[\d,]+$/);
                expect(q.expression).not.toMatch(/[./]/);
              } else if (numberType === "decimal") {
                expect(q.answerText).not.toContain("/");
                expect(q.expression).toContain(".");
              } else {
                expect(q.expression).toMatch(/^\d+\/\d+ [+−×÷] \d+\/\d+$/);
              }
            }
          });

          it("never repeats a question within the recent window", () => {
            for (let i = 0; i < questions.length; i += 1) {
              const window = questions.slice(Math.max(0, i - RECENT_KEY_WINDOW), i).map((q) => q.key);
              expect(window, `${questions[i]?.expression} at ${i}`).not.toContain(questions[i]?.key);
            }
          });
        });
      }
    }
  }
});

describe("integer difficulty constraints", () => {
  const maxOperand = (q: Question) => Math.max(q.operands[0].num, q.operands[1].num);

  it("keeps easy problems within two-digit / times-table territory", () => {
    for (const op of OPERATIONS) {
      for (const q of sample(op, "integer", "easy")) {
        if (op === "division") {
          expect(q.operands[0].num).toBeLessThanOrEqual(144);
          expect(q.operands[1].num).toBeLessThanOrEqual(12);
        } else if (op === "multiplication") {
          expect(q.answer.num).toBeLessThanOrEqual(150);
        } else {
          expect(maxOperand(q)).toBeLessThanOrEqual(99);
          expect(q.operands[0].num).toBeGreaterThanOrEqual(11);
        }
      }
    }
  });

  it("keeps medium problems in the hundreds and hard problems in the thousands", () => {
    for (const op of ["addition", "subtraction"] as const) {
      for (const q of sample(op, "integer", "medium")) {
        expect(maxOperand(q)).toBeGreaterThanOrEqual(100);
        expect(maxOperand(q)).toBeLessThanOrEqual(999);
      }
      for (const q of sample(op, "integer", "hard")) {
        expect(maxOperand(q)).toBeGreaterThanOrEqual(1000);
        expect(maxOperand(q)).toBeLessThanOrEqual(9999);
      }
    }
    for (const q of sample("division", "integer", "medium")) {
      expect(q.operands[1].num).toBeGreaterThanOrEqual(3);
      expect(q.operands[1].num).toBeLessThanOrEqual(25);
      expect(q.operands[1].num % 10).not.toBe(0);
      expect(q.answer.num).toBeGreaterThanOrEqual(12);
      expect(q.answer.num).toBeLessThanOrEqual(60);
    }
    for (const q of sample("division", "integer", "hard")) {
      expect(q.operands[0].num).toBeGreaterThanOrEqual(300);
      expect(q.operands[1].num % 10).not.toBe(0);
    }
  });

  it("makes division exact at every difficulty", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const q of sample("division", "integer", difficulty)) {
        expect(q.answer.den).toBe(1);
        expect(q.operands[0].num % q.operands[1].num).toBe(0);
      }
    }
  });

  it("only allows negative results for hard subtraction", () => {
    for (const difficulty of ["easy", "medium"] as const) {
      for (const q of sample("subtraction", "integer", difficulty)) {
        expect(q.answer.num).toBeGreaterThan(0);
      }
    }
    const hard = sample("subtraction", "integer", "hard", 400);
    expect(hard.some((q) => q.answer.num < 0)).toBe(true);
    expect(hard.some((q) => q.answer.num > 0)).toBe(true);
    for (const q of hard) expect(q.answer.num).not.toBe(0);
  });

  it("grows in size with difficulty", () => {
    const mean = (qs: Question[]) => qs.reduce((sum, q) => sum + maxOperand(q), 0) / qs.length;
    for (const op of OPERATIONS) {
      const easy = mean(sample(op, "integer", "easy"));
      const medium = mean(sample(op, "integer", "medium"));
      const hard = mean(sample(op, "integer", "hard"));
      expect(easy).toBeLessThan(medium);
      expect(medium).toBeLessThan(hard);
    }
  });
});

describe("decimal difficulty constraints", () => {
  const places = (text: string) => (text.includes(".") ? text.split(".")[1]?.length ?? 0 : 0);

  it("uses at most two decimal places per operand and terminating answers", () => {
    for (const op of OPERATIONS) {
      for (const difficulty of DIFFICULTIES) {
        for (const q of sample(op, "decimal", difficulty)) {
          const { left, right } = splitExpression(q.expression);
          const maxPlaces = op === "division" ? 3 : 2;
          expect(places(left), q.expression).toBeLessThanOrEqual(maxPlaces);
          expect(places(right), q.expression).toBeLessThanOrEqual(2);
          expect(places(stripCommas(q.answerText)), q.expression).toBeLessThanOrEqual(3);
          expect(q.meta.decimalPlaces.every((p) => p !== null)).toBe(true);
        }
      }
    }
  });

  it("keeps easy problems to tenths and small magnitudes", () => {
    for (const q of sample("addition", "decimal", "easy")) {
      const { left, right } = splitExpression(q.expression);
      expect(places(left)).toBe(1);
      expect(places(right)).toBe(1);
      expect(q.answer.num / q.answer.den).toBeLessThan(20);
    }
    for (const q of sample("division", "decimal", "easy")) {
      expect(q.answer.num / q.answer.den).toBeLessThanOrEqual(30);
    }
  });

  it("only allows negative results for hard subtraction", () => {
    for (const difficulty of ["easy", "medium"] as const) {
      for (const q of sample("subtraction", "decimal", difficulty)) expect(q.answer.num).toBeGreaterThan(0);
    }
    const hard = sample("subtraction", "decimal", "hard", 400);
    expect(hard.some((q) => q.answer.num < 0)).toBe(true);
    for (const q of hard) expect(q.answer.num).not.toBe(0);
  });

  it("always includes at least one non-integer operand", () => {
    for (const op of OPERATIONS) {
      for (const difficulty of DIFFICULTIES) {
        for (const q of sample(op, "decimal", difficulty)) {
          expect(q.operands.some((o) => o.den !== 1), q.expression).toBe(true);
        }
      }
    }
  });
});

describe("fraction difficulty constraints", () => {
  it("uses proper fractions in lowest terms", () => {
    for (const op of OPERATIONS) {
      for (const difficulty of DIFFICULTIES) {
        for (const q of sample(op, "fraction", difficulty)) {
          for (const operand of q.operands) {
            expect(operand.num).toBeGreaterThan(0);
            expect(operand.num).toBeLessThan(operand.den);
            const { num, den } = rational(operand.num, operand.den);
            expect([num, den]).toEqual([operand.num, operand.den]);
          }
        }
      }
    }
  });

  it("constrains common denominators for addition and subtraction", () => {
    const limits: Record<Difficulty, [number, number]> = { easy: [2, 12], medium: [6, 24], hard: [24, 90] };
    for (const op of ["addition", "subtraction"] as const) {
      for (const difficulty of DIFFICULTIES) {
        const [min, max] = limits[difficulty];
        for (const q of sample(op, "fraction", difficulty)) {
          expect(q.meta.lcm, q.expression).not.toBeNull();
          expect(q.meta.lcm as number).toBeGreaterThanOrEqual(min);
          expect(q.meta.lcm as number).toBeLessThanOrEqual(max);
          if (difficulty === "easy") {
            const [d1, d2] = q.meta.denominators as [number, number];
            expect(Math.max(d1, d2) % Math.min(d1, d2)).toBe(0);
          }
        }
      }
    }
  });

  it("constrains denominators for multiplication and division", () => {
    const limits: Record<Difficulty, number> = { easy: 6, medium: 9, hard: 12 };
    for (const op of ["multiplication", "division"] as const) {
      for (const difficulty of DIFFICULTIES) {
        for (const q of sample(op, "fraction", difficulty)) {
          for (const den of q.meta.denominators) expect(den).toBeLessThanOrEqual(limits[difficulty]);
          expect(q.meta.crossCancel).not.toBeNull();
        }
      }
    }
  });

  it("only allows negative results for hard subtraction and never x ÷ x", () => {
    for (const difficulty of ["easy", "medium"] as const) {
      for (const q of sample("subtraction", "fraction", difficulty)) expect(q.answer.num).toBeGreaterThan(0);
    }
    const hard = sample("subtraction", "fraction", "hard", 400);
    expect(hard.some((q) => q.answer.num < 0)).toBe(true);
    for (const q of hard) expect(q.answer.num).not.toBe(0);
    for (const q of sample("division", "fraction", "easy")) expect(q.answerText).not.toBe("1");
  });
});

describe("mixed settings", () => {
  it("covers every selected operation and number type", () => {
    const rng = createRng(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1200; i += 1) {
      const q = generateQuestion({
        settings: { operations: OPERATIONS, numberTypes: NUMBER_TYPES, difficulty: "medium" },
        rng,
        id: `q${i}`,
      });
      counts[q.operation] = (counts[q.operation] ?? 0) + 1;
      counts[q.numberType] = (counts[q.numberType] ?? 0) + 1;
    }
    for (const op of OPERATIONS) expect(counts[op]).toBeGreaterThan(1200 * 0.15);
    for (const type of NUMBER_TYPES) expect(counts[type]).toBeGreaterThan(1200 * 0.2);
  });

  it("respects a restricted selection", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const q = generateQuestion({
        settings: { operations: ["division"], numberTypes: ["fraction"], difficulty: "hard" },
        rng,
        id: `q${i}`,
      });
      expect(q.operation).toBe("division");
      expect(q.numberType).toBe("fraction");
    }
  });

  it("rejects empty selections", () => {
    const rng = createRng(1);
    expect(() => generateQuestion({ settings: { operations: [], numberTypes: ["integer"], difficulty: "easy" }, rng, id: "x" })).toThrow();
    expect(() => generateQuestion({ settings: { operations: ["addition"], numberTypes: [], difficulty: "easy" }, rng, id: "x" })).toThrow();
  });

  it("is deterministic for a given seed", () => {
    const make = () => {
      const rng = createRng(2024);
      return Array.from({ length: 20 }, (_, i) =>
        generateQuestion({ settings: { operations: OPERATIONS, numberTypes: NUMBER_TYPES, difficulty: "hard" }, rng, id: `q${i}` }).expression,
      );
    };
    expect(make()).toEqual(make());
  });

  it("avoids the previous question even with a tiny pool", () => {
    const rng = createRng(99);
    let previous: string | null = null;
    for (let i = 0; i < 500; i += 1) {
      const q = generateQuestion({
        settings: { operations: ["multiplication"], numberTypes: ["integer"], difficulty: "easy" },
        rng,
        id: `q${i}`,
        recentKeys: previous ? [previous] : [],
      });
      expect(q.key).not.toBe(previous);
      previous = q.key;
    }
  });
});

describe("question keys and metadata", () => {
  it("treats commuted operands as the same question only for commutative operations", () => {
    const a = rational(3, 1);
    const b = rational(7, 1);
    expect(questionKey("addition", a, b)).toBe(questionKey("addition", b, a));
    expect(questionKey("multiplication", a, b)).toBe(questionKey("multiplication", b, a));
    expect(questionKey("subtraction", a, b)).not.toBe(questionKey("subtraction", b, a));
    expect(questionKey("division", a, b)).not.toBe(questionKey("division", b, a));
  });

  it("counts carries and borrows", () => {
    expect(countCarries("addition", rational(47), rational(38))).toBe(1);
    expect(countCarries("addition", rational(999), rational(1))).toBe(3);
    expect(countCarries("addition", rational(12), rational(34))).toBe(0);
    expect(countCarries("addition", rational(24, 10), rational(375, 100))).toBe(1);
    expect(countCarries("subtraction", rational(72), rational(38))).toBe(1);
    expect(countCarries("subtraction", rational(38), rational(72))).toBe(1);
    expect(countCarries("subtraction", rational(1000), rational(1))).toBe(3);
    expect(countCarries("multiplication", rational(7), rational(8))).toBeNull();
    expect(countCarries("addition", rational(1, 3), rational(1, 2))).toBeNull();
  });

  it("captures structural features for later analysis", () => {
    const mulQ = buildQuestion("id", { variant: "t", operands: [rational(5, 8), rational(4, 7)] }, "multiplication", "fraction", "medium");
    expect(mulQ.meta.crossCancel).toBe(true);
    expect(mulQ.meta.lcm).toBeNull();
    expect(mulQ.meta.decimalPlaces).toEqual([3, null]);

    const divQ = buildQuestion("id", { variant: "t", operands: [rational(3, 4), rational(2, 5)] }, "division", "fraction", "medium");
    expect(divQ.meta.crossCancel).toBe(false);
    expect(divQ.meta.integerResult).toBe(false);
    expect(divQ.meta.resultMagnitude).toBeCloseTo(1.875);

    const subQ = buildQuestion("id", { variant: "t", operands: [rational(3, 4), rational(1, 6)] }, "subtraction", "fraction", "medium");
    expect(subQ.meta.lcm).toBe(12);
    expect(subQ.meta.carries).toBeNull();

    const intQ = buildQuestion("id", { variant: "t", operands: [rational(2736), rational(24)] }, "division", "integer", "hard");
    expect(intQ.meta.integerDigits).toEqual([4, 2]);
    expect(intQ.meta.denominators).toEqual([1, 1]);
    expect(intQ.meta.integerResult).toBe(true);
    expect(intQ.meta.negativeResult).toBe(false);

    const decQ = buildQuestion("id", { variant: "t", operands: [rational(35, 100), rational(12, 10)] }, "multiplication", "decimal", "medium");
    expect(decQ.meta.integerDigits).toEqual([0, 1]);
    expect(decQ.meta.decimalPlaces).toEqual([2, 1]);
  });
});
