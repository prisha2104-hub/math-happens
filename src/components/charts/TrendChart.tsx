import type { AnswerFormat } from "@/lib/session/types";
import { cx } from "@/lib/ui/cx";

export interface TrendDatum {
  id: string;
  /** Position along the x axis (epoch ms). */
  at: number;
  value: number;
  answerFormat: AnswerFormat;
  /** Drives point size, e.g. questions answered. */
  weight?: number;
}

interface TrendChartProps {
  data: TrendDatum[];
  /** Formats a value for the axis and tooltips. */
  format: (value: number) => string;
  /** Lower values are better (response times). */
  invert?: boolean;
  height?: number;
  ariaLabel: string;
}

const FORMAT_CLASS: Record<AnswerFormat, string> = { open: "text-ink", "multiple-choice": "text-accent" };

/**
 * Small editorial line chart drawn by hand in SVG. Open-answer and
 * multiple-choice sessions are separate series because they measure
 * different skills; the x axis is session order, not calendar time.
 */
export function TrendChart({ data, format, invert = false, height = 160, ariaLabel }: TrendChartProps) {
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 22, left: 44 };
  const points = [...data].sort((a, b) => a.at - b.at);
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin || Math.abs(rawMax) || 1;
  const min = invert ? Math.max(0, rawMin - spread * 0.15) : rawMin - spread * 0.15;
  const max = rawMax + spread * 0.15;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min || 1)) * innerH;

  const series = (["open", "multiple-choice"] as AnswerFormat[]).map((fmt) => ({
    fmt,
    coords: points.map((p, i) => (p.answerFormat === fmt ? ([x(i), y(p.value)] as const) : null)),
  }));
  const zeroVisible = min < 0 && max > 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
      <line x1={pad.left} x2={width - pad.right} y1={y(max)} y2={y(max)} className="stroke-line" strokeWidth={1} />
      <line x1={pad.left} x2={width - pad.right} y1={y(min)} y2={y(min)} className="stroke-line" strokeWidth={1} />
      {zeroVisible && <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeDasharray="3 4" strokeWidth={1} />}
      <text x={pad.left - 8} y={y(max) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">
        {format(rawMax)}
      </text>
      <text x={pad.left - 8} y={y(min) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">
        {format(rawMin)}
      </text>
      <text x={pad.left} y={height - 6} className="fill-muted text-[11px]">
        earliest
      </text>
      <text x={width - pad.right} y={height - 6} textAnchor="end" className="fill-muted text-[11px]">
        latest
      </text>
      {series.map(({ fmt, coords }) => {
        const present = coords.map((c, i) => (c ? { c, i } : null)).filter((v): v is { c: readonly [number, number]; i: number } => v !== null);
        if (present.length === 0) return null;
        const path = present.map(({ c }, idx) => `${idx === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
        return (
          <g key={fmt} className={FORMAT_CLASS[fmt]}>
            {present.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />}
            {present.map(({ c, i }) => {
              const point = points[i]!;
              const r = 3 + Math.min(4, Math.sqrt(point.weight ?? 1) / 2);
              return (
                <circle key={point.id} cx={c[0]} cy={c[1]} r={r} fill="currentColor" className="stroke-surface" strokeWidth={1.5}>
                  <title>{`${new Date(point.at).toLocaleDateString(undefined, { dateStyle: "medium" })}: ${format(point.value)}${point.weight ? ` · ${point.weight} answered` : ""}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function TrendLegend({ formats }: { formats: AnswerFormat[] }) {
  if (formats.length < 2) return null;
  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className={cx("inline-block h-2.5 w-2.5 rounded-full bg-ink")} aria-hidden="true" /> Open answer
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cx("inline-block h-2.5 w-2.5 rounded-full bg-accent")} aria-hidden="true" /> Multiple choice
      </span>
    </div>
  );
}
