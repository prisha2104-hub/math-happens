import { formatRational } from "@/lib/math/format";
import {
  type Rational,
  abs,
  add,
  compare,
  div,
  equals,
  fromInteger,
  isInteger,
  isNegative,
  isZero,
  mul,
  neg,
  rational,
  sub,
  terminatingDecimalPlaces,
  toNumber,
} from "@/lib/math/rational";
import { MAX_FINANCE_AMOUNT, MIN_FINANCE_AMOUNT, type FinanceSettings, type FinanceSubtype, activeFinanceSubtypes } from "../finance";
import type { Rng } from "../rng";
import type { Difficulty, FinanceMeta, NumberType } from "../types";
import { type AnswerUnit, estimationBand, formatWithUnit, roundTo } from "../units";

/**
 * Finance maths question templates.
 *
 * A question is fully described by its `FinanceMeta`: the family, which form
 * of it was asked, the exact prompt numbers, the rounding and whether an
 * estimate counts. Everything the user sees — prompt, answer, units,
 * explanation — is *derived* from that by `renderFinance`, so a stored
 * attempt can be re-explained months later without having kept any text, and
 * the review explanation is guaranteed to match the question that was asked.
 *
 * Numbers are exact rationals throughout: percentages of amounts, successive
 * returns and compounding all stay exact and are only rounded at the very end,
 * to the place the question explicitly asks for.
 */

const int = fromInteger;
const HUNDRED = int(100);
const ONE = int(1);

/** A number with at most two decimals, exactly. */
function fromDecimal(value: number): Rational {
  return rational(Math.round(value * 100), 100);
}

const num = (value: Rational): string => formatRational(value, "decimal");
const frac = (value: Rational): string => formatRational(value, "fraction");
const pct = (value: Rational): string => `${num(value)}%`;
const money = (value: Rational): string => (isNegative(value) ? `-$${num(abs(value))}` : `$${num(value)}`);
const moneyM = (value: Rational): string => `${money(value)}m`;
const share = (value: Rational): Rational => div(value, HUNDRED);

/**
 * A working value inside an explanation: exact when it can be written as a
 * short decimal, otherwise an honest approximation rather than a fraction
 * nobody would write down mid-calculation.
 */
function working(value: Rational): string {
  const places = terminatingDecimalPlaces(value);
  return places !== null && places <= 4 ? num(value) : `≈${toNumber(value).toFixed(3)}`;
}

/** Division that never throws; a zero divisor yields zero, which the pickers avoid. */
function safeDiv(a: Rational, b: Rational): Rational {
  return isZero(b) ? int(0) : div(a, b);
}

function power(base: Rational, exponent: number): Rational {
  let out = ONE;
  for (let i = 0; i < Math.max(0, Math.min(6, Math.round(exponent))); i += 1) out = mul(out, base);
  return out;
}

export interface FinanceSpec extends FinanceMeta {
  subtype: FinanceSubtype;
}

export interface RenderedFinance {
  /** The question as the user reads it. */
  prompt: string;
  /** Rounding, sign and estimation notes; null when the answer is plainly exact. */
  instruction: string | null;
  /** Compact canonical form for tables and duplicate detection, e.g. "25% of 76". */
  expression: string;
  /** Exact value before rounding. */
  exact: Rational;
  /** The answer as asked for: `exact` rounded to `places`. */
  answer: Rational;
  answerText: string;
  unit: AnswerUnit;
  places: number;
  /** Absolute band accepted around the answer, or null when it must be exact. */
  tolerance: Rational | null;
  /** Two or three short steps that arrive at the answer. */
  explanation: string[];
  numberType: NumberType;
  key: string;
}

interface Template {
  prompt: string;
  expression: string;
  exact: Rational;
  unit: AnswerUnit;
  /**
   * Worked steps, given the answer as the question actually wants it written.
   * Taking it as an argument is what guarantees the explanation finishes at
   * the answer the user was marked against, rounding included.
   */
  explain: (final: string) => string[];
  /** True when the answer can sensibly be negative, so the prompt says so. */
  signed?: boolean;
}

/* ---------- templates ---------- */

