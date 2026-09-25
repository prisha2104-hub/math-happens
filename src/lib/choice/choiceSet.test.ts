import { describe, expect, it } from "vitest";
import { buildQuestion, generateQuestion } from "@/lib/engine/generate";
import { createRng } from "@/lib/engine/rng";
import { DIFFICULTIES, NUMBER_TYPES, OPERATIONS, type Question } from "@/lib/engine/types";
import { equals, rational, terminatingDecimalPlaces } from "@/lib/math/rational";
import { parseFractionString, parseDecimalString, decimalsEqual } from "@/lib/engine/testing/independent-arithmetic";
import { CHOICE_COUNT, buildChoiceSet, choiceValue, isCorrectChoice, keyToChoiceIndex, selectDistractors } from "./choiceSet";
import { addWithoutCarry, distractorCandidates, isSensibleDistractor, subWithoutBorrow } from "./distractors";
import { ERROR_TAGS } from "./types";

function fixed(op: Question["operation"], type: Question["numberType"], a: [number, number], b: [number, number]): Question {
  return buildQuestion("q", { variant: "test", operands: [rational(...a), rational(...b)] }, op, type, "medium");
}

describe("digit helpers", () => {
  it("drops carries and borrows column by column", () => {
    expect(addWithoutCarry(47, 38)).toBe(75);
    expect(addWithoutCarry(999, 1)).toBe(990);
    expect(addWithoutCarry(12, 34)).toBe(46);
    expect(subWithoutBorrow(72, 38)).toBe(46);
    expect(subWithoutBorrow(1000, 1)).toBe(1001);
    expect(subWithoutBorrow(85, 23)).toBe(62);
  });
});

describe("illustrative distractor sets", () => {
  it("decimal multiplication offers placement and slip errors (2.4 × 0.35)", () => {
    const q = fixed("multiplication", "decimal", [24, 10], [35, 100]);
    const values = distractorCandidates(q).filter((d) => isSensibleDistractor(q, d));
    const texts = values.map((d) => `${d.tag}:${d.value.num}/${d.value.den}`);
    expect(texts).toContain("decimal-placement:42/5"); // 8.4
    expect(texts).toContain("decimal-placement:21/250"); // 0.084
    expect(texts).toContain("arithmetic-slip:37/50"); // 0.74
  });

  it("decimal division offers 2.4, 240 and 21 for 7.2 ÷ 0.3", () => {
    const q = fixed("division", "decimal", [72, 10], [3, 10]);
    const values = distractorCandidates(q).filter((d) => isSensibleDistractor(q, d));
    const keys = values.map((d) => `${d.tag}:${d.value.num}/${d.value.den}`);
    expect(keys).toContain("decimal-placement:12/5");
    expect(keys).toContain("decimal-placement:240/1");
    expect(keys).toContain("arithmetic-slip:21/1");
  });

  it("integer division offers 41, 44 and 48 for 672 ÷ 16", () => {
    const q = fixed("division", "integer", [672, 1], [16, 1]);
    const values = distractorCandidates(q).filter((d) => isSensibleDistractor(q, d));
    const nums = values.map((d) => d.value.num);
    expect(nums).toContain(41);
    expect(nums).toContain(44);
    expect(nums).toContain(48); // 672 ÷ 14, an estimation error
    expect(values.find((d) => d.value.num === 48)?.tag).toBe("estimation-error");
  });

  it("fraction addition offers 4/6→2/3, 4/8→1/2 and 3/8 for 3/4 + 1/2", () => {
    const q = fixed("addition", "fraction", [3, 4], [1, 2]);
    const values = distractorCandidates(q).filter((d) => isSensibleDistractor(q, d));
    const keys = values.map((d) => `${d.tag}:${d.value.num}/${d.value.den}`);
    expect(keys).toContain("denominator-error:2/3");
    expect(keys).toContain("denominator-error:1/2");
    expect(keys).toContain("incorrect-operation:3/8");
  });

  it("fraction division flags multiplying without inverting as a reciprocal error", () => {
    const q = fixed("division", "fraction", [3, 4], [2, 5]);
    const values = distractorCandidates(q).filter((d) => isSensibleDistractor(q, d));
    expect(values.some((d) => d.tag === "reciprocal-error" && equals(d.value, rational(3, 10)))).toBe(true);
    expect(values.some((d) => d.tag === "reciprocal-error" && equals(d.value, rational(8, 15)))).toBe(true);
  });

  it("integer addition with carries offers the carry-less sum", () => {
    const q = fixed("addition", "integer", [47, 1], [38, 1]);
    expect(distractorCandidates(q).some((d) => d.tag === "missed-carry" && d.value.num === 75)).toBe(true);
    const sub = fixed("subtraction", "integer", [72, 1], [38, 1]);
    expect(distractorCandidates(sub).some((d) => d.tag === "missed-borrow" && d.value.num === 46)).toBe(true);
  });
});

