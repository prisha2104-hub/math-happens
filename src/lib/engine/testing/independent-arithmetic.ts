/**
 * Independent arithmetic used only by tests to cross-check generated
 * questions. It works on the *display strings* of the expression with BigInt,
 * sharing no code with the Rational implementation.
 */
import type { Operation } from "../types";

export interface ParsedExpression {
  left: string;
  symbol: string;
  right: string;
}

export function splitExpression(expression: string): ParsedExpression {
  const match = /^(\S+) ([+−×÷]) (\S+)$/.exec(expression);
  if (!match) throw new Error(`unexpected expression format: ${expression}`);
  return { left: match[1] as string, symbol: match[2] as string, right: match[3] as string };
}

export const SYMBOL_TO_OPERATION: Record<string, Operation> = {
  "+": "addition",
  "−": "subtraction",
  "×": "multiplication",
  "÷": "division",
};

/* ---------- decimals as scaled BigInt ---------- */

export interface ScaledDecimal {
  mantissa: bigint;
  places: number;
}

export function parseDecimalString(text: string): ScaledDecimal {
  const clean = text.replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!match) throw new Error(`not a decimal: ${text}`);
  const [, sign, intPart, fracPart = ""] = match;
  const mantissa = BigInt(`${intPart}${fracPart}`);
  return { mantissa: sign === "-" ? -mantissa : mantissa, places: fracPart.length };
}

function align(a: ScaledDecimal, b: ScaledDecimal): [bigint, bigint, number] {
  const places = Math.max(a.places, b.places);
  return [a.mantissa * 10n ** BigInt(places - a.places), b.mantissa * 10n ** BigInt(places - b.places), places];
}

export function scaledToString({ mantissa, places }: ScaledDecimal): string {
  const negative = mantissa < 0n;
  const digits = (negative ? -mantissa : mantissa).toString().padStart(places + 1, "0");
  const intPart = digits.slice(0, digits.length - places);
  const fracPart = digits.slice(digits.length - places).replace(/0+$/, "");
  const text = fracPart === "" ? intPart : `${intPart}.${fracPart}`;
  return negative && text !== "0" ? `-${text}` : text;
}

export function addDecimals(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  const [x, y, places] = align(a, b);
  return { mantissa: x + y, places };
}

export function subDecimals(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  const [x, y, places] = align(a, b);
  return { mantissa: x - y, places };
}

export function mulDecimals(a: ScaledDecimal, b: ScaledDecimal): ScaledDecimal {
  return { mantissa: a.mantissa * b.mantissa, places: a.places + b.places };
}

export function decimalsEqual(a: ScaledDecimal, b: ScaledDecimal): boolean {
  const [x, y] = align(a, b);
  return x === y;
}

/* ---------- fractions as BigInt pairs ---------- */

export interface BigFraction {
  num: bigint;
  den: bigint;
}

export function parseFractionString(text: string): BigFraction {
  const match = /^(-?\d+)(?:\/(\d+))?$/.exec(text.replace(/,/g, ""));
  if (!match) throw new Error(`not a fraction: ${text}`);
  return { num: BigInt(match[1] as string), den: BigInt(match[2] ?? "1") };
}

function bigGcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function reduceFraction({ num, den }: BigFraction): BigFraction {
  if (den === 0n) throw new Error("zero denominator");
  if (num === 0n) return { num: 0n, den: 1n };
  const sign = (num < 0n) !== (den < 0n) ? -1n : 1n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const g = bigGcd(n, d);
  return { num: (sign * n) / g, den: d / g };
}

export function fractionToString(fraction: BigFraction): string {
  const { num, den } = reduceFraction(fraction);
  return den === 1n ? num.toString() : `${num}/${den}`;
}

export function computeFraction(operation: Operation, a: BigFraction, b: BigFraction): BigFraction {
  switch (operation) {
    case "addition":
      return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
    case "subtraction":
      return { num: a.num * b.den - b.num * a.den, den: a.den * b.den };
    case "multiplication":
      return { num: a.num * b.num, den: a.den * b.den };
    case "division":
      return { num: a.num * b.den, den: a.den * b.num };
  }
}