function percentOf(inputs: readonly Rational[]): Template {
  const [p = int(10), base = int(100)] = inputs;
  const exact = mul(base, share(p));
  const tenth = div(base, int(10));
  const unitFraction = share(p);
  const explain = (final: string): string[] => {
    if (isInteger(p) && unitFraction.num === 1) {
      // 25% → 1/4, 20% → 1/5: one division does it.
      return [`${pct(p)} is 1/${unitFraction.den} of the number.`, `${num(base)} ÷ ${unitFraction.den} = ${final}.`];
    }
    if (isInteger(p) && p.num % 10 === 0) {
      return [`10% of ${num(base)} is ${working(tenth)}.`, `${pct(p)} is ${p.num / 10} × ${working(tenth)} = ${final}.`];
    }
    if (isInteger(p) && p.num % 5 === 0) {
      const tens = int(p.num - 5);
      return [
        `10% of ${num(base)} is ${working(tenth)}, so ${pct(tens)} is ${working(mul(base, share(tens)))}.`,
        `5% is half of 10%: ${working(div(tenth, int(2)))}.`,
        `Adding them gives ${final}.`,
      ];
    }
    return [`1% of ${num(base)} is ${working(div(base, HUNDRED))}.`, `${num(p)} × ${working(div(base, HUNDRED))} = ${final}.`];
  };
  return { prompt: `What is ${pct(p)} of ${num(base)}?`, expression: `${pct(p)} of ${num(base)}`, exact, unit: "plain", explain };
}

function reversePercent(inputs: readonly Rational[]): Template {
  const [part = int(10), p = int(10)] = inputs;
  const exact = safeDiv(mul(part, HUNDRED), p);
  const unitFraction = share(p);
  const onePercent = safeDiv(part, p);
  const explain = (final: string): string[] =>
    isInteger(p) && unitFraction.num === 1
      ? [`${pct(p)} is 1/${unitFraction.den} of the whole.`, `${num(part)} × ${unitFraction.den} = ${final}.`]
      : [`1% is ${num(part)} ÷ ${num(p)} = ${working(onePercent)}.`, `100% is ${working(onePercent)} × 100 = ${final}.`];
  return { prompt: `${num(part)} is ${pct(p)} of what number?`, expression: `${num(part)} is ${pct(p)} of ?`, exact, unit: "plain", explain };
}

function percentChange(inputs: readonly Rational[]): Template {
  const [from = int(100), to = int(110)] = inputs;
  const rising = compare(to, from) >= 0;
  const changed = abs(sub(to, from));
  const exact = safeDiv(mul(changed, HUNDRED), from);
  const ratio = safeDiv(changed, from);
  const word = rising ? "gain" : "loss";
  return {
    prompt: `A stock ${rising ? "rises" : "falls"} from ${money(from)} to ${money(to)}. What is the percentage ${word}?`,
    expression: `${money(from)} → ${money(to)} % ${word}`,
    exact,
    unit: "percent",
    explain: (final) => [
      `The change is ${money(changed)} on a starting value of ${money(from)}.`,
      `${num(changed)} ÷ ${num(from)} = ${working(ratio)}, a ${final} ${word}.`,
    ],
  };
}

function fractionToPercent(inputs: readonly Rational[], mode: string): Template {
  const [value = rational(1, 2)] = inputs;
  const exact = mul(value, HUNDRED);
  if (mode === "decimal") {
    return {
      prompt: `Express ${num(value)} as a percentage.`,
      expression: `${num(value)} → %`,
      exact,
      unit: "percent",
      explain: (final) => [`A percentage is hundredths, so move the point two places: ${num(value)} → ${final}.`],
    };
  }
  const unitPercent = safeDiv(HUNDRED, int(value.den));
  const explain = (final: string): string[] =>
    value.num === 1
      ? [`1/${value.den} is ${final}.`]
      : [`1/${value.den} is ${working(unitPercent)}%.`, `${value.num} × ${working(unitPercent)}% = ${final}.`];
  return { prompt: `Express ${frac(value)} as a percentage.`, expression: `${frac(value)} → %`, exact, unit: "percent", explain };
}