describe("buildChoiceSet across every combination", () => {
  for (const numberType of NUMBER_TYPES) {
    for (const operation of OPERATIONS) {
      for (const difficulty of DIFFICULTIES) {
        it(`${numberType} ${operation} ${difficulty}: four exact, distinct, sensible options`, () => {
          const rng = createRng(0xabc123);
          for (let i = 0; i < 150; i += 1) {
            const question = generateQuestion({ settings: { operations: [operation], numberTypes: [numberType], difficulty }, rng, id: `q${i}` });
            const set = buildChoiceSet(question, rng);
            const label = `${question.expression} → ${set.options.map((o) => o.text).join(" | ")}`;

            expect(set.options, label).toHaveLength(CHOICE_COUNT);
            // Exactly one option equals the answer, and it is the one at correctIndex.
            const correctOnes = set.options.filter((o) => equals(o.value, question.answer));
            expect(correctOnes, label).toHaveLength(1);
            expect(set.options[set.correctIndex]?.tag, label).toBeNull();
            expect(equals(choiceValue(set, set.correctIndex) as never, question.answer), label).toBe(true);
            expect(isCorrectChoice(set, set.correctIndex)).toBe(true);
            expect(set.options[set.correctIndex]?.text, label).toBe(question.answerText);

            // Pairwise distinct as exact values and as displayed text.
            for (let x = 0; x < set.options.length; x += 1) {
              for (let y = x + 1; y < set.options.length; y += 1) {
                expect(equals(set.options[x]!.value, set.options[y]!.value), label).toBe(false);
                expect(set.options[x]!.text, label).not.toBe(set.options[y]!.text);
              }
            }

            // Distractors carry tags and stay in the question's number style.
            for (const option of set.options) {
              if (option.tag !== null) expect(ERROR_TAGS).toContain(option.tag);
              if (numberType === "integer") expect(option.value.den, label).toBe(1);
              if (numberType === "decimal") {
                const places = terminatingDecimalPlaces(option.value);
                expect(places, label).not.toBeNull();
                expect(places as number, label).toBeLessThanOrEqual(4);
                expect(option.text, label).not.toContain("/");
              }
              if (numberType === "fraction") {
                // Displayed in lowest terms; re-parsing the text yields the same value.
                const parsed = parseFractionString(option.text);
                expect(Number(parsed.num), label).toBe(option.value.num);
                expect(Number(parsed.den), label).toBe(option.value.den);
              } else {
                expect(decimalsEqual(parseDecimalString(option.text), { mantissa: BigInt(option.value.num) * (10n ** BigInt(terminatingDecimalPlaces(option.value) ?? 0)) / BigInt(option.value.den), places: terminatingDecimalPlaces(option.value) ?? 0 }), label).toBe(true);
              }
            }
          }
        });
      }
    }
  }

  it("places the correct answer uniformly across the four positions", () => {
    const rng = createRng(2026);
    const counts = [0, 0, 0, 0];
    const runs = 4000;
    for (let i = 0; i < runs; i += 1) {
      const question = generateQuestion({ settings: { operations: OPERATIONS, numberTypes: NUMBER_TYPES, difficulty: "medium" }, rng, id: `q${i}` });
      const index = buildChoiceSet(question, rng).correctIndex;
      counts[index] = (counts[index] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count / runs).toBeGreaterThan(0.21);
      expect(count / runs).toBeLessThan(0.29);
    }
  });

  it("prefers distinct mistake families when they exist", () => {
    const q = fixed("multiplication", "decimal", [24, 10], [35, 100]);
    const tags = selectDistractors(q, createRng(1)).map((d) => d.tag);
    expect(new Set(tags).size).toBe(3);
    expect(tags).toContain("decimal-placement");
  });

  it("falls back to distinct near-misses when strategies run dry", () => {
    // 1/2 × 1/2 = 1/4: few realistic candidates, but the set must still be full and distinct.
    const q = fixed("multiplication", "fraction", [1, 2], [1, 2]);
    const set = buildChoiceSet(q, createRng(3));
    expect(set.options).toHaveLength(4);
    expect(new Set(set.options.map((o) => o.text)).size).toBe(4);
    for (const o of set.options) expect(o.value.num).toBeGreaterThan(0);
  });

  it("never shows equivalent fractions as different options", () => {
    const rng = createRng(77);
    for (let i = 0; i < 500; i += 1) {
      const question = generateQuestion({ settings: { operations: OPERATIONS, numberTypes: ["fraction"], difficulty: "hard" }, rng, id: `q${i}` });
      const set = buildChoiceSet(question, rng);
      const reduced = set.options.map((o) => `${rational(o.value.num, o.value.den).num}/${rational(o.value.num, o.value.den).den}`);
      expect(new Set(reduced).size).toBe(4);
    }
  });

  it("is deterministic for a seed", () => {
    const make = () => {
      const rng = createRng(9);
      const q = generateQuestion({ settings: { operations: OPERATIONS, numberTypes: NUMBER_TYPES, difficulty: "hard" }, rng, id: "q" });
      return buildChoiceSet(q, rng).options.map((o) => o.text);
    };
    expect(make()).toEqual(make());
  });
});

describe("keyboard mapping", () => {
  it("maps 1–4 to option indices and ignores everything else", () => {
    expect(keyToChoiceIndex("1")).toBe(0);
    expect(keyToChoiceIndex("4")).toBe(3);
    expect(keyToChoiceIndex("5")).toBeNull();
    expect(keyToChoiceIndex("0")).toBeNull();
    expect(keyToChoiceIndex("a")).toBeNull();
    expect(keyToChoiceIndex("Enter")).toBeNull();
    expect(keyToChoiceIndex("12")).toBeNull();
  });
});
