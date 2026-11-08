import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketTickInterval,
  dailyGranularityFits,
  formatBucketLabel,
  GRANULARITY_OPTIONS,
  MAX_DAILY_SPAN_DAYS,
} from "@/lib/analytics/granularity";

describe("bucketKey", () => {
  // A Wednesday, deliberately not aligned to any bucket boundary.
  const date = dayjs("2025-03-12", "YYYY-MM-DD");

  it("keys daily buckets by the exact date", () => {
    expect(bucketKey(date, "daily")).toBe("2025-03-12");
  });

  it("keys weekly buckets by the Sunday that starts the week", () => {
    expect(bucketKey(date, "weekly")).toBe("2025-03-09");
  });

  it("keys monthly buckets as YYYY-MM, unchanged from the original format", () => {
    expect(bucketKey(date, "monthly")).toBe("2025-03");
  });

  it("keys quarterly buckets as YYYY-Q#", () => {
    expect(bucketKey(date, "quarterly")).toBe("2025-Q1");
    expect(bucketKey(dayjs("2025-12-25", "YYYY-MM-DD"), "quarterly")).toBe("2025-Q4");
  });

  it("keys yearly buckets as YYYY", () => {
    expect(bucketKey(date, "yearly")).toBe("2025");
  });

  it("sorts weekly bucket keys chronologically as plain strings", () => {
    const early = bucketKey(dayjs("2025-01-01", "YYYY-MM-DD"), "weekly");
    const mid = bucketKey(dayjs("2025-06-15", "YYYY-MM-DD"), "weekly");
    const late = bucketKey(dayjs("2025-12-31", "YYYY-MM-DD"), "weekly");
    expect(early < mid).toBe(true);
    expect(mid < late).toBe(true);
  });
});

describe("formatBucketLabel", () => {
  it("formats a daily key", () => {
    expect(formatBucketLabel("2025-03-12", "daily")).toBe("Mar 12 '25");
  });

  it("formats a weekly key the same way as daily (its start-of-week date)", () => {
    expect(formatBucketLabel("2025-03-09", "weekly")).toBe("Mar 9 '25");
  });

  it("formats a monthly key", () => {
    expect(formatBucketLabel("2025-03", "monthly")).toBe("Mar '25");
  });

  it("formats a quarterly key", () => {
    expect(formatBucketLabel("2025-Q4", "quarterly")).toBe("Q4 '25");
  });

  it("formats a yearly key as-is", () => {
    expect(formatBucketLabel("2025", "yearly")).toBe("2025");
  });

  it("falls back to the raw key when it doesn't match the expected shape", () => {
    expect(formatBucketLabel("garbage", "monthly")).toBe("garbage");
  });
});

describe("bucketTickInterval", () => {
  it("shows every tick at 12 points or fewer", () => {
    expect(bucketTickInterval(12)).toBe(0);
    expect(bucketTickInterval(1)).toBe(0);
  });

  it("thins ticks down to roughly ten at higher point counts", () => {
    expect(bucketTickInterval(47)).toBeGreaterThan(0);
    expect(bucketTickInterval(900)).toBeGreaterThan(bucketTickInterval(47));
  });
});

describe("dailyGranularityFits", () => {
  const start = dayjs("2025-01-01", "YYYY-MM-DD");

  it("fits a span well under the limit", () => {
    expect(dailyGranularityFits({ start, end: start.add(30, "day") })).toBe(true);
  });

  it("fits a span exactly at the limit", () => {
    expect(dailyGranularityFits({ start, end: start.add(MAX_DAILY_SPAN_DAYS, "day") })).toBe(true);
  });

  it("does not fit a span one day past the limit", () => {
    expect(dailyGranularityFits({ start, end: start.add(MAX_DAILY_SPAN_DAYS + 1, "day") })).toBe(
      false
    );
  });

  it("does not fit a multi-year span", () => {
    expect(dailyGranularityFits({ start, end: start.add(3, "year") })).toBe(false);
  });
});

describe("GRANULARITY_OPTIONS", () => {
  it("lists exactly the five supported granularities, finest to coarsest", () => {
    expect(GRANULARITY_OPTIONS.map((o) => o.id)).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ]);
  });
});
