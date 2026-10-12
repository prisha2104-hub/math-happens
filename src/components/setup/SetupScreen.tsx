"use client";

import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ToggleChip } from "@/components/ui/ToggleChip";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  OPERATIONS,
  OPERATION_LABELS,
  OPERATION_SYMBOLS,
} from "@/lib/engine/types";
import {
  ANSWER_FORMATS,
  ANSWER_FORMAT_LABELS,
  MAX_DURATION_MINUTES,
  MAX_QUESTION_LIMIT,
  MIN_DURATION_MINUTES,
  MIN_QUESTION_LIMIT,
  type TrainerSettings,
  effectiveOperations,
  validateSettings,
} from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";
import { AdvancedSettings } from "./AdvancedSettings";
import { describeSettings } from "./describeSettings";

interface SetupScreenProps {
  settings: TrainerSettings;
  onChange: (settings: TrainerSettings) => void;
  onStart: (settings: TrainerSettings) => void;
}

const DIFFICULTY_NOTES: Record<Difficulty, { summary: string; examples: string }> = {
  easy: {
    summary: "Two-digit sums, times tables, tenths, and fractions that share a denominator.",
    examples: "47 + 38 · 72 ÷ 9 · 2.4 + 3.7 · 1/2 + 1/4",
  },
  medium: {
    summary: "Three-digit sums, two-digit products and quotients, hundredths, unlike denominators.",
    examples: "672 ÷ 16 · 23 × 15 · 1.2 × 0.35 · 3/4 − 1/6",
  },
  hard: {
    summary: "Four-digit sums, two-by-two-digit products, long quotients, awkward denominators, occasional negatives.",
    examples: "2,736 ÷ 24 · 47 × 68 · 3.75 × 0.4 · 5/8 + 3/10",
  },
};

const DURATIONS = Array.from({ length: MAX_DURATION_MINUTES - MIN_DURATION_MINUTES + 1 }, (_, i) => MIN_DURATION_MINUTES + i);
const LIMIT_PRESETS = [10, 20, 50] as const;
const DEFAULT_CUSTOM_LIMIT = 30;

type LimitChoice = "none" | "10" | "20" | "50" | "custom";

