import {
  type Rational,
  RationalError,
  add,
  fromDecimalString,
  fromInteger,
  neg,
  rational,
} from "@/lib/math/rational";

export type ParseErrorCode = "empty" | "invalid" | "zero-denominator" | "too-long";

export type ParseResult =
  | { ok: true; value: Rational }
  | { ok: false; error: ParseErrorCode; message: string };

const MESSAGES: Record<ParseErrorCode, string> = {
  empty: "Type an answer first.",
  invalid: "Enter a number like 42, -3.5, 3/4 or 1 3/4.",
  "zero-denominator": "A fraction cannot have a zero denominator.",
  "too-long": "That number has too many digits.",
};

function fail(error: ParseErrorCode): ParseResult {
  return { ok: false, error, message: MESSAGES[error] };
}

/** Accept "1,000" / "12,345.5" style grouping but reject misplaced commas like "1,00". */
const GROUPED_INTEGER = /^\d{1,3}(?:,\d{3})+$/;

function ungroup(text: string): string | null {
  if (!text.includes(",")) return text;
  const [intPart = "", ...rest] = text.split(".");
  if (rest.length > 1 || !GROUPED_INTEGER.test(intPart)) return null;
  return [intPart.replace(/,/g, ""), ...rest].join(".");
}

function parseUnsignedDecimal(text: string): ParseResult {
  const ungrouped = ungroup(text);
  if (ungrouped === null) return fail("invalid");
  try {
    return { ok: true, value: fromDecimalString(ungrouped) };
  } catch (error) {
    if (error instanceof RationalError && error.message.startsWith("too many digits")) return fail("too-long");
    return fail("invalid");
  }
}

function parseUnsignedFraction(numText: string, denText: string): ParseResult {
  if (!/^\d+$/.test(numText) || !/^\d+$/.test(denText)) return fail("invalid");
  if (numText.length > 15 || denText.length > 15) return fail("too-long");
  const den = Number(denText);
  if (den === 0) return fail("zero-denominator");
  return { ok: true, value: rational(Number(numText), den) };
}

/**
 * Parse a typed answer into an exact rational.
 *
 * Accepted forms: integers ("42", "-7", "1,250"), decimals ("3.5", "-.25",
 * "6."), fractions ("3/4", "-15/8", "4/2") and mixed numbers ("1 3/4").
 * Whitespace around the slash is tolerated. Nothing else is.
 */
export function parseAnswer(raw: string): ParseResult {
  const text = raw.trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").replace(/^−/, "-");
  if (text === "") return fail("empty");

  const signMatch = /^([+-])?(.*)$/s.exec(text);
  const negative = signMatch?.[1] === "-";
  const body = signMatch?.[2] ?? "";
  if (body === "" || /^[+-]/.test(body)) return fail("invalid");

  let result: ParseResult;
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(body);
  if (mixed) {
    const [, wholeText = "", numText = "", denText = ""] = mixed;
    if (wholeText.length > 15) return fail("too-long");
    const fraction = parseUnsignedFraction(numText, denText);
    if (!fraction.ok) return fraction;
    result = { ok: true, value: add(fromInteger(Number(wholeText)), fraction.value) };
  } else if (body.includes("/")) {
    const parts = body.split("/");
    if (parts.length !== 2) return fail("invalid");
    result = parseUnsignedFraction(parts[0] ?? "", parts[1] ?? "");
  } else {
    if (body.includes(" ")) return fail("invalid");
    result = parseUnsignedDecimal(body);
  }

  if (!result.ok) return result;
  return { ok: true, value: negative ? neg(result.value) : result.value };
}