function weightedAverage(inputs: readonly Rational[]): Template {
  const [weight = int(50), first = int(10), second = int(0)] = inputs;
  const otherWeight = sub(HUNDRED, weight);
  const firstPart = mul(share(weight), first);
  const secondPart = mul(share(otherWeight), second);
  const exact = add(firstPart, secondPart);
  const describe = (r: Rational) => (isNegative(r) ? `loses ${pct(abs(r))}` : `returns ${pct(r)}`);
  return {
    prompt: `${pct(weight)} of a portfolio ${describe(first)} and the rest ${describe(second)}. What is the portfolio return?`,
    expression: `${pct(weight)} @ ${pct(first)}, ${pct(otherWeight)} @ ${pct(second)}`,
    exact,
    unit: "percent",
    signed: true,
    explain: (final) => [
      `${num(share(weight))} × ${pct(first)} = ${working(firstPart)}%.`,
      `${num(share(otherWeight))} × ${pct(second)} = ${working(secondPart)}%.`,
      isNegative(secondPart)
        ? `${working(firstPart)}% − ${working(abs(secondPart))}% = ${final}.`
        : `${working(firstPart)}% + ${working(secondPart)}% = ${final}.`,
    ],
  };
}

function successiveReturns(inputs: readonly Rational[]): Template {
  const [first = int(10), second = int(-10)] = inputs;
  const firstFactor = add(ONE, share(first));
  const secondFactor = add(ONE, share(second));
  const product = mul(firstFactor, secondFactor);
  const describe = (r: Rational) => (isNegative(r) ? `falls ${pct(abs(r))}` : `rises ${pct(r)}`);
  return {
    prompt: `An investment ${describe(first)}, then ${describe(second)}. What is the overall return?`,
    expression: `${pct(first)} then ${pct(second)}`,
    exact: mul(sub(product, ONE), HUNDRED),
    unit: "percent",
    signed: true,
    explain: (final) => [
      `Multiply the factors: ${num(firstFactor)} × ${num(secondFactor)} = ${working(product)}.`,
      `${working(product)} of the starting value is ${final} overall, not ${pct(add(first, second))}.`,
    ],
  };
}

function basisPoints(inputs: readonly Rational[], mode: string): Template {
  const [from = fromDecimal(4), to = fromDecimal(4.5)] = inputs;
  const rising = compare(to, from) >= 0;
  const points = abs(sub(to, from));
  const asBps = mode !== "pp";
  const verb = rising ? "rise" : "fall";
  return {
    prompt: `A yield ${rising ? "rises" : "falls"} from ${pct(from)} to ${pct(to)}. How many ${asBps ? "basis points" : "percentage points"} did it ${verb}?`,
    expression: `${pct(from)} → ${pct(to)} in ${asBps ? "bps" : "pp"}`,
    exact: asBps ? mul(points, HUNDRED) : points,
    unit: asBps ? "basis-points" : "percentage-points",
    explain: (final) =>
      asBps
        ? [`${pct(to)} − ${pct(from)} = ${working(points)} percentage points.`, `One percentage point is 100 basis points: ${final}.`]
        : [`${pct(to)} − ${pct(from)} = ${final}. Points are a difference in yield, not a percentage of it.`],
  };
}

function profitMargin(inputs: readonly Rational[], mode: string): Template {
  const [revenue = int(100), second = int(20)] = inputs;
  const fromCosts = mode === "costs";
  const profit = fromCosts ? sub(revenue, second) : second;
  const exact = safeDiv(mul(profit, HUNDRED), revenue);
  const ratio = safeDiv(profit, revenue);
  return {
    prompt: fromCosts
      ? `Revenue is ${money(revenue)} and costs are ${money(second)}. What is the profit margin?`
      : `Revenue is ${money(revenue)} and profit is ${money(second)}. What is the profit margin?`,
    expression: `${money(profit)} / ${money(revenue)} margin`,
    exact,
    unit: "percent",
    explain: (final) =>
      fromCosts
        ? [`${money(revenue)} − ${money(second)} = ${money(profit)} of profit.`, `${num(profit)} ÷ ${num(revenue)} = ${working(ratio)} → ${final}.`]
        : [`Margin is profit over revenue: ${num(profit)} ÷ ${num(revenue)} = ${working(ratio)}.`, `As a percentage that is ${final}.`],
  };
}

