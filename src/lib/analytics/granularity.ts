import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { DateRange } from "./dateRange";

// Keeps strict parsing available whichever module happens to import first.
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
 * The first and last day a bucket key covers, YYYY-MM-DD: what tells a chart a bucket is only partly inside the range (the first month
 * of a log that started on the 21st, or the month under way). Weeks start on Sunday, as in `bucketKey`.
 */
export function bucketBounds(key: string, granularity: Granularity): { start: string; end: string } {
  const f = (d: Dayjs) => d.format("YYYY-MM-DD");
  switch (granularity) {
    case "daily":
      return { start: key, end: key };
    case "weekly": {
      const d = dayjs(key);
      return { start: f(d), end: f(d.add(6, "day")) };
    }
    case "monthly": {
      const d = dayjs(`${key}-01`);
      return { start: f(d), end: f(d.endOf("month")) };
    }
    case "quarterly": {
      const [year, q] = key.split("-Q");
      const d = dayjs(`${year}-01-01`).add((Number(q) - 1) * 3, "month");
      return { start: f(d), end: f(d.add(2, "month").endOf("month")) };
    }
    case "yearly":
      return { start: `${key}-01-01`, end: `${key}-12-31` };
  }
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
