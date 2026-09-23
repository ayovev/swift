import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { buildInsights } from "@/lib/analytics/buildInsights";
import type { SugarWodRow } from "@/types/sugarwod";

function row(date: string, title: string, description = ""): SugarWodRow {
  return {
    date,
    title,
    description,
    best_result_raw: "",
    best_result_display: "",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
  };
}

const ROWS: SugarWodRow[] = [
  row("01/05/2025", "ROW", "2000m row"),
  row("06/10/2025", "BACK SQUAT", "5x3 back squat"),
  row("12/20/2025", "FRAN", "21-15-9 thrusters and pull-ups"),
];

describe("buildInsights — dateBounds", () => {
  it("reports the full unfiltered span regardless of the applied range", () => {
    const unfiltered = buildInsights(ROWS);
    const filtered = buildInsights(ROWS, {
      start: dayjs("2025-06-01", "YYYY-MM-DD"),
      end: dayjs("2025-06-30", "YYYY-MM-DD"),
    });
    expect(unfiltered.dateBounds?.start.format("YYYY-MM-DD")).toBe("2025-01-05");
    expect(unfiltered.dateBounds?.end.format("YYYY-MM-DD")).toBe("2025-12-20");
    // dateBounds reflects the whole log even when the dashboard itself is filtered.
    expect(filtered.dateBounds?.start.format("YYYY-MM-DD")).toBe("2025-01-05");
    expect(filtered.dateBounds?.end.format("YYYY-MM-DD")).toBe("2025-12-20");
  });

  it("is null when nothing parses", () => {
    expect(buildInsights([]).dateBounds).toBeNull();
  });
});

describe("buildInsights — range filters both aggregators consistently", () => {
  it("narrows the dashboard summary to the selected range", () => {
    const { dashboard } = buildInsights(ROWS, {
      start: dayjs("2025-06-01", "YYYY-MM-DD"),
      end: dayjs("2025-06-30", "YYYY-MM-DD"),
    });
    expect(dashboard.summary.total_logged).toBe(1);
    expect(dashboard.summary.date_start).toBe("2025-06-10");
    expect(dashboard.summary.date_end).toBe("2025-06-10");
  });

  it("narrows modality data to the same selected range", () => {
    const { modality } = buildInsights(ROWS, {
      start: dayjs("2025-06-01", "YYYY-MM-DD"),
      end: dayjs("2025-06-30", "YYYY-MM-DD"),
    });
    expect(modality.classified_count + modality.unclassified_count).toBe(1);
  });

  it("handles a range with no matching rows without crashing", () => {
    const { dashboard, modality } = buildInsights(ROWS, {
      start: dayjs("2030-01-01", "YYYY-MM-DD"),
      end: dayjs("2030-12-31", "YYYY-MM-DD"),
    });
    expect(dashboard.summary.total_logged).toBe(0);
    expect(dashboard.summary.date_start).toBe("");
    expect(modality.classified_count).toBe(0);
    expect(modality.unclassified_count).toBe(0);
  });

  it("defaults to the full range when no filter is passed", () => {
    const filtered = buildInsights(ROWS).dashboard;
    expect(filtered.summary.total_logged).toBe(3);
  });
});

describe("buildInsights — unique training days", () => {
  // Two workouts logged on the same day (a class plus accessory work), so
  // total_logged and unique_days must diverge.
  const SAME_DAY_ROWS: SugarWodRow[] = [
    row("06/02/2025", "WOD A"),
    row("06/02/2025", "ACCESSORY A"),
    row("06/03/2025", "WOD B"),
    row("06/10/2025", "WOD C"),
  ];

  it("counts distinct calendar days, not rows", () => {
    const { dashboard } = buildInsights(SAME_DAY_ROWS);
    expect(dashboard.summary.total_logged).toBe(4);
    expect(dashboard.summary.unique_days).toBe(3);
  });

  it("averages unique days per bucket at monthly granularity", () => {
    const { dashboard } = buildInsights(SAME_DAY_ROWS, null, "monthly");
    expect(dashboard.buckets).toEqual([{ bucket: "2025-06", count: 4 }]);
    expect(dashboard.days_buckets).toEqual([{ bucket: "2025-06", count: 3 }]);
    expect(dashboard.summary.avg_days_per_bucket).toBe(3);
  });

  it("averages unique days per bucket at weekly granularity", () => {
    const { dashboard } = buildInsights(SAME_DAY_ROWS, null, "weekly");
    // June 2 and June 3 fall in the week starting June 1; June 10 starts a new week.
    expect(dashboard.buckets.map((b) => b.bucket)).toEqual(["2025-06-01", "2025-06-08"]);
    expect(dashboard.days_buckets).toEqual([
      { bucket: "2025-06-01", count: 2 },
      { bucket: "2025-06-08", count: 1 },
    ]);
    expect(dashboard.summary.avg_days_per_bucket).toBe(1.5);
  });

  it("is trivially 1 day per bucket at daily granularity", () => {
    const { dashboard } = buildInsights(SAME_DAY_ROWS, null, "daily");
    expect(dashboard.summary.avg_days_per_bucket).toBe(1);
  });

  it("is 0 for both fields when nothing parses", () => {
    const { dashboard } = buildInsights([]);
    expect(dashboard.summary.unique_days).toBe(0);
    expect(dashboard.summary.avg_days_per_bucket).toBe(0);
    expect(dashboard.days_buckets).toEqual([]);
  });
});

describe("buildInsights — granularity", () => {
  it("defaults to monthly buckets when no granularity is passed", () => {
    const { dashboard } = buildInsights(ROWS);
    expect(dashboard.buckets.map((b) => b.bucket)).toEqual(["2025-01", "2025-06", "2025-12"]);
  });

  it("buckets daily when asked", () => {
    const { dashboard } = buildInsights(ROWS, null, "daily");
    expect(dashboard.buckets.map((b) => b.bucket)).toEqual([
      "2025-01-05",
      "2025-06-10",
      "2025-12-20",
    ]);
  });

  it("buckets yearly when asked, collapsing all three rows into one bucket", () => {
    const { dashboard } = buildInsights(ROWS, null, "yearly");
    expect(dashboard.buckets).toEqual([{ bucket: "2025", count: 3 }]);
  });

  it("produces matching bucket keys for both pipelines when every row classifies", () => {
    const { dashboard, modality } = buildInsights(ROWS, null, "quarterly");
    const domainBuckets = dashboard.stacked.bucket_shares.map((s) => s.bucket);
    const modalityBuckets = modality.modality_stacked.bucket_shares.map((s) => s.bucket);
    expect(modalityBuckets).toEqual(domainBuckets);
  });
});