function valuationMultiple(inputs: readonly Rational[], mode: string): Template {
  const [top = int(84), bottom = int(7)] = inputs;
  if (mode === "price-from-pe") {
    return {
      prompt: `A company earns EPS of ${money(top)} and trades on a P/E of ${num(bottom)}×. What is its share price?`,
      expression: `EPS ${money(top)} × ${num(bottom)}× P/E`,
      exact: mul(top, bottom),
      unit: "currency",
      explain: (final) => ["Price is EPS × P/E.", `${num(top)} × ${num(bottom)} = ${final}.`],
    };
  }
  const evEbitda = mode === "ev-ebitda";
  return {
    prompt: evEbitda
      ? `A company has an enterprise value of ${moneyM(top)} and EBITDA of ${moneyM(bottom)}. What is its EV/EBITDA?`
      : `A stock trades at ${money(top)} with EPS of ${money(bottom)}. What is its P/E?`,
    expression: evEbitda ? `${moneyM(top)} / ${moneyM(bottom)} EV/EBITDA` : `${money(top)} / ${money(bottom)} P/E`,
    exact: safeDiv(top, bottom),
    unit: "multiple",
    explain: (final) => [
      `${evEbitda ? "EV/EBITDA" : "P/E"} divides the value by the earnings figure.`,
      `${num(top)} ÷ ${num(bottom)} = ${final}.`,
    ],
  };
}

function enterpriseValue(inputs: readonly Rational[], mode: string): Template {
  const [headline = int(500), debt = int(100), cash = int(30)] = inputs;
  if (mode === "equity") {
    return {
      prompt: `Enterprise value is ${moneyM(headline)}, debt is ${moneyM(debt)} and cash is ${moneyM(cash)}. Assuming no other adjustments, what is equity value?`,
      expression: `EV ${moneyM(headline)} − debt ${moneyM(debt)} + cash ${moneyM(cash)}`,
      exact: add(sub(headline, debt), cash),
      unit: "currency-millions",
      explain: (final) => ["Equity value = enterprise value − debt + cash.", `${num(headline)} − ${num(debt)} + ${num(cash)} = ${final}.`],
    };
  }
  return {
    prompt: `Equity value is ${moneyM(headline)}, debt is ${moneyM(debt)} and cash is ${moneyM(cash)}. Assuming no other adjustments, what is enterprise value?`,
    expression: `Equity ${moneyM(headline)} + debt ${moneyM(debt)} − cash ${moneyM(cash)}`,
    exact: sub(add(headline, debt), cash),
    unit: "currency-millions",
    explain: (final) => ["Enterprise value = equity value + debt − cash.", `${num(headline)} + ${num(debt)} − ${num(cash)} = ${final}.`],
  };
}

function expectedValue(inputs: readonly Rational[]): Template {
  const [chance = int(50), win = int(10), loss = int(10)] = inputs;
  const winShare = share(chance);
  const lossShare = sub(ONE, winShare);
  const gain = mul(winShare, win);
  const give = mul(lossShare, loss);
  return {
    prompt: `A trade has a ${pct(chance)} chance of making ${money(win)} and otherwise loses ${money(loss)}. What is the expected profit?`,
    expression: `${pct(chance)} × ${money(win)} − ${pct(sub(HUNDRED, chance))} × ${money(loss)}`,
    exact: sub(gain, give),
    unit: "currency",
    signed: true,
    explain: (final) => [
      `${num(winShare)} × ${money(win)} = ${money(gain)}.`,
      `${num(lossShare)} × ${money(loss)} = ${money(give)} against you.`,
      `${money(gain)} − ${money(give)} = ${final}.`,
    ],
  };
}