function limitChoice(limit: number | null): LimitChoice {
  if (limit === null) return "none";
  return (LIMIT_PRESETS as readonly number[]).includes(limit) ? (String(limit) as LimitChoice) : "custom";
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-3 py-6 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <div className="pt-1.5">
        <div className="text-sm font-semibold tracking-tight text-ink">{label}</div>
        {hint !== undefined && <div className="mt-1 text-xs leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function SetupScreen({ settings, onChange, onStart }: SetupScreenProps) {
  const errors = validateSettings(settings);
  const customLimitId = useId();
  const update = (patch: Partial<TrainerSettings>) => onChange({ ...settings, ...patch });
  const choice = limitChoice(settings.questionLimit);
  const advancedOn = settings.advanced.enabled;
  const selectedOperations = effectiveOperations(settings);
  const financeSelected = selectedOperations.includes("finance");
  const financeOnly = financeSelected && selectedOperations.length === 1;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-tight text-ink sm:text-5xl">Train</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Mental arithmetic practice with integers, decimals and fractions. Pick a setup, then answer as many as you can — the
          clock and your accuracy do the rest.
        </p>
      </header>

      <form
        className="rounded-2xl border border-line bg-surface px-5 py-6 shadow-card sm:px-8 sm:py-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (errors.length === 0) onStart(settings);
        }}
      >
        <div className="divide-y divide-line">
          <Row label="Mode" hint={settings.mode === "timed" ? "The session ends when the clock runs out." : "Train at your own pace and end whenever you like."}>
            <SegmentedControl
              label="Mode"
              value={settings.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: "timed", label: "Timed" },
                { value: "untimed", label: "Untimed" },
              ]}
            />
            {settings.mode === "timed" ? (
              <div role="radiogroup" aria-label="Duration in minutes" className="flex flex-wrap items-center gap-1.5">
                {DURATIONS.map((minutes) => {
                  const selected = settings.durationMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${minutes} minute${minutes === 1 ? "" : "s"}`}
                      onClick={() => update({ durationMinutes: minutes })}
                      className={cx(
                        "tabular h-9 w-9 rounded-md border font-mono text-sm transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        selected ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink",
                      )}
                    >
                      {minutes}
                    </button>
                  );
                })}
                <span className="ml-1 text-sm text-muted">
                  min · <span className="tabular font-mono text-ink">{settings.durationMinutes}:00</span>
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <SegmentedControl
                  label="Question limit"
                  value={choice}
                  onChange={(next) => {
                    if (next === "none") update({ questionLimit: null });
                    else if (next === "custom") update({ questionLimit: choice === "custom" ? settings.questionLimit : DEFAULT_CUSTOM_LIMIT });
                    else update({ questionLimit: Number(next) });
                  }}
                  options={[
                    { value: "none", label: "No limit" },
                    ...LIMIT_PRESETS.map((n) => ({ value: String(n) as LimitChoice, label: String(n) })),
                    { value: "custom", label: "Custom" },
                  ]}
                />
                {choice === "custom" && (
                  <label htmlFor={customLimitId} className="flex items-center gap-3 text-sm text-ink-soft">
                    <input
                      id={customLimitId}
                      type="number"
                      inputMode="numeric"
                      min={MIN_QUESTION_LIMIT}
                      max={MAX_QUESTION_LIMIT}
                      step={1}
                      value={settings.questionLimit ?? ""}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber;
                        update({ questionLimit: Number.isNaN(value) ? DEFAULT_CUSTOM_LIMIT : Math.round(value) });
                      }}
                      className="tabular h-10 w-24 rounded-lg border border-line-strong bg-surface px-3 font-mono text-base text-ink focus:border-accent focus:outline-none"
                    />
                    questions ({MIN_QUESTION_LIMIT}–{MAX_QUESTION_LIMIT})
                  </label>
                )}
              </div>
            )}
          </Row>

          <Row
            label="Answer format"
            hint={
              settings.answerFormat === "open"
                ? "Type the exact answer. Measures whether you can produce the result."
                : "Pick from four options with keys 1–4. Measures whether you can recognise the result."
            }
          >
            <SegmentedControl
              label="Answer format"
              value={settings.answerFormat}
              onChange={(answerFormat) => update({ answerFormat })}
              options={ANSWER_FORMATS.map((format) => ({ value: format, label: ANSWER_FORMAT_LABELS[format] }))}
            />
            {settings.answerFormat === "multiple-choice" && (
              <p className="text-sm leading-relaxed text-ink-soft">
                Wrong options are built from realistic slips — misplaced decimal points, dropped carries, added denominators — so guessing
                by elimination is harder than it looks. Results are tracked separately from typed answers.
              </p>
            )}
          </Row>

          <Row label="Difficulty" hint="Applies to every number type independently.">
            <SegmentedControl
              label="Difficulty"
              value={settings.difficulty}
              onChange={(difficulty) => update({ difficulty })}
              options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
            />
            {advancedOn ? (
              <p className="text-sm leading-relaxed text-ink-soft">
                Integer and fraction sizes come from your advanced ranges instead. Difficulty still sets the decimal tier and allows the occasional negative
                result on Hard.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-soft">
                {DIFFICULTY_NOTES[settings.difficulty].summary}{" "}
                <span className="tabular font-mono text-xs text-muted">{DIFFICULTY_NOTES[settings.difficulty].examples}</span>
              </p>
            )}
          </Row>

          <Row label="Operations" hint={advancedOn ? "Set by the operation mix in advanced settings." : "Choose at least one."}>
            <div className="flex flex-wrap gap-2">
              {OPERATIONS.map((op) => (
                <ToggleChip
                  key={op}
                  pressed={advancedOn ? settings.advanced.operationMix[op] > 0 : settings.operations.includes(op)}
                  disabled={advancedOn}
                  onToggle={() => update({ operations: toggleItem(settings.operations, op) })}
                  glyph={OPERATION_SYMBOLS[op]}
                >
                  {OPERATION_LABELS[op]}
                </ToggleChip>
              ))}
            </div>
            {financeSelected && (
              <p className="text-sm leading-relaxed text-ink-soft">
                Short word problems: percentages and reverse percentages, percentage changes, fraction and decimal conversions, weighted averages, basis points,
                margins, multiples, the equity–enterprise value bridge, expected value and compounding. Every question states its units and says when to round.
                Advanced settings below choose which families appear.
              </p>
            )}
          </Row>

          <Row
            label="Numbers"
            hint={
              advancedOn
                ? "Set by the number format mix in advanced settings."
                : financeOnly
                  ? "Not used: Finance maths brings its own numbers."
                  : "Choose at least one. Mixed selections interleave at random."
            }
          >
            <div className="flex flex-wrap gap-2">
              {NUMBER_TYPES.map((type) => (
                <ToggleChip
                  key={type}
                  pressed={advancedOn ? settings.advanced.formatMix[type] > 0 : settings.numberTypes.includes(type)}
                  disabled={advancedOn}
                  onToggle={() => update({ numberTypes: toggleItem(settings.numberTypes, type) })}
                >
                  {NUMBER_TYPE_LABELS[type]}
                </ToggleChip>
              ))}
            </div>
          </Row>
        </div>

        <AdvancedSettings value={settings.advanced} onChange={(advanced) => update({ advanced })} />

        <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {errors.length > 0 ? (
              <ul className="space-y-1 text-bad" role="alert">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">{describeSettings(settings)}</span>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={errors.length > 0} className="sm:min-w-44">
            Start training
          </Button>
        </div>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Settings and finished sessions are saved in this browser only. Answers can be typed as integers, decimals, negatives or
        fractions such as <span className="font-mono">3/4</span>; any mathematically equal form counts.
      </p>
    </div>
  );
}
