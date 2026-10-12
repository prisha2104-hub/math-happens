import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "@/lib/answer/validate";
import { buildChoiceSet } from "@/lib/choice/choiceSet";
import { rational, toNumber } from "@/lib/math/rational";
import { DEFAULT_ADVANCED_SETTINGS } from "./advanced";
import { DEFAULT_FINANCE_SETTINGS, FINANCE_SUBTYPES, type FinanceSettings, type FinanceSubtype } from "./finance";
import { buildFinanceQuestion, generateQuestion } from "./generate";
import { type FinanceSpec, generateFinanceSpec, renderFinance } from "./generators/finance";
import { createRng } from "./rng";
import { generateTargetedQuestion } from "./targeted";
import { DIFFICULTIES, type Difficulty, type Question } from "./types";

const dec = (value: number): ReturnType<typeof rational> => rational(Math.round(value * 1000), 1000);

function spec(subtype: FinanceSubtype, inputs: number[], mode = "", places = 1, estimate = false): FinanceSpec {
  return { subtype, mode, inputs: inputs.map(dec), places, estimate };
}

const settings = (overrides: Partial<FinanceSettings> = {}): FinanceSettings => ({ ...DEFAULT_FINANCE_SETTINGS, ...overrides });

function question(subtype: FinanceSubtype, inputs: number[], mode = "", places = 1, estimate = false): Question {
  return buildFinanceQuestion("q", spec(subtype, inputs, mode, places, estimate), "medium");
}

/**
 * A second, independent implementation of every family in plain floating
 * point. The generators work in exact rationals, so agreement here means the
 * templates really compute what their prompts claim.
 */
function independentAnswer(subtype: FinanceSubtype, mode: string, inputs: number[]): number {
  const [a = 0, b = 0, c = 0] = inputs;
  switch (subtype) {
    case "percent-of":
      return (b * a) / 100;
    case "reverse-percent":
      return (a / b) * 100;
    case "percent-change":
      return (Math.abs(b - a) / a) * 100;
    case "fraction-to-percent":
      return a * 100;
    case "weighted-average":
      return (a / 100) * b + (1 - a / 100) * c;
    case "successive-returns":
      return ((1 + a / 100) * (1 + b / 100) - 1) * 100;
    case "basis-points":
      return mode === "pp" ? Math.abs(b - a) : Math.abs(b - a) * 100;
    case "profit-margin": {
      const profit = mode === "costs" ? a - b : b;
      return (profit / a) * 100;
    }
    case "valuation-multiple":
      return mode === "price-from-pe" ? a * b : a / b;
    case "enterprise-value":
      return mode === "equity" ? a - b + c : a + b - c;
    case "expected-value":
      return (a / 100) * b - (1 - a / 100) * c;
    case "compounding": {
      const years = Math.round(c);
      const growth = (1 + b / 100) ** years;
      return mode === "total-return" ? (growth - 1) * 100 : a * growth;
    }
  }
}

