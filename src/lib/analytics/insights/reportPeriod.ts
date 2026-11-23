import { periodRange, type PeriodPreset } from "./period";

/**
 * The period a report covers (docs/reports.md, R-2): a start and an end, both YYYY-MM-DD. `start` is null for all time, which means
 * no comparison: the report is Progress as of `end` and nothing is compared with an earlier state. `end` is today for every preset and
 * is the chosen "To" for a custom period, which may be in the past, so a closed block can be reported on after the fact.
 *
 * The presets are the app's own (`PRESET_OPTIONS`, through `periodRange`). Pure: today is passed in, and nothing is stored (R-15).
 */
export interface ReportPeriod {
  start: string | null;
  end: string;
}

/**
 * "invalid" for a custom period that cannot be reported: a start that is not before its end (a comparison of one day with itself is
 * empty) or an end after today. An incomplete custom period, with a date still missing, is all time until both are filled.
 */
export function reportPeriod(preset: PeriodPreset, today: string, custom?: { start: string; end: string }): ReportPeriod | "invalid" {
  const range = periodRange(preset, today, custom);
  if (range === "invalid") return "invalid";
  if (range === null) return { start: null, end: today };
  if (preset === "custom" && (range.start >= range.end || range.end > today)) return "invalid";
  return { start: range.start, end: range.end };
}