function compounding(inputs: readonly Rational[], mode: string): Template {
  const [principal = int(100), rate = int(10), yearsInput = int(2)] = inputs;
  const years = Math.max(1, Math.min(5, Math.round(toNumber(yearsInput))));
  const factor = add(ONE, share(rate));
  const growth = power(factor, years);
  if (mode === "total-return") {
    return {
      prompt: `An investment returns ${pct(rate)} a year for ${years} years. What is the total return?`,
      expression: `${pct(rate)} compounded ${years}y`,
      exact: mul(sub(growth, ONE), HUNDRED),
      unit: "percent",
      explain: (final) => [
        `${num(factor)} to the power of ${years} is ${working(growth)}.`,
        `That is ${final} in total, not ${pct(mul(rate, int(years)))}.`,
      ],
    };
  }
  const chain: string[] = [];
  let running = principal;
  for (let year = 0; year < years; year += 1) {
    running = mul(running, factor);
    chain.push(money(running));
  }
  return {
    prompt: `${money(principal)} is invested at ${pct(rate)} a year. What is it worth after ${years} years?`,
    expression: `${money(principal)} at ${pct(rate)} for ${years}y`,
    exact: mul(principal, growth),
    unit: "currency",
    explain: (final) => [`Grow by ${num(factor)} each year: ${money(principal)} → ${chain.join(" → ")}.`, `After ${years} years it is ${final}.`],
  };
}

function template(subtype: FinanceSubtype, inputs: readonly Rational[], mode: string): Template {
  switch (subtype) {
    case "percent-of":
      return percentOf(inputs);
    case "reverse-percent":
      return reversePercent(inputs);
    case "percent-change":
      return percentChange(inputs);
    case "fraction-to-percent":
      return fractionToPercent(inputs, mode);
    case "weighted-average":
      return weightedAverage(inputs);
    case "successive-returns":
      return successiveReturns(inputs);
    case "basis-points":
      return basisPoints(inputs, mode);
    case "profit-margin":
      return profitMargin(inputs, mode);
    case "valuation-multiple":
      return valuationMultiple(inputs, mode);
    case "enterprise-value":
      return enterpriseValue(inputs, mode);
    case "expected-value":
      return expectedValue(inputs);
    case "compounding":
      return compounding(inputs, mode);
  }
}

function placesPhrase(places: number, unit: AnswerUnit): string {
  if (places <= 0) return unit === "percent" ? "to the nearest whole percent" : "to the nearest whole number";
  return `to ${places} decimal place${places === 1 ? "" : "s"}`;
}

/** Everything the user sees, derived from the stored description of the question. */
export function renderFinance(spec: FinanceSpec): RenderedFinance {
  const places = Math.max(0, Math.min(4, Math.round(spec.places)));
  const { prompt, expression, exact, unit, explain, signed } = template(spec.subtype, spec.inputs, spec.mode);
  const answer = roundTo(exact, places);
  const answerText = formatWithUnit(answer, unit);
  const tolerance = spec.estimate ? estimationBand(answer, places) : null;
  const notes: string[] = [];
  if (tolerance !== null) notes.push(`Estimate: anything within ±${formatWithUnit(tolerance, unit)} counts.`);
  else if (!equals(answer, exact)) notes.push(`Round ${placesPhrase(places, unit)}.`);
  if (signed) notes.push("Use a minus sign for a loss.");

  const integerInputs = spec.inputs.every((value) => isInteger(value));
  return {
    prompt,
    instruction: notes.length > 0 ? notes.join(" ") : null,
    expression,
    exact,
    answer,
    answerText,
    unit,
    places,
    tolerance,
    explanation: explain(answerText),
    numberType: integerInputs && isInteger(answer) ? "integer" : "decimal",
    key: `fin|${spec.subtype}|${spec.mode}|${spec.inputs.map((v) => `${v.num}/${v.den}`).join(",")}`,
  };
}

/* ---------- input pickers ---------- */

const PERCENT_POOLS: Record<Difficulty, number[]> = {
  easy: [5, 10, 20, 25, 50, 75],
  medium: [12, 15, 30, 35, 40, 60, 80, 90],
  hard: [7, 13, 17, 23, 37.5, 62.5, 110, 140],
};

/**
 * Returns used in weighted averages and successive returns. Easy values are
 * multiples of ten so products and compounded factors stay exact to one
 * decimal place; the harder pools deliberately do not.
 */
