import { describe, expect, it } from "vitest";
import { parseAnswer } from "./parse";

function value(raw: string) {
  const result = parseAnswer(raw);
  if (!result.ok) throw new Error(`expected "${raw}" to parse, got ${result.error}`);
  return result.value;
}

function error(raw: string) {
  const result = parseAnswer(raw);
  if (result.ok) throw new Error(`expected "${raw}" to fail, got ${result.value.num}/${result.value.den}`);
  return result.error;
}

describe("parseAnswer", () => {
  it("parses integers, including grouped and negative ones", () => {
    expect(value("42")).toEqual({ num: 42, den: 1 });
    expect(value("  42  ")).toEqual({ num: 42, den: 1 });
    expect(value("-7")).toEqual({ num: -7, den: 1 });
    expect(value("−7")).toEqual({ num: -7, den: 1 });
    expect(value("+7")).toEqual({ num: 7, den: 1 });
    expect(value("0")).toEqual({ num: 0, den: 1 });
    expect(value("-0")).toEqual({ num: 0, den: 1 });
    expect(value("007")).toEqual({ num: 7, den: 1 });
    expect(value("1,250")).toEqual({ num: 1250, den: 1 });
    expect(value("2,736")).toEqual({ num: 2736, den: 1 });
    expect(value("1,234,567")).toEqual({ num: 1234567, den: 1 });
  });

  it("parses decimals exactly", () => {
    expect(value("3.5")).toEqual({ num: 7, den: 2 });
    expect(value("6.15")).toEqual({ num: 123, den: 20 });
    expect(value("0.42")).toEqual({ num: 21, den: 50 });
    expect(value(".25")).toEqual({ num: 1, den: 4 });
    expect(value("-.25")).toEqual({ num: -1, den: 4 });
    expect(value("6.")).toEqual({ num: 6, den: 1 });
    expect(value("0.50")).toEqual({ num: 1, den: 2 });
    expect(value("-3.75")).toEqual({ num: -15, den: 4 });
    expect(value("12,345.5")).toEqual({ num: 24691, den: 2 });
    expect(value("0.1")).toEqual({ num: 1, den: 10 });
  });

  it("parses fractions and normalizes them", () => {
    expect(value("3/4")).toEqual({ num: 3, den: 4 });
    expect(value("6/8")).toEqual({ num: 3, den: 4 });
    expect(value("4/2")).toEqual({ num: 2, den: 1 });
    expect(value("-3/4")).toEqual({ num: -3, den: 4 });
    expect(value("−15/8")).toEqual({ num: -15, den: 8 });
    expect(value("0/5")).toEqual({ num: 0, den: 1 });
    expect(value("3 / 4")).toEqual({ num: 3, den: 4 });
    expect(value("15/8")).toEqual({ num: 15, den: 8 });
  });

  it("parses mixed numbers", () => {
    expect(value("1 3/4")).toEqual({ num: 7, den: 4 });
    expect(value("-1 3/4")).toEqual({ num: -7, den: 4 });
    expect(value("2 1/2")).toEqual({ num: 5, den: 2 });
    expect(value("1   1/2")).toEqual({ num: 3, den: 2 });
    expect(value("0 1/2")).toEqual({ num: 1, den: 2 });
  });

  it("rejects empty input", () => {
    expect(error("")).toBe("empty");
    expect(error("   ")).toBe("empty");
  });

  it("rejects malformed input", () => {
    for (const raw of [
      "abc",
      "1.2.3",
      "1/2/3",
      "1//2",
      "3/",
      "/4",
      "1,00",
      "1,0000",
      ",100",
      "1e3",
      "--3",
      "+-3",
      "3-",
      "1 2",
      "1.5/2",
      "1/2.5",
      "1 1/2 3",
      "½",
      "3/-4",
      "3/+4",
      ".",
      "-",
      "1 3 / 4 5",
    ]) {
      expect(error(raw), raw).toBe("invalid");
    }
  });

  it("rejects zero denominators", () => {
    expect(error("1/0")).toBe("zero-denominator");
    expect(error("0/0")).toBe("zero-denominator");
    expect(error("1 2/0")).toBe("zero-denominator");
  });

  it("rejects numbers that are too long to represent exactly", () => {
    expect(error("1234567890123456")).toBe("too-long");
    expect(error("0.1234567890123456")).toBe("too-long");
    expect(error("1234567890123456/3")).toBe("too-long");
  });

  it("returns a human-readable message for failures", () => {
    const result = parseAnswer("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/3\/4/);
  });
});
