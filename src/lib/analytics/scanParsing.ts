import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

/**
 * Cell/timestamp parsing shared by every pipeline that reads raw rows.
 * Lives in its own file (re-exported by plateauDetector.ts, where these
 * started) so `bodyCompNoise.ts` can use them without a circular import.
 */

export function parseWorkoutDate(dateStr: string): Dayjs {
  return dayjs((dateStr ?? "").trim(), "MM/DD/YYYY", true);
}

export function parseInBodyDate(dateStr: string): Dayjs {
  return dayjs((dateStr ?? "").trim(), "YYYYMMDDHHmmss", true);
}

/** Treats "", undefined and the literal "-" (InBody's "not measured") as no data — never 0. */
export function parseNumericField(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "-") return null;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}