const RETURN_POOLS: Record<Difficulty, number[]> = {
  easy: [10, 20, 50],
  medium: [5, 15, 30, 40, 60, 80],
  hard: [12.5, 17, 24, 35, 45, 120],
};

const FRACTION_POOLS: Record<Difficulty, [number, number][]> = {
  easy: [
    [1, 2],
    [1, 4],
    [3, 4],
    [1, 5],
    [2, 5],
    [3, 10],
    [7, 10],
  ],
  medium: [
    [1, 8],
    [3, 8],
    [5, 8],
    [7, 8],
    [1, 20],
    [9, 20],
    [3, 5],
    [1, 25],
  ],
  hard: [
    [1, 16],
    [5, 16],
    [7, 16],
    [1, 40],
    [11, 40],
    [5, 6],
    [2, 3],
    [1, 12],
  ],
};

function clampAmountRange(range: FinanceSettings["amountRange"]): [number, number] {
  const min = Math.max(MIN_FINANCE_AMOUNT, Math.min(MAX_FINANCE_AMOUNT, Math.round(range.min) || MIN_FINANCE_AMOUNT));
  const max = Math.max(min, Math.min(MAX_FINANCE_AMOUNT, Math.round(range.max) || min));
  return [min, max];
}

interface Picker {
  rng: Rng;
  difficulty: Difficulty;
  settings: FinanceSettings;
}

/**
 * An amount inside the configured range that is a multiple of `step`, so the
 * answer comes out exact. With `tenths` the multiple is drawn ten times
 * larger and shifted one place, which gives a decimal amount whose answer is
 * still exact (76.8 at 25% is 19.2).
 */
function amount(picker: Picker, step = 1, { cap = MAX_FINANCE_AMOUNT, tenths = false }: { cap?: number; tenths?: boolean } = {}): Rational {
  const [min, max] = clampAmountRange(picker.settings.amountRange);
  const scale = tenths ? 10 : 1;
  const top = Math.max(step, Math.min(max, cap) * scale);
  const lowest = Math.ceil(Math.max(min * scale, step) / step);
  const highest = Math.floor(top / step);
  const multiple = highest < lowest ? Math.max(1, highest) : picker.rng.int(lowest, highest);
  return rational(multiple * step, scale);
}

/** Whether this question should use a value with a decimal place. */
function wantsDecimal({ rng, settings }: Picker): boolean {
  if (settings.valueStyle === "whole") return false;
  if (settings.valueStyle === "decimal") return true;
  return rng.chance(0.3);
}

function pickPercent({ rng, difficulty }: Picker): Rational {
  return fromDecimal(rng.pick(PERCENT_POOLS[difficulty]));
}

function pickReturn({ rng, difficulty }: Picker, allowNegative = true): Rational {
  const magnitude = fromDecimal(rng.pick(RETURN_POOLS[difficulty]));
  return allowNegative && rng.chance(0.45) ? neg(magnitude) : magnitude;
}

function pickFraction({ rng, difficulty }: Picker): Rational {
  const [numerator = 1, denominator = 2] = rng.pick(FRACTION_POOLS[difficulty]);
  return rational(numerator, denominator);
}

/**
 * A base for "p% of base" that keeps the answer exact. The share in lowest
 * terms has denominator d, so any multiple of d gives a whole answer; on hard
 * the base is free, which is what makes rounding instructions appear.
 */
function baseForPercent(picker: Picker, percentage: Rational): Rational {
  const step = share(percentage).den;
  // On hard, an unfriendly base is the point: the answer then needs rounding.
  if (picker.difficulty === "hard" && picker.rng.chance(0.4)) return amount(picker);
  return amount(picker, step, { tenths: picker.difficulty !== "easy" && wantsDecimal(picker) });
}

type InputPicker = (picker: Picker) => { inputs: Rational[]; mode: string };