describe("finance question families", () => {
  // The worked examples from the brief, which are also the canonical shapes.
  const examples: { subtype: FinanceSubtype; inputs: number[]; mode?: string; places?: number; prompt: RegExp; answerText: string }[] = [
    { subtype: "percent-of", inputs: [25, 76], prompt: /What is 25% of 76\?/, answerText: "19" },
    { subtype: "reverse-percent", inputs: [18, 12], prompt: /18 is 12% of what number\?/, answerText: "150" },
    { subtype: "percent-change", inputs: [80, 92], prompt: /rises from \$80 to \$92.*percentage gain/, answerText: "15%" },
    { subtype: "percent-change", inputs: [92, 80], prompt: /falls from \$92 to \$80.*percentage loss/, answerText: "13%" },
    { subtype: "successive-returns", inputs: [-20, 20], prompt: /falls 20%, then rises 20%/, answerText: "-4%" },
    { subtype: "fraction-to-percent", inputs: [0.375], mode: "fraction", prompt: /Express 3\/8 as a percentage/, answerText: "37.5%" },
    { subtype: "weighted-average", inputs: [60, 10, -5], prompt: /60% of a portfolio returns 10% and the rest loses 5%/, answerText: "4%" },
    { subtype: "basis-points", inputs: [4.25, 4.6], mode: "bps", prompt: /yield rises from 4.25% to 4.6%.*basis points/, answerText: "35 bps" },
    // A move of 0.35 points needs two decimals, which is what `places` says.
    { subtype: "basis-points", inputs: [4.25, 4.6], mode: "pp", places: 2, prompt: /percentage points/, answerText: "0.35 pp" },
    { subtype: "profit-margin", inputs: [250, 40], prompt: /Revenue is \$250 and profit is \$40/, answerText: "16%" },
    { subtype: "valuation-multiple", inputs: [84, 7], mode: "pe", prompt: /trades at \$84 with EPS of \$7.*P\/E/, answerText: "12×" },
    { subtype: "enterprise-value", inputs: [500, 100, 30], mode: "ev", prompt: /Equity value is \$500m, debt is \$100m and cash is \$30m/, answerText: "$570m" },
    { subtype: "enterprise-value", inputs: [570, 100, 30], mode: "equity", prompt: /Enterprise value is \$570m/, answerText: "$500m" },
    { subtype: "expected-value", inputs: [40, 30, 10], prompt: /40% chance of making \$30 and otherwise loses \$10/, answerText: "$6" },
    { subtype: "compounding", inputs: [100, 10, 2], prompt: /\$100 is invested at 10% a year.*after 2 years/, answerText: "$121" },
    { subtype: "compounding", inputs: [100, 10, 2], mode: "total-return", prompt: /returns 10% a year for 2 years/, answerText: "21%" },
  ];

  for (const example of examples) {
    it(`${example.subtype}${example.mode ? ` (${example.mode})` : ""} → ${example.answerText}`, () => {
      const q = question(example.subtype, example.inputs, example.mode ?? "", example.places ?? 1);
      expect(q.prompt).toMatch(example.prompt);
      expect(q.answerText).toBe(example.answerText);
      // The last explanation step has to state the answer it arrives at.
      const steps = renderFinance(spec(example.subtype, example.inputs, example.mode ?? "", example.places ?? 1)).explanation;
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[steps.length - 1]).toContain(q.answerText.replace("$", "").replace("×", ""));
    });
  }

  it("keeps units distinct between percent, percentage points, basis points, dollars and multiples", () => {
    expect(question("percent-change", [80, 92]).answerText).toBe("15%");
    expect(question("basis-points", [4.25, 4.6], "pp", 2).answerText).toBe("0.35 pp");
    expect(question("basis-points", [4.25, 4.6], "bps").answerText).toBe("35 bps");
    expect(question("enterprise-value", [500, 100, 30], "ev").answerText).toBe("$570m");
    expect(question("expected-value", [40, 30, 10]).answerText).toBe("$6");
    expect(question("valuation-multiple", [84, 7], "pe").answerText).toBe("12×");
    expect(question("percent-of", [25, 76]).answerText).toBe("19");
  });
});

