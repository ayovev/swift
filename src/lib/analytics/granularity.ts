import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { DateRange } from "./dateRange";

// bucketRange parses strictly; the plugin is otherwise only loaded by whichever module happens to import first.
dayjs.extend(customParseFormat);

export type Granularity = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

interface GranularityOption {
  id: Granularity;
  label: string;
}

/** Options shown in the picker, in display order, finest to coarsest. */
export const GRANULARITY_OPTIONS: GranularityOption[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];

/** Singular unit name, for copy like "a month on average" or "month by month". */
export const GRANULARITY_NOUN: Record<Granularity, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

export function granularityLabel(granularity: Granularity): string {
  return GRANULARITY_OPTIONS.find((o) => o.id === granularity)?.label ?? granularity;
}

/**
 * Daily bars stop being legible well before a multi-year span — a year of
 * them is already ~365 bars in the same chart width a monthly view fits in
 * ~12. Starting point picked to revisit once it's been tried against real
 * ranges (see ScopeLine.tsx); not a measured perceptual limit.
 */
export const MAX_DAILY_SPAN_DAYS = 365;

/** Whether daily granularity stays readable over the given span. */
export function dailyGranularityFits(range: DateRange): boolean {
  return range.end.diff(range.start, "day") <= MAX_DAILY_SPAN_DAYS;
}

/**
 * Buckets a date into a lexicographically-sortable key for the given
 * granularity. Weekly buckets are keyed by the Sunday that starts the week
 * (dayjs' default, unconfigured locale start-of-week), so "YYYY-MM-DD"
 * string sort still matches chronological order — no ISO week-number edge
 * cases (week 53, a week spanning two years) to handle.
 */
export function bucketKey(date: Dayjs, granularity: Granularity): string {
  switch (granularity) {
    case "daily":
      return date.format("YYYY-MM-DD");
    case "weekly":
      return date.startOf("week").format("YYYY-MM-DD");
    case "monthly":
      return date.format("YYYY-MM");
    case "quarterly":
      return `${date.format("YYYY")}-Q${Math.floor(date.month() / 3) + 1}`;
    case "yearly":
      return date.format("YYYY");
  }
}

/**
 * The inclusive calendar span a bucket key covers, "YYYY-MM-DD" both ends —
 * the inverse of `bucketKey`. Lets a selection on a bucketed chart become a
 * date window. Null for a key that isn't one of this granularity's.
 */
export function bucketRange(key: string, granularity: Granularity): { start: string; end: string } | null {
  const fmt = "YYYY-MM-DD";
  let start: Dayjs;
  let unit: "day" | "week" | "month" | "year";
  let months = 1;
  switch (granularity) {
    case "daily":
      start = dayjs(key, fmt, true);
      unit = "day";
      break;
    case "weekly":
      start = dayjs(key, fmt, true);
      unit = "week";
      break;
    case "monthly":
      start = dayjs(`${key}-01`, fmt, true);
      unit = "month";
      break;
    case "quarterly": {
      const m = /^(\d{4})-Q([1-4])$/.exec(key);
      if (!m) return null;
      start = dayjs(`${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`, fmt, true);
      unit = "month";
      months = 3;
      break;
    }
    case "yearly":
      start = dayjs(`${key}-01-01`, fmt, true);
      unit = "year";
      break;
  }
  if (!start.isValid()) return null;
  const end = unit === "month" ? start.add(months, "month").subtract(1, "day") : start.add(1, unit).subtract(1, "day");
  return { start: start.format(fmt), end: end.format(fmt) };
}

/** Human-readable axis/tooltip label for a bucket key produced by `bucketKey`. */
export function formatBucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "daily":
    case "weekly": {
      const [year, month, day] = key.split("-");
      if (!year || !month || !day) return key;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return `${date.toLocaleDateString("en-US", { day: "numeric", month: "short" })} '${year.slice(2)}`;
    }
    case "monthly": {
      const [year, month] = key.split("-");
      if (!year || !month) return key;
      const date = new Date(Number(year), Number(month) - 1, 1);
      return `${date.toLocaleString("en-US", { month: "short" })} '${year.slice(2)}`;
    }
    case "quarterly": {
      const [year, quarter] = key.split("-");
      if (!year || !quarter) return key;
      return `${quarter} '${year.slice(2)}`;
    }
    case "yearly":
      return key;
  }
}

/** Recharts renders a tick per point by default; at high point counts that's a smear. */
export function bucketTickInterval(pointCount: number): number {
  if (pointCount <= 12) return 0;
  return Math.max(1, Math.ceil(pointCount / 10) - 1);
}
