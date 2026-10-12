"use client";

import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  type AdvancedField,
  type AdvancedSettings as AdvancedSettingsValue,
  DEFAULT_ADVANCED_SETTINGS,
  MAX_FRACTION_PART,
  MAX_OPERAND,
  MIN_FRACTION_PART,
  MIN_OPERAND,
  type NumericRange,
  mixTotal,
  validateAdvanced,
} from "@/lib/engine/advanced";
import {
  DEFAULT_FINANCE_MIX,
  FINANCE_ANSWER_STYLES,
  FINANCE_ANSWER_STYLE_LABELS,
  FINANCE_SUBTYPES,
  FINANCE_SUBTYPE_EXAMPLES,
  FINANCE_SUBTYPE_LABELS,
  FINANCE_VALUE_STYLES,
  FINANCE_VALUE_STYLE_LABELS,
  type FinanceSettings,
  type FinanceSubtype,
  MAX_FINANCE_AMOUNT,
  MIN_FINANCE_AMOUNT,
  financeMixTotal,
} from "@/lib/engine/finance";
import {
  ARITHMETIC_OPERATIONS,
  type ArithmeticOperation,
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  type NumberType,
  OPERATIONS,
  OPERATION_LABELS,
  OPERATION_SYMBOLS,
} from "@/lib/engine/types";
import { cx } from "@/lib/ui/cx";

/** Operand-size presets for lopsided multiplication, by digit count. */
const DIGIT_PRESETS: { label: string; first: NumericRange; second: NumericRange }[] = [
  { label: "2 × 1", first: { min: 10, max: 99 }, second: { min: 2, max: 9 } },
  { label: "3 × 2", first: { min: 100, max: 999 }, second: { min: 10, max: 99 } },
  { label: "4 × 3", first: { min: 1000, max: 9999 }, second: { min: 100, max: 999 } },
];

/** Equal shares across every finance family, with the remainder on the first. */
function evenFinanceMix(): Record<FinanceSubtype, number> {
  const base = Math.floor(100 / FINANCE_SUBTYPES.length);
  const mix = {} as Record<FinanceSubtype, number>;
  for (const subtype of FINANCE_SUBTYPES) mix[subtype] = base;
  const first = FINANCE_SUBTYPES[0];
  if (first) mix[first] = base + (100 - base * FINANCE_SUBTYPES.length);
  return mix;
}

interface AdvancedSettingsProps {
  value: AdvancedSettingsValue;
  onChange: (value: AdvancedSettingsValue) => void;
}

function Group({ title, hint, total, children }: { title: string; hint: ReactNode; total?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
        {total}
      </div>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{hint}</p>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function FieldError({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="text-xs leading-relaxed text-bad">
      {messages.join(" ")}
    </p>
  );
}

function NumberBox({
  id,
  label,
  value,
  min,
  max,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          onChange(Number.isNaN(next) ? 0 : Math.round(next));
        }}
        className={cx(
          "tabular h-9 w-24 rounded-lg border bg-surface px-2.5 font-mono text-sm text-ink focus:outline-none",
          invalid ? "border-bad focus:border-bad" : "border-line-strong focus:border-accent",
        )}
      />
    </span>
  );
}

function RangeRow({
  idBase,
  label,
  glyph,
  range,
  min,
  max,
  messages,
  onChange,
}: {
  idBase: string;
  label: string;
  glyph?: string;
  range: NumericRange;
  min: number;
  max: number;
  messages: string[];
  onChange: (range: NumericRange) => void;
}) {
  const errorId = `${idBase}-error`;
  const invalid = messages.length > 0;
  const describedBy = invalid ? errorId : undefined;
  return (
    <div className="rounded-lg border border-line bg-paper-deep/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-36 items-center gap-2 text-sm text-ink">
          {glyph && (
            <span aria-hidden="true" className="tabular w-4 text-center font-mono text-muted">
              {glyph}
            </span>
          )}
          {label}
        </span>
        <NumberBox
          id={`${idBase}-min`}
          label="Min"
          value={range.min}
          min={min}
          max={max}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(value) => onChange({ ...range, min: value })}
        />
        <NumberBox
          id={`${idBase}-max`}
          label="Max"
          value={range.max}
          min={min}
          max={max}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(value) => onChange({ ...range, max: value })}
        />
      </div>
      <FieldError id={errorId} messages={messages} />
    </div>
  );
}

