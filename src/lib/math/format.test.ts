import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatInteger,
  formatPercent,
  formatRational,
  groupDecimalString,
} from "./format";
import { rational } from "./rational";

describe("formatInteger", () => {
  it("groups thousands", () => {
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(72)).toBe("72");
    expect(formatInteger(672)).toBe("672");
    expect(formatInteger(2736)).toBe("2,736");
    expect(formatInteger(1234567)).toBe("1,234,567");
    expect(formatInteger(-2736)).toBe("-2,736");
  });
});

describe("groupDecimalString", () => {
  it("groups only the integer part", () => {
    expect(groupDecimalString("12345.5")).toBe("12,345.5");
    expect(groupDecimalString("-12345.05")).toBe("-12,345.05");
    expect(groupDecimalString("0.125")).toBe("0.125");
    expect(groupDecimalString("not a number")).toBe("not a number");
  });
});

describe("formatRational", () => {
  it("formats integers regardless of style", () => {
    expect(formatRational(rational(2736), "integer")).toBe("2,736");
    expect(formatRational(rational(80), "decimal")).toBe("80");
    expect(formatRational(rational(8, 4), "fraction")).toBe("2");
    expect(formatRational(rational(-3), "fraction")).toBe("-3");
  });

  it("formats decimals exactly with grouping", () => {
    expect(formatRational(rational(123, 20), "decimal")).toBe("6.15");
    expect(formatRational(rational(21, 50), "decimal")).toBe("0.42");
    expect(formatRational(rational(-7, 2), "decimal")).toBe("-3.5");
    expect(formatRational(rational(2469, 200), "decimal")).toBe("12.345");
    expect(formatRational(rational(24691, 2), "decimal")).toBe("12,345.5");
  });

  it("falls back to a fraction when the decimal does not terminate", () => {
    expect(formatRational(rational(1, 3), "decimal")).toBe("1/3");
    expect(formatRational(rational(5, 14), "integer")).toBe("5/14");
  });

  it("formats fractions in lowest terms", () => {
    expect(formatRational(rational(6, 8), "fraction")).toBe("3/4");
    expect(formatRational(rational(15, 8), "fraction")).toBe("15/8");
    expect(formatRational(rational(-7, 12), "fraction")).toBe("-7/12");
    expect(formatRational(rational(1, 2), "fraction")).toBe("1/2");
  });
});

describe("durations", () => {
  it("formats clock times", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(999)).toBe("0:00");
    expect(formatClock(1000)).toBe("0:01");
    expect(formatClock(245_000)).toBe("4:05");
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5000)).toBe("0:00");
  });

  it("formats compact durations", () => {
    expect(formatDuration(1840)).toBe("1.8s");
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(64_000)).toBe("1m 04s");
    expect(formatDuration(125_500)).toBe("2m 06s");
  });

  it("formats percentages", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.8333, 1)).toBe("83.3%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});
