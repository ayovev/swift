import type { Dayjs } from "dayjs";
import type { ParsedRow } from "./buildDashboardData";

export interface DateRange {
  start: Dayjs;
  end: Dayjs;
}

export type DateRangePreset =
  | "last_1_month"
  | "last_3_months"
  | "last_6_months"
  | "last_9_months"
  | "last_year"
  | "all_time"
  | "custom";

interface PresetOption {
  id: Exclude<DateRangePreset, "custom">;
  label: string;
  /** Months back from today. `null` means no filter (all time). */
  months: number | null;
}

/**
 * Presets shown in the picker, in display order. Anchored to today's
 * real-world date. "All time" leads — it's the only preset that's always
 * available regardless of how much history the upload actually has, so it
 * reads as the default/baseline choice rather than one option among equals.
 */
export const PRESET_OPTIONS: PresetOption[] = [
  { id: "all_time", label: "All time", months: null },
  { id: "last_1_month", label: "Last month", months: 1 },
  { id: "last_3_months", label: "Last 3 months", months: 3 },
  { id: "last_6_months", label: "Last 6 months", months: 6 },
  { id: "last_9_months", label: "Last 9 months", months: 9 },
  { id: "last_year", label: "Last year", months: 12 },
];

/**
 * Whether the uploaded log's own span (not "today") actually covers this
 * preset's window — e.g. a 4-month-old log can't meaningfully offer "Last 9
 * months" even though the preset itself is always computable. All-time
 * (`months: null`) is always available.
 */
export function presetFitsDataSpan(option: PresetOption, dateBounds: DateRange): boolean {
  if (option.months === null) return true;
  return dateBounds.end.diff(dateBounds.start, "month", true) >= option.months;
}

/** `null` return means "no filter" — the `all_time` preset. */
export function computePresetRange(
  preset: Exclude<DateRangePreset, "custom">,
  today: Dayjs
): DateRange | null {
  const option = PRESET_OPTIONS.find((p) => p.id === preset);
  if (!option || option.months === null) return null;
  return { start: today.subtract(option.months, "month").startOf("day"), end: today.endOf("day") };
}

/**
 * The full span of an unfiltered, already-sorted `ParsedRow[]` (oldest-first,
 * as `parseRows` leaves it) — used to bound the picker, not to filter.
 */
export function getDateBounds(rows: readonly ParsedRow[]): DateRange | null {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  return { start: first.dateParsed, end: last.dateParsed };
}

/** Inclusive on both ends, compared at day granularity. `null` range is a no-op. */
export function filterParsedRowsByRange(
  rows: readonly ParsedRow[],
  range: DateRange | null
): ParsedRow[] {
  if (!range) return [...rows];
  return rows.filter(
    (r) => !r.dateParsed.isBefore(range.start, "day") && !r.dateParsed.isAfter(range.end, "day")
  );
}
