import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

/**
 * Cell/timestamp parsing shared by every pipeline that reads raw rows.
 * Lives in its own file so `bodyCompNoise.ts` can use them without a
 * circular import.
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

/** A strict "YYYY-MM-DD" calendar day — the shape every user-authored date (timeline entries, weigh-ins) is stored in. */
export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value, "YYYY-MM-DD", true).isValid();
}
