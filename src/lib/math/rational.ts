/**
 * Exact rational arithmetic on safe integers.
 *
 * Every `Rational` is kept in canonical form: the denominator is positive,
 * the numerator carries the sign, and gcd(|num|, den) === 1. Because of the
 * canonical form, two rationals are equal exactly when their fields match,
 * so validation never relies on floating-point comparison.
 */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

export class RationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RationalError";
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RationalError(`${label} must be a safe integer, received ${value}`);
  }
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

/** Build a normalized rational from an integer numerator and denominator. */
export function rational(num: number, den = 1): Rational {
  assertSafeInteger(num, "numerator");
  assertSafeInteger(den, "denominator");
  if (den === 0) throw new RationalError("denominator cannot be zero");
  if (num === 0) return { num: 0, den: 1 };
  const sign = Math.sign(num) * Math.sign(den);
  const g = gcd(num, den);
  return { num: (sign * Math.abs(num)) / g, den: Math.abs(den) / g };
}

export const ZERO: Rational = { num: 0, den: 1 };
export const ONE: Rational = { num: 1, den: 1 };

export function fromInteger(n: number): Rational {
  return rational(n, 1);
}

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0) throw new RationalError("division by zero");
  return rational(a.num * b.den, a.den * b.num);
}

export function neg(a: Rational): Rational {
  return rational(-a.num, a.den);
}

export function abs(a: Rational): Rational {
  return rational(Math.abs(a.num), a.den);
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isZero(a: Rational): boolean {
  return a.num === 0;
}

export function isNegative(a: Rational): boolean {
  return a.num < 0;
}

export function isInteger(a: Rational): boolean {
  return a.den === 1;
}

export function toNumber(a: Rational): number {
  return a.num / a.den;
}

/**
 * Parse a plain decimal literal such as "12", "-3.75", ".5" or "4." into an
 * exact rational. Thousands separators and exponents are rejected here; the
 * answer parser normalizes those before delegating.
 */
export function fromDecimalString(text: string): Rational {
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new RationalError(`invalid decimal literal "${text}"`);
  const [, sign, intPart = "", fracPart = ""] = match;
  if (intPart === "" && fracPart === "") {
    throw new RationalError(`invalid decimal literal "${text}"`);
  }
  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  if (digits.length > 15) {
    throw new RationalError("too many digits for exact representation");
  }
  const magnitude = Number(digits === "" ? "0" : digits);
  const den = 10 ** fracPart.length;
  return rational(sign === "-" ? -magnitude : magnitude, den);
}

/**
 * Number of decimal places needed to write the rational exactly, or null if
 * its decimal expansion does not terminate (denominator has a prime factor
 * other than 2 or 5).
 */
export function terminatingDecimalPlaces(a: Rational): number | null {
  let den = a.den;
  let twos = 0;
  let fives = 0;
  while (den % 2 === 0) {
    den /= 2;
    twos += 1;
  }
  while (den % 5 === 0) {
    den /= 5;
    fives += 1;
  }
  return den === 1 ? Math.max(twos, fives) : null;
}

/**
 * Exact decimal string for a terminating rational (e.g. 1/8 → "0.125",
 * -7/2 → "-3.5", 3/1 → "3"), or null if the expansion does not terminate.
 */
export function toDecimalString(a: Rational): string | null {
  const places = terminatingDecimalPlaces(a);
  if (places === null) return null;
  if (places === 0) return String(a.num);
  const scale = 10n ** BigInt(places);
  const scaled = (BigInt(Math.abs(a.num)) * scale) / BigInt(a.den);
  const intPart = scaled / scale;
  const fracPart = (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");
  const sign = a.num < 0 ? "-" : "";
  return fracPart === "" ? `${sign}${intPart}` : `${sign}${intPart}.${fracPart}`;
}

/** "3/4", "-3/4", or "2" for integers. */
export function toFractionString(a: Rational): string {
  return a.den === 1 ? String(a.num) : `${a.num}/${a.den}`;
}

/** Split into integer part and proper remainder, e.g. -7/4 → {whole: -1, num: 3, den: 4}. */
export function toMixed(a: Rational): { whole: number; num: number; den: number } {
  const magnitude = Math.abs(a.num);
  const whole = Math.floor(magnitude / a.den);
  const sign = a.num < 0 ? -1 : 1;
  return { whole: sign * whole, num: magnitude % a.den, den: a.den };
}