const PICKERS: Record<FinanceSubtype, InputPicker> = {
  "percent-of": (p) => {
    const percentage = pickPercent(p);
    return { inputs: [percentage, baseForPercent(p, percentage)], mode: "" };
  },
  "reverse-percent": (p) => {
    const percentage = pickPercent(p);
    // Build the whole first so the part is a clean number to read out.
    const whole = amount(p, share(percentage).den);
    return { inputs: [mul(whole, share(percentage)), percentage], mode: "" };
  },
  "percent-change": (p) => {
    const percentage = pickPercent(p);
    const from = amount(p, share(percentage).den, { cap: 2000 });
    const changed = mul(from, share(percentage));
    const rising = p.rng.chance(0.6);
    return { inputs: [from, rising ? add(from, changed) : sub(from, changed)], mode: "" };
  },
  "fraction-to-percent": (p) => {
    if (p.difficulty !== "easy" && p.rng.chance(0.35)) {
      const decimals = p.difficulty === "hard" ? [0.045, 0.125, 0.375, 1.25, 0.08] : [0.05, 0.25, 0.4, 0.75, 0.6, 1.2];
      return { inputs: [fromDecimal(p.rng.pick(decimals))], mode: "decimal" };
    }
    return { inputs: [pickFraction(p)], mode: "fraction" };
  },
  "weighted-average": (p) => {
    const weight = int(p.rng.pick(p.difficulty === "easy" ? [50, 25, 75, 20, 80] : p.difficulty === "medium" ? [40, 60, 30, 70, 10, 90] : [35, 45, 55, 65, 15, 85]));
    // Easy weights are quarters and fifths, which keep the weighted parts exact.
    const first = pickReturn(p, p.difficulty !== "easy");
    let second = pickReturn(p);
    if (equals(first, second)) second = neg(second);
    return { inputs: [weight, first, second], mode: "" };
  },
  "successive-returns": (p) => {
    const first = pickReturn(p);
    const second = p.rng.chance(0.5) ? neg(first) : pickReturn(p);
    return { inputs: [first, second], mode: "" };
  },
  "basis-points": (p) => {
    // Work in basis points so both yields land on a readable two-decimal
    // percentage: 425 bps → 4.25%.
    const asPoints = p.rng.chance(0.25);
    const grid = p.difficulty === "easy" ? 25 : p.difficulty === "medium" ? 5 : 1;
    // A move asked for in percentage points has to be writable at the rounding
    // the user chose (0.1 pp needs one place, 0.35 pp two), so it is snapped to
    // that precision instead of to the difficulty grid.
    const step = asPoints ? 10 ** (2 - Math.max(0, Math.min(2, Math.round(p.settings.rounding)))) : grid;
    const fromBps = p.rng.int(Math.ceil(100 / grid), Math.floor(900 / grid)) * grid;
    const moveBps = p.rng.int(1, p.difficulty === "easy" ? 4 : p.difficulty === "medium" ? 12 : 60) * step;
    const rising = p.rng.chance(0.65);
    const toBps = rising ? fromBps + moveBps : Math.max(step, fromBps - moveBps);
    return { inputs: [rational(fromBps, 100), rational(toBps, 100)], mode: asPoints ? "pp" : "bps" };
  },
  "profit-margin": (p) => {
    const percentage = fromDecimal(p.rng.pick(p.difficulty === "easy" ? [10, 20, 25, 50] : p.difficulty === "medium" ? [8, 12, 15, 16, 30, 40] : [7, 13, 17, 22, 37.5]));
    const revenue = amount(p, Math.max(10, share(percentage).den), { cap: 5000 });
    const profit = mul(revenue, share(percentage));
    const fromCosts = p.difficulty !== "easy" && p.rng.chance(0.4);
    return { inputs: [revenue, fromCosts ? sub(revenue, profit) : profit], mode: fromCosts ? "costs" : "" };
  },
  "valuation-multiple": (p) => {
    const multiple = int(p.rng.pick(p.difficulty === "easy" ? [4, 5, 8, 10, 12] : p.difficulty === "medium" ? [6, 9, 11, 14, 15, 18] : [7, 13, 16, 17, 21, 24]));
    if (p.rng.chance(0.3)) {
      const ebitda = amount(p, 5, { cap: 400 });
      return { inputs: [mul(ebitda, multiple), ebitda], mode: "ev-ebitda" };
    }
    const perShare = p.difficulty === "easy" ? int(p.rng.int(2, 9)) : p.rng.chance(0.4) ? rational(p.rng.int(10, 80), 10) : int(p.rng.int(2, 25));
    if (p.difficulty !== "easy" && p.rng.chance(0.25)) return { inputs: [perShare, multiple], mode: "price-from-pe" };
    return { inputs: [mul(perShare, multiple), perShare], mode: "pe" };
  },
  "enterprise-value": (p) => {
    const equity = amount(p, 10, { cap: 5000 });
    const debt = amount(p, 10, { cap: Math.max(20, Math.round(toNumber(equity) / 2)) });
    const cash = amount(p, 5, { cap: Math.max(5, Math.round(toNumber(debt))) });
    const asEquity = p.rng.chance(0.35);
    const ev = sub(add(equity, debt), cash);
    return { inputs: asEquity ? [ev, debt, cash] : [equity, debt, cash], mode: asEquity ? "equity" : "ev" };
  },
  "expected-value": (p) => {
    const chance = int(p.rng.pick(p.difficulty === "easy" ? [50, 25, 20, 10] : p.difficulty === "medium" ? [40, 60, 30, 70, 80] : [35, 45, 55, 65, 15]));
    // Both legs are multiples of the chance denominator, so the expected
    // value stays a round amount of money.
    const step = share(chance).den;
    const win = amount(p, step, { cap: 500 });
    const loss = amount(p, step, { cap: Math.max(step, Math.round(toNumber(win))) });
    return { inputs: [chance, win, loss], mode: "" };
  },
  compounding: (p) => {
    const rate = int(p.rng.pick(p.difficulty === "easy" ? [10, 20, 50] : p.difficulty === "medium" ? [5, 10, 20, 25] : [8, 12, 15, 30]));
    const years = p.difficulty === "hard" ? p.rng.int(2, 3) : 2;
    const principal = amount(p, 50, { cap: 2000 });
    const asReturn = p.difficulty !== "easy" && p.rng.chance(0.4);
    return { inputs: asReturn ? [int(100), rate, int(years)] : [principal, rate, int(years)], mode: asReturn ? "total-return" : "" };
  },
};

