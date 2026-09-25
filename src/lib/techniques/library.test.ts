import { describe, expect, it } from "vitest";
import { generateQuestion } from "@/lib/engine/generate";
import { createRng } from "@/lib/engine/rng";
import { DIFFICULTIES, NUMBER_TYPES, OPERATIONS } from "@/lib/engine/types";
import { equals } from "@/lib/math/rational";
import { TECHNIQUES, exampleQuestion, generateTechniqueQuestion, techniqueById, techniquesFor } from "./library";
import { TECHNIQUE_CATEGORIES } from "./types";

const BAD_TEXT = /NaN|undefined|Infinity|null/;

describe("technique library", () => {
  it("covers every category the brief asked for", () => {
    for (const category of TECHNIQUE_CATEGORIES) expect(TECHNIQUES.some((t) => t.category === category)).toBe(true);
    expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(TECHNIQUES.length);
    expect(techniqueById("div-split-dividend")?.title).toMatch(/dividend/i);
    expect(techniqueById("nope")).toBeNull();
    for (const t of TECHNIQUES) {
      expect(t.summary.length).toBeGreaterThan(20);
      expect(t.whenUseful.length).toBeGreaterThan(10);
      expect(t.summary).not.toMatch(/practice more|calculate carefully/i);
    }
  });

  for (const t of TECHNIQUES) {
    it(`${t.id}: its own example applies and the worked steps reach the true answer`, () => {
      const example = exampleQuestion(t);
      expect(t.applies(example), example.expression).toBe(true);
      const explanation = t.explain(example);
      expect(explanation).not.toBeNull();
      expect(explanation!.steps.length).toBeGreaterThanOrEqual(2);
      expect(equals(explanation!.result, example.answer), `${example.expression}: ${explanation!.steps.join(" ")}`).toBe(true);
      for (const step of explanation!.steps) expect(step).not.toMatch(BAD_TEXT);
      // The final step should mention the answer as displayed.
      expect(explanation!.steps[explanation!.steps.length - 1]).toContain(example.answerText.replace(/,/g, "").slice(-2));
    });
  }

  it("explains thousands of generated questions correctly wherever it claims to apply", () => {
    const rng = createRng(777);
    let checked = 0;
    const applied = new Map<string, number>();
    for (const numberType of NUMBER_TYPES) {
      for (const operation of OPERATIONS) {
        for (const difficulty of DIFFICULTIES) {
          for (let i = 0; i < 60; i += 1) {
            const q = generateQuestion({ settings: { operations: [operation], numberTypes: [numberType], difficulty }, rng, id: `q${i}` });
            for (const t of techniquesFor(q)) {
              const explanation = t.explain(q);
              expect(explanation, `${t.id} on ${q.expression}`).not.toBeNull();
              expect(equals(explanation!.result, q.answer), `${t.id} on ${q.expression}: ${explanation!.steps.join(" | ")}`).toBe(true);
              for (const step of explanation!.steps) expect(step, `${t.id} on ${q.expression}`).not.toMatch(BAD_TEXT);
              applied.set(t.id, (applied.get(t.id) ?? 0) + 1);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
    // Every technique should have found real questions to apply to.
    for (const t of TECHNIQUES) expect(applied.get(t.id) ?? 0, t.id).toBeGreaterThan(0);
  });

  it("never claims to apply to the wrong operation or number type", () => {
    const rng = createRng(778);
    for (let i = 0; i < 300; i += 1) {
      const q = generateQuestion({ settings: { operations: OPERATIONS, numberTypes: NUMBER_TYPES, difficulty: "hard" }, rng, id: `q${i}` });
      for (const t of techniquesFor(q)) {
        if (t.category === "division") expect(q.operation).toBe("division");
        if (t.id.startsWith("frac-") && t.id !== "frac-decimal-equivalents") expect(q.numberType).toBe("fraction");
        if (t.id === "frac-decimal-equivalents" || t.id === "dec-align-places" || t.id === "mul-decimal-placement" || t.id === "div-scale-decimals") expect(q.numberType).toBe("decimal");
      }
    }
  });

  it("generates practice questions the technique actually applies to", () => {
    const rng = createRng(779);
    for (const t of TECHNIQUES) {
      let hits = 0;
      for (let i = 0; i < 20; i += 1) {
        const q = generateTechniqueQuestion(t, rng, `p${i}`);
        expect(q.numberType).toBe(t.practice.numberType);
        expect(q.operation).toBe(t.practice.operation);
        if (t.applies(q)) hits += 1;
      }
      expect(hits, t.id).toBeGreaterThanOrEqual(16);
    }
  });

  it("gives concrete guidance for the brief's examples", () => {
    const rng = createRng(1);
    void rng;
    const split = techniqueById("div-split-dividend")!;
    const steps = split.explain(exampleQuestion(split))!.steps;
    expect(steps[0]).toContain("16 × 40 = 640");
    expect(steps[3]).toContain("42");

    const scale = techniqueById("div-scale-decimals")!;
    expect(scale.explain(exampleQuestion(scale))!.steps.join(" ")).toContain("480 ÷ 6");

    const squares = techniqueById("mul-difference-of-squares")!;
    expect(squares.explain(exampleQuestion(squares))!.steps.join(" ")).toContain("2,500 − 9 = 2,491");

    const cancel = techniqueById("mul-fraction-cross-cancel")!;
    expect(cancel.explain(exampleQuestion(cancel))!.steps.join(" ")).toContain("5/2 × 1/7 = 5/14");

    const common = techniqueById("frac-common-denominator")!;
    expect(common.explain(exampleQuestion(common))!.steps.join(" ")).toContain("9/12");

    const countUp = techniqueById("sub-count-up")!;
    expect(countUp.explain(exampleQuestion(countUp))!.steps.join(" ")).toContain("1,989 → 2,000 is +11");
  });
});
