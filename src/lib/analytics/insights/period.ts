/**
 * The "Logged in" filter on the Insights list: which subjects are listed, by when they were last logged. It changes no verdict, label,
 * count, chart or other view; it only hides rows. The presets use the date-range control's wording and calendar-month arithmetic
 * (`computePresetRange`), but this filter has its own state.
 */
import dayjs from "dayjs";
import { PRESET_OPTIONS, type DateRangePreset } from "../dateRange";
import type { ProgressRow } from "./headline";

/**
 * The same presets, ids and words as the Training date range (`PRESET_OPTIONS` in `dateRange.ts`), because there is one set of them
 * everywhere (tests/presets.test.ts): this list is derived from that one, never retyped, so a preset added or reworded there reaches
 * every control that offers periods. The Timeline's zoom is the one deliberate exception (see TimelineView.tsx).
 */
export type PeriodPreset = DateRangePreset;

export const PERIOD_OPTIONS: { id: PeriodPreset; label: string; months: number | null }[] = [
  ...PRESET_OPTIONS.map(({ id, label, months }) => ({ id: id as PeriodPreset, label, months })),
  { id: "custom", label: "Custom", months: null },
];

export interface PeriodRange {
  /** YYYY-MM-DD, inclusive */
  start: string;
  end: string;
}

/** null for All. A custom range with a start after its end is invalid and returns "invalid". */
export function periodRange(preset: PeriodPreset, today: string, custom?: { start: string; end: string }): PeriodRange | null | "invalid" {
  if (preset === "all_time") return null;
  if (preset === "custom") {
    if (!custom?.start || !custom.end) return null;
    return custom.start > custom.end ? "invalid" : { start: custom.start, end: custom.end };
  }
  const months = PRESET_OPTIONS.find((o) => o.id === preset)?.months ?? 0;
  return { start: dayjs(today).subtract(months, "month").format("YYYY-MM-DD"), end: today };
}

/** Rows whose latest session falls in the range (a subject last logged in the period is listed). An invalid range lists everything. */
export function filterRowsByPeriod(rows: readonly ProgressRow[], range: PeriodRange | null | "invalid"): ProgressRow[] {
  if (range === null || range === "invalid") return [...rows];
  return rows.filter((r) => r.latest >= range.start && r.latest <= range.end);
}
