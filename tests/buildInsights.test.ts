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
