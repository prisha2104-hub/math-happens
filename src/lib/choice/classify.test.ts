import { describe, expect, it } from "vitest";
import { buildQuestion } from "@/lib/engine/generate";
import type { NumberType, Operation } from "@/lib/engine/types";
import { rational } from "@/lib/math/rational";
import { classifyOpenAnswer } from "./classify";

function q(op: Operation, type: NumberType, a: [number, number], b: [number, number]) {
  return buildQuestion("q", { variant: "test", operands: [rational(...a), rational(...b)] }, op, type, "medium");
}

describe("classifyOpenAnswer", () => {
  it("recognises decimal placement errors", () => {
    const question = q("multiplication", "decimal", [24, 10], [35, 100]); // 0.84
    expect(classifyOpenAnswer(question, rational(84, 10))).toBe("decimal-placement");
    expect(classifyOpenAnswer(question, rational(84, 1000))).toBe("decimal-placement");
    const division = q("division", "decimal", [72, 10], [3, 10]); // 24
    expect(classifyOpenAnswer(division, rational(24, 10))).toBe("decimal-placement");
    expect(classifyOpenAnswer(division, rational(240))).toBe("decimal-placement");
  });

  it("recognises dropped carries and borrows", () => {
    expect(classifyOpenAnswer(q("addition", "integer", [47, 1], [38, 1]), rational(75))).toBe("missed-carry");
    expect(classifyOpenAnswer(q("subtraction", "integer", [72, 1], [38, 1]), rational(46))).toBe("missed-borrow");
    expect(classifyOpenAnswer(q("addition", "decimal", [24, 10], [375, 100]), rational(515, 100))).toBe("missed-carry");
  });

  it("recognises sign and operation mix-ups", () => {
    expect(classifyOpenAnswer(q("subtraction", "integer", [72, 1], [38, 1]), rational(-34))).toBe("sign-error");
    expect(classifyOpenAnswer(q("subtraction", "integer", [72, 1], [38, 1]), rational(110))).toBe("incorrect-operation");
    expect(classifyOpenAnswer(q("multiplication", "integer", [6, 1], [7, 1]), rational(13))).toBe("incorrect-operation");
    expect(classifyOpenAnswer(q("division", "integer", [72, 1], [9, 1]), rational(63))).toBe("incorrect-operation");
  });

  it("recognises fraction-specific mistakes", () => {
    const sum = q("addition", "fraction", [3, 4], [1, 2]); // 5/4
    expect(classifyOpenAnswer(sum, rational(4, 6))).toBe("denominator-error");
    expect(classifyOpenAnswer(sum, rational(4, 8))).toBe("denominator-error");
    expect(classifyOpenAnswer(sum, rational(3, 8))).toBe("incorrect-operation");
    const quotient = q("division", "fraction", [3, 4], [2, 5]); // 15/8
    expect(classifyOpenAnswer(quotient, rational(6, 20))).toBe("reciprocal-error");
    expect(classifyOpenAnswer(quotient, rational(8, 15))).toBe("reciprocal-error");
    const product = q("multiplication", "fraction", [5, 8], [4, 7]); // 5/14
    expect(classifyOpenAnswer(product, rational(35, 32))).toBe("reciprocal-error");
  });

  it("recognises off-by-a-place slips and partial products", () => {
    expect(classifyOpenAnswer(q("division", "integer", [672, 1], [16, 1]), rational(41))).toBe("arithmetic-slip");
    expect(classifyOpenAnswer(q("multiplication", "integer", [47, 1], [68, 1]), rational(47 * 60))).toBe("partial-product");
    expect(classifyOpenAnswer(q("multiplication", "integer", [47, 1], [68, 1]), rational(47 * 70))).toBe("estimation-error");
  });

  it("refuses to invent a diagnosis", () => {
    expect(classifyOpenAnswer(q("division", "integer", [672, 1], [16, 1]), rational(9999))).toBe("unclassified");
    expect(classifyOpenAnswer(q("addition", "fraction", [3, 4], [1, 2]), rational(17, 23))).toBe("unclassified");
    expect(classifyOpenAnswer(q("multiplication", "decimal", [24, 10], [35, 100]), rational(1, 3))).toBe("unclassified");
  });

  it("rejects being asked about a correct answer", () => {
    expect(() => classifyOpenAnswer(q("addition", "integer", [1, 1], [1, 1]), rational(2))).toThrow();
  });
});