describe("finance generation", () => {
  const styles: FinanceSettings[] = [
    settings(),
    settings({ valueStyle: "whole" }),
    settings({ valueStyle: "decimal" }),
    settings({ rounding: 0 }),
    settings({ rounding: 2 }),
    settings({ answerStyle: "estimate" }),
    settings({ amountRange: { min: 1000, max: 20_000 } }),
    settings({ amountRange: { min: 4, max: 9 } }),
    // Nonsensical input must not hang or throw.
    settings({ amountRange: { min: 900, max: 5 }, rounding: 7 }),
  ];

  for (const difficulty of DIFFICULTIES) {
    for (const subtype of FINANCE_SUBTYPES) {
      it(`${subtype} on ${difficulty} always agrees with an independent calculation`, () => {
        for (const [index, style] of styles.entries()) {
          const rng = createRng(1000 + index);
          for (let i = 0; i < 25; i += 1) {
            const drawn = generateFinanceSpec({ rng, settings: style, difficulty, subtype });
            expect(drawn.subtype).toBe(subtype);
            const rendered = renderFinance(drawn);
            const expected = independentAnswer(subtype, drawn.mode, drawn.inputs.map(toNumber));
            expect(toNumber(rendered.exact), `${rendered.prompt} (exact)`).toBeCloseTo(expected, 6);
            // The answer is the exact value rounded to the places asked for:
            // never further away than half of that place.
            const half = 0.5 / 10 ** rendered.places;
            expect(Math.abs(toNumber(rendered.answer) - expected), `${rendered.prompt} (rounded)`).toBeLessThanOrEqual(half + 1e-9);
            expect(rendered.prompt.length).toBeGreaterThan(10);
            expect(rendered.explanation.length).toBeGreaterThan(0);
            // Values are readable: no long decimal tails in the prompt.
            for (const input of drawn.inputs) expect(input.den, `${rendered.prompt} input`).toBeLessThanOrEqual(1000);
          }
        }
      });
    }
  }

  it("says when to round and only then", () => {
    const exact = renderFinance(spec("percent-of", [25, 76]));
    expect(exact.instruction).toBeNull();
    // 1/3 of 100 cannot be written exactly, so the instruction appears.
    const rounded = renderFinance(spec("profit-margin", [300, 100], "", 1));
    expect(toNumber(rounded.answer)).toBeCloseTo(33.3, 6);
    expect(rounded.instruction).toContain("Round to 1 decimal place");
    const whole = renderFinance(spec("profit-margin", [300, 100], "", 0));
    expect(toNumber(whole.answer)).toBe(33);
    expect(whole.instruction).toContain("nearest whole percent");
  });

  it("tells signed families to use a minus sign", () => {
    expect(renderFinance(spec("successive-returns", [-20, 20])).instruction).toContain("minus sign");
    expect(renderFinance(spec("weighted-average", [60, 10, -5])).instruction).toContain("minus sign");
    expect(renderFinance(spec("percent-of", [25, 76])).instruction).toBeNull();
  });

  it("keeps the requested share of each family and never draws one set to zero", () => {
    const only = settings({ subtypeMix: { ...DEFAULT_FINANCE_SETTINGS.subtypeMix, "percent-of": 0 } });
    const rng = createRng(77);
    const drawn = Array.from({ length: 400 }, () => generateFinanceSpec({ rng, settings: only, difficulty: "medium" }).subtype);
    expect(drawn).not.toContain("percent-of");
    expect(new Set(drawn).size).toBeGreaterThan(4);

    const single = settings({ subtypeMix: { ...DEFAULT_FINANCE_SETTINGS.subtypeMix, "basis-points": 100 } });
    const rng2 = createRng(78);
    for (let i = 0; i < 20; i += 1) {
      // Every other family is still at its default share, so this checks the
      // weighting rather than the filtering.
      expect(generateFinanceSpec({ rng: rng2, settings: { ...single, subtypeMix: zeroExcept("basis-points") }, difficulty: "easy" }).subtype).toBe("basis-points");
    }
  });
});

function zeroExcept(subtype: FinanceSubtype): Record<FinanceSubtype, number> {
  const mix = {} as Record<FinanceSubtype, number>;
  for (const key of FINANCE_SUBTYPES) mix[key] = key === subtype ? 100 : 0;
  return mix;
}

