import { describe, expect, it } from "vitest";
import type { NumberType, Operation } from "@/lib/engine/types";
import { makeAttempt } from "@/lib/testing/fixtures";
import { breakdown, breakdownByNumberType, breakdownByOperation, computeMetrics } from "./scoring";
import type { Attempt } from "./types";

const attempt = (overrides: Partial<Attempt> & { correct: boolean; responseMs: number }): Attempt => makeAttempt(overrides);

const sample: Attempt[] = [
  attempt({ correct: true, responseMs: 1000, operation: "addition", numberType: "integer" }),
  attempt({ correct: true, responseMs: 3000, operation: "addition", numberType: "decimal" }),
  attempt({ correct: false, responseMs: 5000, operation: "division", numberType: "fraction" }),
  attempt({ correct: true, responseMs: 7000, operation: "division", numberType: "fraction" }),
];

describe("breakdown", () => {
  it("handles the empty case with zeros", () => {
    expect(breakdown([])).toEqual({ attempted: 0, correct: 0, incorrect: 0, accuracy: 0, averageResponseMs: 0 });
  });

  it("counts and averages", () => {
    expect(breakdown(sample)).toEqual({ attempted: 4, correct: 3, incorrect: 1, accuracy: 0.75, averageResponseMs: 4000 });
  });
});

describe("computeMetrics", () => {
  it("defines net score per minute as (correct − incorrect) / elapsed minutes", () => {
    const metrics = computeMetrics(sample, 30_000);
    expect(metrics.correctPerMinute).toBeCloseTo(6);
    expect(metrics.netScorePerMinute).toBeCloseTo(4);
    expect(metrics.elapsedMs).toBe(30_000);
  });

  it("goes negative when more answers are wrong than right", () => {
    const attempts = [attempt({ correct: false, responseMs: 1 }), attempt({ correct: false, responseMs: 1 }), attempt({ correct: true, responseMs: 1 })];
    expect(computeMetrics(attempts, 60_000).netScorePerMinute).toBeCloseTo(-1);
  });

  it("returns zero rates when no time has elapsed", () => {
    const metrics = computeMetrics(sample, 0);
    expect(metrics.correctPerMinute).toBe(0);
    expect(metrics.netScorePerMinute).toBe(0);
    expect(Number.isFinite(metrics.accuracy)).toBe(true);
  });
});

describe("breakdowns", () => {
  it("groups by operation, omitting operations that never appeared", () => {
    const byOp = breakdownByOperation(sample);
    expect(Object.keys(byOp).sort()).toEqual<Operation[]>(["addition", "division"]);
    expect(byOp.addition).toEqual({ attempted: 2, correct: 2, incorrect: 0, accuracy: 1, averageResponseMs: 2000 });
    expect(byOp.division).toEqual({ attempted: 2, correct: 1, incorrect: 1, accuracy: 0.5, averageResponseMs: 6000 });
  });

  it("groups by number type", () => {
    const byType = breakdownByNumberType(sample);
    expect(Object.keys(byType).sort()).toEqual<NumberType[]>(["decimal", "fraction", "integer"]);
    expect(byType.fraction?.accuracy).toBe(0.5);
    expect(byType.integer?.attempted).toBe(1);
  });
});
