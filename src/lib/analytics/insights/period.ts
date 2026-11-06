/**
 * The "Logged in" filter on the Insights list: which subjects are listed, by when they were last logged. It changes no verdict, label,
 * count, chart or other view; it only hides rows. The presets use the date-range control's wording and calendar-month arithmetic
 * (`computePresetRange`), but this filter has its own state.
 */
import dayjs from "dayjs";
import type { ProgressRow } from "./headline";

export type PeriodPreset = "all" | "last_1_month" | "last_3_months" | "last_6_months" | "last_year" | "custom";

export const PERIOD_OPTIONS: { id: PeriodPreset; label: string; months: number | null }[] = [
  { id: "all", label: "All", months: null },
  { id: "last_1_month", label: "Last month", months: 1 },
  { id: "last_3_months", label: "Last 3 months", months: 3 },
  { id: "last_6_months", label: "Last 6 months", months: 6 },
  { id: "last_year", label: "Last year", months: 12 },
  { id: "custom", label: "Custom", months: null },
];

export interface PeriodRange {
  /** YYYY-MM-DD, inclusive */
  start: string;
  end: string;
}

/** null for All. A custom range with a start after its end is invalid and returns "invalid". */
export function periodRange(preset: PeriodPreset, today: string, custom?: { start: string; end: string }): PeriodRange | null | "invalid" {
  if (preset === "all") return null;
  if (preset === "custom") {
    if (!custom?.start || !custom.end) return null;
    return custom.start > custom.end ? "invalid" : { start: custom.start, end: custom.end };
  }
  const months = PERIOD_OPTIONS.find((o) => o.id === preset)?.months ?? 0;
  return { start: dayjs(today).subtract(months, "month").format("YYYY-MM-DD"), end: today };
}

/** Rows whose latest session falls in the range (a subject last logged in the period is listed). An invalid range lists everything. */
export function filterRowsByPeriod(rows: readonly ProgressRow[], range: PeriodRange | null | "invalid"): ProgressRow[] {
  if (range === null || range === "invalid") return [...rows];
  return rows.filter((r) => r.latest >= range.start && r.latest <= range.end);
}
