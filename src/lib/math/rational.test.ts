import { describe, expect, it } from "vitest";
import {
  RationalError,
  abs,
  add,
  compare,
  div,
  equals,
  fromDecimalString,
  fromInteger,
  gcd,
  isInteger,
  isNegative,
  lcm,
  mul,
  neg,
  rational,
  sub,
  terminatingDecimalPlaces,
  toDecimalString,
  toFractionString,
  toMixed,
  toNumber,
} from "./rational";

describe("gcd / lcm", () => {
  it("computes gcd of positive, negative and zero inputs", () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(-12, 18)).toBe(6);
    expect(gcd(0, 7)).toBe(7);
    expect(gcd(7, 0)).toBe(7);
    expect(gcd(17, 31)).toBe(1);
  });

  it("computes lcm", () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(7, 9)).toBe(63);
    expect(lcm(0, 5)).toBe(0);
  });
});

describe("rational normalization", () => {
  it("reduces by the greatest common divisor", () => {
    expect(rational(6, 8)).toEqual({ num: 3, den: 4 });
    expect(rational(10, 5)).toEqual({ num: 2, den: 1 });
    expect(rational(100, 1000)).toEqual({ num: 1, den: 10 });
  });

  it("keeps the sign on the numerator and the denominator positive", () => {
    expect(rational(3, -4)).toEqual({ num: -3, den: 4 });
    expect(rational(-3, -4)).toEqual({ num: 3, den: 4 });
    expect(rational(-6, 8)).toEqual({ num: -3, den: 4 });
  });

  it("normalizes zero to 0/1", () => {
    expect(rational(0, 5)).toEqual({ num: 0, den: 1 });
    expect(rational(0, -5)).toEqual({ num: 0, den: 1 });
  });

  it("rejects zero denominators and non-integers", () => {
    expect(() => rational(1, 0)).toThrow(RationalError);
    expect(() => rational(1.5, 2)).toThrow(RationalError);
    expect(() => rational(1, 2.5)).toThrow(RationalError);
    expect(() => rational(Number.NaN, 1)).toThrow(RationalError);
    expect(() => rational(2 ** 53, 1)).toThrow(RationalError);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts exactly", () => {
    expect(add(rational(1, 2), rational(1, 4))).toEqual({ num: 3, den: 4 });
    expect(add(rational(1, 3), rational(2, 3))).toEqual({ num: 1, den: 1 });
    expect(sub(rational(3, 4), rational(1, 6))).toEqual({ num: 7, den: 12 });
    expect(sub(rational(1, 6), rational(3, 4))).toEqual({ num: -7, den: 12 });
    // 0.1 + 0.2 is exactly 0.3 in rational arithmetic.
    expect(add(rational(1, 10), rational(2, 10))).toEqual({ num: 3, den: 10 });
  });

  it("multiplies and divides exactly", () => {
    expect(mul(rational(5, 8), rational(4, 7))).toEqual({ num: 5, den: 14 });
    expect(div(rational(3, 4), rational(2, 5))).toEqual({ num: 15, den: 8 });
    // 4.8 ÷ 0.06 = 80
    expect(div(rational(48, 10), rational(6, 100))).toEqual({ num: 80, den: 1 });
    // 1.2 × 0.35 = 0.42
    expect(mul(rational(12, 10), rational(35, 100))).toEqual({ num: 21, den: 50 });
  });

  it("refuses to divide by zero", () => {
    expect(() => div(rational(1, 2), rational(0, 1))).toThrow(RationalError);
  });

  it("handles negatives, negation and absolute value", () => {
    expect(mul(rational(-1, 2), rational(1, 3))).toEqual({ num: -1, den: 6 });
    expect(mul(rational(-1, 2), rational(-1, 3))).toEqual({ num: 1, den: 6 });
    expect(div(rational(1, 2), rational(-1, 4))).toEqual({ num: -2, den: 1 });
    expect(neg(rational(3, 4))).toEqual({ num: -3, den: 4 });
    expect(abs(rational(-3, 4))).toEqual({ num: 3, den: 4 });
    expect(isNegative(rational(-1, 2))).toBe(true);
    expect(isNegative(rational(1, 2))).toBe(false);
  });
});

