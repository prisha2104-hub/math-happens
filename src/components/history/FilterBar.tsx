"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ToggleChip } from "@/components/ui/ToggleChip";
import type { HistoryFilters } from "@/lib/analysis/aggregate";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  NUMBER_TYPES,
  NUMBER_TYPE_LABELS,
  type NumberType,
  OPERATIONS,
  OPERATION_LABELS,
  OPERATION_SYMBOLS,
  type Operation,
} from "@/lib/engine/types";
import { ANSWER_FORMATS, ANSWER_FORMAT_LABELS, type AnswerFormat } from "@/lib/session/types";

export type Period = "7d" | "30d" | "90d" | "all";

export interface FilterState {
  period: Period;
  answerFormat: AnswerFormat | "all";
  difficulty: Difficulty | "all";
  /** Empty means every operation. */
  operations: Operation[];
  /** Empty means every number type. */
  numberTypes: NumberType[];
}

export const DEFAULT_FILTERS: FilterState = { period: "all", answerFormat: "all", difficulty: "all", operations: [], numberTypes: [] };

const PERIOD_MS: Record<Exclude<Period, "all">, number> = { "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 };

export function toHistoryFilters(state: FilterState, now = Date.now()): HistoryFilters {
  return {
    since: state.period === "all" ? null : now - PERIOD_MS[state.period],
    answerFormats: state.answerFormat === "all" ? undefined : [state.answerFormat],
    difficulties: state.difficulty === "all" ? undefined : [state.difficulty],
    operations: state.operations.length === 0 ? undefined : state.operations,
    numberTypes: state.numberTypes.length === 0 ? undefined : state.numberTypes,
  };
}

export function isDefaultFilters(state: FilterState): boolean {
  return (
    state.period === "all" &&
    state.answerFormat === "all" &&
    state.difficulty === "all" &&
    state.operations.length === 0 &&
    state.numberTypes.length === 0
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Hide the period control (e.g. the notebook always shows everything by date). */
  showPeriod?: boolean;
}

export function FilterBar({ value, onChange, showPeriod = true }: FilterBarProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-4 sm:px-5" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        {showPeriod && (
          <SegmentedControl
            label="Period"
            value={value.period}
            onChange={(period) => set({ period })}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "all", label: "All time" },
            ]}
          />
        )}
        <SegmentedControl
          label="Answer format"
          value={value.answerFormat}
          onChange={(answerFormat) => set({ answerFormat })}
          options={[{ value: "all" as const, label: "Both formats" }, ...ANSWER_FORMATS.map((f) => ({ value: f, label: ANSWER_FORMAT_LABELS[f] }))]}
        />
        <SegmentedControl
          label="Difficulty"
          value={value.difficulty}
          onChange={(difficulty) => set({ difficulty })}
          options={[{ value: "all" as const, label: "Any level" }, ...DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {OPERATIONS.map((op) => (
          <ToggleChip key={op} pressed={value.operations.includes(op)} onToggle={() => set({ operations: toggle(value.operations, op) })} glyph={OPERATION_SYMBOLS[op]}>
            {OPERATION_LABELS[op]}
          </ToggleChip>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        {NUMBER_TYPES.map((type) => (
          <ToggleChip key={type} pressed={value.numberTypes.includes(type)} onToggle={() => set({ numberTypes: toggle(value.numberTypes, type) })}>
            {NUMBER_TYPE_LABELS[type]}
          </ToggleChip>
        ))}
        {!isDefaultFilters(value) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="ml-auto text-sm text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
