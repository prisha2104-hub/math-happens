import { describe, expect, it } from "vitest";
import { buildQuestion } from "@/lib/engine/generate";
import type { ArithmeticOperation, NumberType } from "@/lib/engine/types";
import { rational } from "@/lib/math/rational";
import { evaluateAnswer, isCorrectAnswer } from "./validate";

function question(op: ArithmeticOperation, type: NumberType, a: [number, number], b: [number, number]) {
  return buildQuestion("q", { variant: "test", operands: [rational(...a), rational(...b)] }, op, type, "medium");
}

const half = question("addition", "fraction", [1, 4], [1, 4]); // 1/2
const eighty = question("division", "decimal", [48, 10], [6, 100]); // 80
const sixFifteen = question("addition", "decimal", [24, 10], [375, 100]); // 6.15
const two = question("division", "fraction", [1, 2], [1, 4]); // 2
const negative = question("subtraction", "fraction", [1, 6], [3, 4]); // -7/12
const quotient = question("division", "integer", [2736, 1], [24, 1]); // 114

describe("isCorrectAnswer", () => {
  it("accepts any mathematically equivalent form", () => {
    for (const raw of ["1/2", "2/4", "0.5", ".5", "0.50", "50/100", "+1/2", "0 1/2"]) {
      const result = evaluateAnswer(half, raw);
      expect(result.verdict, raw).toBe("correct");
    }
  });

  it("accepts whole-number answers to fraction questions in any form", () => {
    for (const raw of ["2", "2.0", "4/2", "2/1", "6/3"]) expect(evaluateAnswer(two, raw).verdict, raw).toBe("correct");
  });

  it("accepts integer answers to decimal questions and vice versa", () => {
    for (const raw of ["80", "80.0", "80.00", "160/2"]) expect(evaluateAnswer(eighty, raw).verdict, raw).toBe("correct");
    for (const raw of ["6.15", "6.150", "123/20", "6 3/20"]) expect(evaluateAnswer(sixFifteen, raw).verdict, raw).toBe("correct");
    for (const raw of ["114", "114.0", "228/2"]) expect(evaluateAnswer(quotient, raw).verdict, raw).toBe("correct");
    expect(evaluateAnswer(quotient, "1,14").verdict).toBe("invalid");
  });

  it("handles negative answers", () => {
    for (const raw of ["-7/12", "−7/12", "-14/24"]) expect(evaluateAnswer(negative, raw).verdict, raw).toBe("correct");
    expect(evaluateAnswer(negative, "7/12").verdict).toBe("incorrect");
  });

  it("marks wrong values as incorrect and keeps the parsed value", () => {
    const result = evaluateAnswer(half, "0.51");
    expect(result.verdict).toBe("incorrect");
    if (result.verdict === "incorrect") expect(result.value).toEqual({ num: 51, den: 100 });
    expect(evaluateAnswer(eighty, "8").verdict).toBe("incorrect");
    expect(evaluateAnswer(eighty, "800").verdict).toBe("incorrect");
    expect(evaluateAnswer(sixFifteen, "6.5").verdict).toBe("incorrect");
    expect(evaluateAnswer(quotient, "-114").verdict).toBe("incorrect");
  });

  it("does not rely on floating point tolerance", () => {
    // 0.1 + 0.2 in binary floating point is 0.30000000000000004; here it is exactly 3/10.
    const tenthPlusFifth = question("addition", "decimal", [1, 10], [2, 10]);
    expect(evaluateAnswer(tenthPlusFifth, "0.3").verdict).toBe("correct");
    expect(evaluateAnswer(tenthPlusFifth, "0.30000000000000004").verdict).toBe("invalid");
    expect(evaluateAnswer(tenthPlusFifth, "0.3000001").verdict).toBe("incorrect");
    expect(isCorrectAnswer(tenthPlusFifth, rational(3, 10))).toBe(true);
    expect(isCorrectAnswer(tenthPlusFifth, rational(3000001, 10000000))).toBe(false);
  });

  it("reports invalid input without judging it", () => {
    const result = evaluateAnswer(half, "one half");
    expect(result.verdict).toBe("invalid");
    if (result.verdict === "invalid") {
      expect(result.error).toBe("invalid");
      expect(result.message.length).toBeGreaterThan(0);
    }
    expect(evaluateAnswer(half, "").verdict).toBe("invalid");
    expect(evaluateAnswer(half, "1/0").verdict).toBe("invalid");
  });
});
