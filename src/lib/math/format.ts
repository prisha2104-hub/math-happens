import { type Rational, toDecimalString, toFractionString } from "./rational";

/** Group an integer with commas: 2736 → "2,736". Works on negative values. */
export function formatInteger(n: number): string {
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.abs(n));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Group the integer part of a plain decimal string: "-12345.5" → "-12,345.5". */
export function groupDecimalString(text: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(text);
  if (!match) return text;
  const [, sign, intPart, fracPart = ""] = match;
  return `${sign}${formatInteger(Number(intPart))}${fracPart}`;
}

export type NumberStyle = "integer" | "decimal" | "fraction";

/**
 * Human-readable form of an exact value.
 *
 * - `decimal` prefers a terminating decimal ("6.15", "80") and falls back to a
 *   fraction if the expansion does not terminate.
 * - `fraction` prefers "5/14", collapsing to a grouped integer when whole.
 * - `integer` groups digits and falls back to the decimal / fraction rules
 *   for non-integers (which should not occur for integer questions).
 */
export function formatRational(value: Rational, style: NumberStyle): string {
  if (value.den === 1) return formatInteger(value.num);
  if (style === "fraction") return toFractionString(value);
  const decimal = toDecimalString(value);
  return decimal === null ? toFractionString(value) : groupDecimalString(decimal);
}

/** Wall-clock style duration: 245000 → "4:05". Hours appear only when needed. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${hours > 0 ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** Compact duration for tables: 1840 → "1.8s", 64000 → "1m 04s". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
