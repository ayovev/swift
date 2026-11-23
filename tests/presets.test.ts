import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESET_OPTIONS } from "@/lib/analytics/dateRange";
import { PERIOD_OPTIONS } from "@/lib/analytics/insights/period";
import { reportPeriod } from "@/lib/analytics/insights/reportPeriod";

/**
 * One set of date presets everywhere. `PRESET_OPTIONS` (the Training date range) is the list; the Progress "last logged in" filter and the
 * reports' period control derive from it, and the analytics vocabulary names the same ids. A preset retyped in a second place drifts: the
 * Progress filter once lacked "Last 9 months" and said "All" where the range says "All time".
 */
describe("date presets", () => {
  it("are the same ids, words and month counts in the Progress filter as in the Training date range, plus its own Custom", () => {
    const shared = PERIOD_OPTIONS.filter((o) => o.id !== "custom");
    expect(shared).toEqual(PRESET_OPTIONS.map(({ id, label, months }) => ({ id, label, months })));
    expect(PERIOD_OPTIONS.at(-1)).toMatchObject({ id: "custom", label: "Custom" });
  });

  it("are the ids the date_range_changed analytics event can carry", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/posthog.ts"), "utf8");
    const block = source.slice(source.indexOf('name: "date_range_changed"'), source.indexOf('name: "granularity_changed"'));
    const named = [...block.matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]!).filter((n) => n !== "date_range_changed");
    expect([...named].sort()).toEqual([...PRESET_OPTIONS.map((o) => o.id), "custom"].sort());
  });

  it("lead with All time and then run shortest to longest, so every control reads the same way", () => {
    expect(PRESET_OPTIONS[0]!.id).toBe("all_time");
    const months = PRESET_OPTIONS.slice(1).map((o) => o.months!);
    expect([...months].sort((a, b) => a - b)).toEqual(months);
  });

  it("do not include the Timeline zoom, which is a zoom and not a date range, by decision", () => {
    // TimelineView's own RANGES (All, 1 year, 6 months) are named as a zoom because "Last year" there read as the date range it is not.
    // tests/TimelineTab.test.tsx pins its words; this records that it is not meant to follow the shared set.
    const source = readFileSync(join(process.cwd(), "src/components/dashboard/timeline/TimelineView.tsx"), "utf8");
    expect(source).toMatch(/A zoom, named as one/);
  });
});

describe("reportPeriod", () => {
  const today = "2026-09-11";

  it("is all time with no comparison by default, and for a custom period that is not filled in yet", () => {
    expect(reportPeriod("all_time", today)).toEqual({ start: null, end: today });
    expect(reportPeriod("custom", today, { start: "", end: "" })).toEqual({ start: null, end: today });
  });

  it("starts a preset the app's own number of calendar months back and ends it today", () => {
    expect(reportPeriod("last_3_months", today)).toEqual({ start: "2026-06-11", end: today });
    expect(reportPeriod("last_9_months", today)).toEqual({ start: "2025-12-11", end: today });
    expect(reportPeriod("last_year", today)).toEqual({ start: "2025-09-11", end: today });
  });

  it("takes a custom period as chosen, including one that ended in the past", () => {
    expect(reportPeriod("custom", today, { start: "2025-01-06", end: "2025-06-30" })).toEqual({ start: "2025-01-06", end: "2025-06-30" });
  });

  it("refuses a custom period that starts on or after its end, or ends after today", () => {
    expect(reportPeriod("custom", today, { start: "2025-06-30", end: "2025-01-06" })).toBe("invalid");
    expect(reportPeriod("custom", today, { start: "2025-06-30", end: "2025-06-30" })).toBe("invalid");
    expect(reportPeriod("custom", today, { start: "2026-01-01", end: "2026-09-12" })).toBe("invalid");
  });
});