function Total({ total }: { total: number }) {
  const ok = total === 100;
  return (
    <span
      aria-live="polite"
      className={cx(
        "tabular rounded-full border px-2.5 py-0.5 font-mono text-xs",
        ok ? "border-good/30 bg-good-soft text-good" : "border-bad/30 bg-bad-soft text-bad",
      )}
    >
      Total {total}%{ok ? "" : " — must be 100%"}
    </span>
  );
}

function ShareRow({
  id,
  label,
  glyph,
  hint,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  glyph?: string;
  hint?: string;
  value: number;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper-deep/40 px-3 py-2">
      <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm text-ink">
        {glyph && (
          <span aria-hidden="true" className="tabular w-4 shrink-0 text-center font-mono text-muted">
            {glyph}
          </span>
        )}
        <span className="min-w-0">
          {label}
          {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
        </span>
      </label>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            onChange(Number.isNaN(next) ? 0 : Math.round(next));
          }}
          className={cx(
            "tabular h-9 w-20 rounded-lg border bg-surface px-2.5 font-mono text-sm text-ink focus:outline-none",
            invalid ? "border-bad focus:border-bad" : "border-line-strong focus:border-accent",
          )}
        />
        <span className="text-sm text-muted">%</span>
      </span>
    </div>
  );
}

/**
 * Optional controls for operand ranges and the operation / number-format
 * split. Collapsed by default and inert until switched on, so ordinary
 * practice is unchanged for anyone who never opens it.
 */