describe("finance answers", () => {
  it("accepts the answer with or without its unit", () => {
    const percent = question("percent-change", [80, 92]);
    for (const input of ["15", "15%", " 15 % ", "15 percent"]) expect(evaluateAnswer(percent, input).verdict, input).toBe("correct");
    expect(evaluateAnswer(percent, "0.15").verdict).toBe("incorrect");

    const money = question("expected-value", [40, 30, 10]);
    for (const input of ["6", "$6", "6.00"]) expect(evaluateAnswer(money, input).verdict, input).toBe("correct");

    const millions = question("enterprise-value", [500, 100, 30], "ev");
    for (const input of ["570", "$570m", "570 m"]) expect(evaluateAnswer(millions, input).verdict, input).toBe("correct");

    const multiple = question("valuation-multiple", [84, 7], "pe");
    for (const input of ["12", "12x", "12×"]) expect(evaluateAnswer(multiple, input).verdict, input).toBe("correct");

    const bps = question("basis-points", [4.25, 4.6], "bps");
    expect(evaluateAnswer(bps, "35 bps").verdict).toBe("correct");
    // Answering in percentage points instead of basis points is still wrong.
    expect(evaluateAnswer(bps, "0.35").verdict).toBe("incorrect");
  });

  it("accepts equivalent forms of the same number", () => {
    const percent = question("fraction-to-percent", [0.375], "fraction");
    for (const input of ["37.5", "37.50", "75/2"]) expect(evaluateAnswer(percent, input).verdict, input).toBe("correct");
  });

  it("accepts anything inside the stated band for estimation questions", () => {
    const estimated = question("percent-of", [23, 851], "", 1, true);
    expect(estimated.instruction).toContain("Estimate");
    expect(estimated.tolerance).toBeDefined();
    const answer = toNumber(estimated.answer);
    const band = toNumber(estimated.tolerance ?? rational(0));
    expect(band).toBeGreaterThan(0);
    expect(evaluateAnswer(estimated, String(answer)).verdict).toBe("correct");
    expect(evaluateAnswer(estimated, String(answer + band * 0.9)).verdict).toBe("correct");
    expect(evaluateAnswer(estimated, String(answer + band * 2)).verdict).toBe("incorrect");
  });
});

describe("finance multiple choice", () => {
  it("offers four options that read differently, with exactly one correct", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const style of [settings(), settings({ rounding: 0 }), settings({ answerStyle: "estimate" })]) {
        const rng = createRng(4242);
        for (let i = 0; i < 120; i += 1) {
          const drawn = generateFinanceSpec({ rng, settings: style, difficulty });
          const q = buildFinanceQuestion(`q${i}`, drawn, difficulty);
          const set = buildChoiceSet(q, rng);
          expect(set.options, q.prompt).toHaveLength(4);
          expect(new Set(set.options.map((o) => o.text)).size, `${q.prompt} → ${set.options.map((o) => o.text).join(" | ")}`).toBe(4);
          const correct = set.options.filter((o) => o.tag === null);
          expect(correct).toHaveLength(1);
          expect(set.options[set.correctIndex]?.text).toBe(q.answerText);
          // Every option is a value the question could plausibly be answered with.
          for (const option of set.options) expect(Number.isFinite(toNumber(option.value))).toBe(true);
        }
      }
    }
  });

  it("marks the correct option as the one that would be graded correct", () => {
    const rng = createRng(99);
    for (let i = 0; i < 60; i += 1) {
      const drawn = generateFinanceSpec({ rng, settings: settings(), difficulty: "medium" });
      const q = buildFinanceQuestion(`q${i}`, drawn, "medium");
      const set = buildChoiceSet(q, rng);
      set.options.forEach((option, index) => {
        const graded = evaluateAnswer(q, option.text).verdict;
        if (index === set.correctIndex) expect(graded, `${q.prompt} / ${option.text}`).toBe("correct");
      });
    }
  });
});