describe("comparison", () => {
  it("treats equivalent fractions as equal", () => {
    expect(equals(rational(1, 2), rational(2, 4))).toBe(true);
    expect(equals(rational(4, 2), fromInteger(2))).toBe(true);
    expect(equals(rational(1, 2), rational(1, 3))).toBe(false);
    expect(equals(rational(-1, 2), rational(1, -2))).toBe(true);
  });

  it("orders values", () => {
    expect(compare(rational(1, 3), rational(1, 2))).toBe(-1);
    expect(compare(rational(1, 2), rational(1, 3))).toBe(1);
    expect(compare(rational(2, 4), rational(1, 2))).toBe(0);
    expect(compare(rational(-1, 2), rational(-1, 3))).toBe(-1);
  });

  it("reports integer-ness and numeric value", () => {
    expect(isInteger(rational(4, 2))).toBe(true);
    expect(isInteger(rational(3, 2))).toBe(false);
    expect(toNumber(rational(3, 4))).toBe(0.75);
  });
});

describe("decimal conversion", () => {
  it("parses decimal literals exactly", () => {
    expect(fromDecimalString("12")).toEqual({ num: 12, den: 1 });
    expect(fromDecimalString("3.75")).toEqual({ num: 15, den: 4 });
    expect(fromDecimalString("-0.5")).toEqual({ num: -1, den: 2 });
    expect(fromDecimalString(".5")).toEqual({ num: 1, den: 2 });
    expect(fromDecimalString("4.")).toEqual({ num: 4, den: 1 });
    expect(fromDecimalString("+2.40")).toEqual({ num: 12, den: 5 });
    expect(fromDecimalString("0.000")).toEqual({ num: 0, den: 1 });
    expect(fromDecimalString("007")).toEqual({ num: 7, den: 1 });
  });

  it("rejects malformed literals", () => {
    for (const text of ["", ".", "-", "1.2.3", "1,000", "abc", "1e3", " 1", "1/2"]) {
      expect(() => fromDecimalString(text), text).toThrow(RationalError);
    }
  });

  it("rejects literals with too many digits to stay exact", () => {
    expect(() => fromDecimalString("0.1234567890123456")).toThrow(RationalError);
  });

  it("knows how many places a terminating decimal needs", () => {
    expect(terminatingDecimalPlaces(rational(1, 8))).toBe(3);
    expect(terminatingDecimalPlaces(rational(3, 20))).toBe(2);
    expect(terminatingDecimalPlaces(rational(7, 1))).toBe(0);
    expect(terminatingDecimalPlaces(rational(1, 3))).toBeNull();
    expect(terminatingDecimalPlaces(rational(5, 14))).toBeNull();
  });

  it("renders exact decimal strings", () => {
    expect(toDecimalString(rational(1, 8))).toBe("0.125");
    expect(toDecimalString(rational(-7, 2))).toBe("-3.5");
    expect(toDecimalString(rational(3, 1))).toBe("3");
    expect(toDecimalString(rational(21, 50))).toBe("0.42");
    expect(toDecimalString(rational(1, 1000))).toBe("0.001");
    expect(toDecimalString(rational(123, 4))).toBe("30.75");
    expect(toDecimalString(rational(-1, 100))).toBe("-0.01");
    expect(toDecimalString(rational(1, 3))).toBeNull();
  });

  it("round-trips decimal strings through rationals", () => {
    for (const text of ["0.1", "0.2", "0.3", "2.4", "3.75", "6.15", "0.42", "80", "7.2", "0.06"]) {
      expect(toDecimalString(fromDecimalString(text))).toBe(text);
    }
  });
});

describe("fraction rendering", () => {
  it("renders fractions and whole numbers", () => {
    expect(toFractionString(rational(3, 4))).toBe("3/4");
    expect(toFractionString(rational(-3, 4))).toBe("-3/4");
    expect(toFractionString(rational(8, 4))).toBe("2");
    expect(toFractionString(rational(0, 4))).toBe("0");
  });

  it("splits into mixed numbers", () => {
    expect(toMixed(rational(7, 4))).toEqual({ whole: 1, num: 3, den: 4 });
    expect(toMixed(rational(-7, 4))).toEqual({ whole: -1, num: 3, den: 4 });
    expect(toMixed(rational(1, 2))).toEqual({ whole: 0, num: 1, den: 2 });
    expect(toMixed(rational(3, 1))).toEqual({ whole: 3, num: 0, den: 1 });
  });
});