function weightedSubtype(rng: Rng, settings: FinanceSettings): FinanceSubtype {
  const active = activeFinanceSubtypes(settings);
  const pool = active.length > 0 ? active : (["percent-of"] as FinanceSubtype[]);
  const total = pool.reduce((sum, subtype) => sum + Math.max(0, settings.subtypeMix[subtype]), 0);
  if (total <= 0) return rng.pick(pool);
  let roll = rng.next() * total;
  for (const subtype of pool) {
    roll -= Math.max(0, settings.subtypeMix[subtype]);
    if (roll <= 0) return subtype;
  }
  return pool[pool.length - 1] as FinanceSubtype;
}

/**
 * Choose the smallest number of decimal places that states the answer
 * exactly, up to the configured limit. An answer that does not fit gets the
 * limit and, with it, an explicit rounding instruction.
 */
function placesFor(exact: Rational, limit: number): number {
  for (let places = 0; places <= limit; places += 1) {
    if (equals(roundTo(exact, places), exact)) return places;
  }
  return limit;
}

export interface FinanceGenerateOptions {
  rng: Rng;
  settings: FinanceSettings;
  difficulty: Difficulty;
  /** Draw this family instead of sampling the mix (used by targeted practice). */
  subtype?: FinanceSubtype | null;
}

/** Draw one finance question description from the settings. */
export function generateFinanceSpec({ rng, settings, difficulty, subtype = null }: FinanceGenerateOptions): FinanceSpec {
  const chosen = subtype ?? weightedSubtype(rng, settings);
  const picker: Picker = { rng, difficulty, settings };
  const { inputs, mode } = PICKERS[chosen](picker);
  const { exact } = template(chosen, inputs, mode);
  const limit = Math.max(0, Math.min(2, Math.round(settings.rounding)));
  return { subtype: chosen, mode, inputs, places: placesFor(exact, limit), estimate: settings.answerStyle === "estimate" };
}