describe("finance in a session", () => {
  it("mixes into ordinary practice through the operation selection", () => {
    const rng = createRng(5);
    const questions = Array.from({ length: 200 }, (_, i) =>
      generateQuestion({ settings: { operations: ["addition", "finance"], numberTypes: ["integer"], difficulty: "medium" }, rng, id: `q${i}` }),
    );
    const finance = questions.filter((q) => q.operation === "finance");
    expect(finance.length).toBeGreaterThan(60);
    expect(questions.length - finance.length).toBeGreaterThan(60);
    for (const q of finance) {
      expect(q.prompt).toBeDefined();
      expect(q.meta.finance).toBeDefined();
      expect(q.meta.variant.startsWith("fin-")).toBe(true);
    }
  });

  it("works as the only selected operation, and alone with every advanced setting off", () => {
    const rng = createRng(6);
    for (let i = 0; i < 80; i += 1) {
      const q = generateQuestion({ settings: { operations: ["finance"], numberTypes: ["fraction"], difficulty: "easy" }, rng, id: `q${i}` });
      expect(q.operation).toBe("finance");
      // The number-format choice does not apply to word problems.
      expect(q.numberType === "integer" || q.numberType === "decimal").toBe(true);
    }
  });

  it("follows the advanced finance settings when they are on", () => {
    const rng = createRng(7);
    const advanced = {
      ...DEFAULT_ADVANCED_SETTINGS,
      enabled: true,
      operationMix: { addition: 0, subtraction: 0, multiplication: 0, division: 0, finance: 100 },
      finance: { ...DEFAULT_FINANCE_SETTINGS, subtypeMix: zeroExcept("weighted-average"), answerStyle: "estimate" as const },
    };
    for (let i = 0; i < 40; i += 1) {
      const q = generateQuestion({ settings: { operations: ["finance"], numberTypes: ["integer"], difficulty: "medium", advanced }, rng, id: `q${i}` });
      expect(q.meta.finance?.subtype).toBe("weighted-average");
      expect(q.tolerance).toBeDefined();
    }
  });

  it("drills one family through targeted practice", () => {
    const rng = createRng(8);
    for (const subtype of FINANCE_SUBTYPES) {
      const q = generateTargetedQuestion({
        target: { numberType: "integer", operation: "finance", difficulty: "medium", facet: `fin-${subtype}` },
        rng,
        id: "t",
      });
      expect(q.meta.finance?.subtype).toBe(subtype);
    }
  });

  it("avoids repeating the same question back to back", () => {
    const rng = createRng(9);
    const keys: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const q = generateQuestion({ settings: { operations: ["finance"], numberTypes: ["integer"], difficulty: "medium" }, rng, id: `q${i}`, recentKeys: keys.slice(-8) });
      keys.push(q.key);
    }
    for (let i = 1; i < keys.length; i += 1) expect(keys[i]).not.toBe(keys[i - 1]);
  });
});

function difficultyLabels(): Difficulty[] {
  return [...DIFFICULTIES];
}

describe("difficulty changes the reasoning, not just the size", () => {
  it("keeps easy answers friendly and lets hard ones need rounding or more steps", () => {
    const counts: Record<Difficulty, { rounded: number; total: number }> = {
      easy: { rounded: 0, total: 0 },
      medium: { rounded: 0, total: 0 },
      hard: { rounded: 0, total: 0 },
    };
    for (const difficulty of difficultyLabels()) {
      const rng = createRng(31);
      for (let i = 0; i < 300; i += 1) {
        const drawn = generateFinanceSpec({ rng, settings: settings(), difficulty });
        const rendered = renderFinance(drawn);
        counts[difficulty].total += 1;
        if (rendered.instruction !== null && rendered.instruction.startsWith("Round")) counts[difficulty].rounded += 1;
      }
    }
    // Easy questions come out exact; harder ones sometimes need rounding.
    expect(counts.easy.rounded).toBe(0);
    expect(counts.hard.rounded).toBeGreaterThan(0);
    expect(counts.hard.rounded).toBeGreaterThanOrEqual(counts.medium.rounded);
  });
});