export function AdvancedSettings({ value, onChange }: AdvancedSettingsProps) {
  const [open, setOpen] = useState<boolean | null>(null);
  const panelId = useId();
  const base = useId();
  // Until the section is touched it follows the saved state, which also means
  // it opens itself for anyone who already had advanced settings on.
  const expanded = open ?? value.enabled;

  const issues = validateAdvanced(value);
  const messagesFor = (field: AdvancedField) => issues.filter((issue) => issue.field === field).map((issue) => issue.message);
  const update = (patch: Partial<AdvancedSettingsValue>) => onChange({ ...value, ...patch });
  const updateFinance = (patch: Partial<FinanceSettings>) => update({ finance: { ...value.finance, ...patch } });
  const operationTotal = mixTotal(value.operationMix);
  const formatTotal = mixTotal(value.formatMix);
  const financeTotal = financeMixTotal(value.finance);
  const financeOn = value.operationMix.finance > 0;
  const operationMixErrors = messagesFor("operationMix");
  const formatMixErrors = messagesFor("formatMix");
  const financeMixErrors = messagesFor("financeMix");
  const operationMixErrorId = `${base}-operation-mix-error`;
  const formatMixErrorId = `${base}-format-mix-error`;
  const financeMixErrorId = `${base}-finance-mix-error`;

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpen(!expanded)}
        className={cx(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-paper-deep/60",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          expanded ? "bg-paper-deep/40" : "bg-surface",
        )}
      >
        <span aria-hidden="true" className={cx("text-muted transition-transform", expanded && "rotate-90")}>
          ▸
        </span>
        <span className="flex-1">
          <span className="text-sm font-semibold tracking-tight text-ink">Advanced settings</span>
          <span className="ml-2 text-xs text-muted">Number ranges, operation mix, number format mix, fraction ranges</span>
        </span>
        {value.enabled && (
          <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">On</span>
        )}
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-line bg-surface px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SegmentedControl
                label="Use advanced settings"
                value={value.enabled ? "on" : "off"}
                onChange={(next) => update({ enabled: next === "on" })}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" },
                ]}
              />
              <span className="text-xs text-muted">{value.enabled ? "These settings drive every question." : "Practice follows the difficulty tiers."}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_ADVANCED_SETTINGS, enabled: value.enabled })}>
              Reset to defaults
            </Button>
          </div>

          {!value.enabled ? (
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted">
              Switch this on to choose how large the operands are for each operation, what share of questions each operation and number format gets, and what
              fractions are built from. While it is off, questions come from the difficulty tiers exactly as they do now.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-line">
              <Group
                title="Operation mix"
                total={<Total total={operationTotal} />}
                hint="Share of questions per operation. Set an operation to 0% to leave it out — these percentages replace the Operations choice above."
              >
                {OPERATIONS.map((op) => (
                  <ShareRow
                    key={op}
                    id={`${base}-mix-${op}`}
                    label={OPERATION_LABELS[op]}
                    glyph={OPERATION_SYMBOLS[op]}
                    value={value.operationMix[op]}
                    invalid={operationMixErrors.length > 0}
                    describedBy={operationMixErrors.length > 0 ? operationMixErrorId : undefined}
                    onChange={(share) => update({ operationMix: { ...value.operationMix, [op]: share } })}
                  />
                ))}
                <FieldError id={operationMixErrorId} messages={operationMixErrors} />
              </Group>

              <Group
                title="Number format mix"
                total={<Total total={formatTotal} />}
                hint="Share of questions per number format, independent of the operation mix — so fractions appear across every operation you have chosen. Replaces the Numbers choice above."
              >
                {NUMBER_TYPES.map((type: NumberType) => (
                  <ShareRow
                    key={type}
                    id={`${base}-format-${type}`}
                    label={NUMBER_TYPE_LABELS[type]}
                    value={value.formatMix[type]}
                    invalid={formatMixErrors.length > 0}
                    describedBy={formatMixErrors.length > 0 ? formatMixErrorId : undefined}
                    onChange={(share) => update({ formatMix: { ...value.formatMix, [type]: share } })}
                  />
                ))}
                <FieldError id={formatMixErrorId} messages={formatMixErrors} />
              </Group>

              <Group
                title="Number ranges"
                hint={
                  <>
                    Smallest and largest operand for each operation — both operands of a question stay inside its range. Applies to integer questions; fractions use
                    the ranges below and decimals follow the difficulty tier. Division keeps whole answers, so its maximum must be at least twice its minimum.
                  </>
                }
              >
                {ARITHMETIC_OPERATIONS.map((op: ArithmeticOperation) => (
                  <RangeRow
                    key={op}
                    idBase={`${base}-range-${op}`}
                    label={OPERATION_LABELS[op]}
                    glyph={OPERATION_SYMBOLS[op]}
                    range={value.operandRanges[op]}
                    min={MIN_OPERAND}
                    max={MAX_OPERAND}
                    messages={messagesFor(`operandRange.${op}`)}
                    onChange={(range) => update({ operandRanges: { ...value.operandRanges, [op]: range } })}
                  />
                ))}

                <div className="rounded-lg border border-line bg-paper-deep/40 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-ink">
                      <span aria-hidden="true" className="tabular mr-2 font-mono text-muted">
                        ×
                      </span>
                      Multiplication operands
                    </span>
                    <SegmentedControl
                      label="Multiplication operand ranges"
                      value={value.multiplicationSecondRange === null ? "same" : "split"}
                      onChange={(next) =>
                        update({ multiplicationSecondRange: next === "same" ? null : { ...value.operandRanges.multiplication } })
                      }
                      options={[
                        { value: "same", label: "One range" },
                        { value: "split", label: "Separate" },
                      ]}
                    />
                  </div>
                  {value.multiplicationSecondRange !== null && (
                    <div className="mt-2.5 flex flex-col gap-2">
                      <RangeRow
                        idBase={`${base}-range-multiplication-second`}
                        label="Second operand"
                        range={value.multiplicationSecondRange}
                        min={MIN_OPERAND}
                        max={MAX_OPERAND}
                        messages={messagesFor("multiplicationSecondRange")}
                        onChange={(range) => update({ multiplicationSecondRange: range })}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted">Digit lengths:</span>
                        {DIGIT_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => update({ operandRanges: { ...value.operandRanges, multiplication: preset.first }, multiplicationSecondRange: preset.second })}
                            className="tabular h-7 rounded-md border border-line-strong bg-surface px-2 font-mono text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Separate ranges give each operand its own size, which is how lopsided products such as four-digit × three-digit are practised.
                  </p>
                </div>
              </Group>

              <Group
                title="Fraction ranges"
                hint="Bounds for the numerator and denominator of every fraction operand. Denominators start at 1 and can never be zero. Numerators at or above the denominator are allowed, so improper fractions such as 7/4 can appear."
              >
                <RangeRow
                  idBase={`${base}-fraction-numerator`}
                  label="Numerator"
                  range={value.fractionRanges.numerator}
                  min={MIN_FRACTION_PART}
                  max={MAX_FRACTION_PART}
                  messages={messagesFor("fractionRanges.numerator")}
                  onChange={(numerator) => update({ fractionRanges: { ...value.fractionRanges, numerator } })}
                />
                <RangeRow
                  idBase={`${base}-fraction-denominator`}
                  label="Denominator"
                  range={value.fractionRanges.denominator}
                  min={MIN_FRACTION_PART}
                  max={MAX_FRACTION_PART}
                  messages={messagesFor("fractionRanges.denominator")}
                  onChange={(denominator) => update({ fractionRanges: { ...value.fractionRanges, denominator } })}
                />
              </Group>

              <Group
                title="Finance maths"
                total={financeOn ? <Total total={financeTotal} /> : undefined}
                hint={
                  financeOn ? (
                    "Share of finance questions per family, and how their numbers are drawn. Set a family to 0% to leave it out."
                  ) : (
                    <>
                      Give Finance maths a share of the operation mix above to switch these on. The families below are then mixed into ordinary practice.
                    </>
                  )
                }
              >
                {financeOn && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">Quick set:</span>
                      <Button variant="secondary" size="sm" onClick={() => updateFinance({ subtypeMix: DEFAULT_FINANCE_MIX })}>
                        Core families
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => updateFinance({ subtypeMix: evenFinanceMix() })}>
                        Even spread
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FINANCE_SUBTYPES.map((subtype) => (
                        <ShareRow
                          key={subtype}
                          id={`${base}-finance-${subtype}`}
                          label={FINANCE_SUBTYPE_LABELS[subtype]}
                          hint={FINANCE_SUBTYPE_EXAMPLES[subtype]}
                          value={value.finance.subtypeMix[subtype]}
                          invalid={financeMixErrors.length > 0}
                          describedBy={financeMixErrors.length > 0 ? financeMixErrorId : undefined}
                          onChange={(sharePercent) => updateFinance({ subtypeMix: { ...value.finance.subtypeMix, [subtype]: sharePercent } })}
                        />
                      ))}
                    </div>
                    <FieldError id={financeMixErrorId} messages={financeMixErrors} />

                    <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper-deep/40 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        Values
                        <SegmentedControl
                          label="Finance value style"
                          value={value.finance.valueStyle}
                          onChange={(valueStyle) => updateFinance({ valueStyle })}
                          options={FINANCE_VALUE_STYLES.map((style) => ({ value: style, label: FINANCE_VALUE_STYLE_LABELS[style] }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        Answers
                        <SegmentedControl
                          label="Finance answer style"
                          value={value.finance.answerStyle}
                          onChange={(answerStyle) => updateFinance({ answerStyle })}
                          options={FINANCE_ANSWER_STYLES.map((style) => ({ value: style, label: FINANCE_ANSWER_STYLE_LABELS[style] }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        Rounding
                        <SegmentedControl
                          label="Finance rounding"
                          value={String(value.finance.rounding)}
                          onChange={(rounding) => updateFinance({ rounding: Number(rounding) })}
                          options={[
                            { value: "0", label: "Whole" },
                            { value: "1", label: "1 dp" },
                            { value: "2", label: "2 dp" },
                          ]}
                        />
                      </label>
                    </div>
                    <RangeRow
                      idBase={`${base}-finance-amount`}
                      label="Amounts and bases"
                      range={value.finance.amountRange}
                      min={MIN_FINANCE_AMOUNT}
                      max={MAX_FINANCE_AMOUNT}
                      messages={messagesFor("financeAmountRange")}
                      onChange={(amountRange) => updateFinance({ amountRange })}
                    />
                    <p className="text-xs leading-relaxed text-muted">
                      Every question states its units and says when to round. Estimates accept anything inside the band shown on the question. Difficulty still
                      decides how friendly the percentages are and how many steps a question takes.
                    </p>
                  </>
                )}
              </Group>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
