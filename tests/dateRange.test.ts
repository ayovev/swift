import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { parseRows } from "@/lib/analytics/buildDashboardData";
import {
  computePresetRange,
  filterParsedRowsByRange,
  getDateBounds,
} from "@/lib/analytics/dateRange";
import type { SugarWodRow } from "@/types/sugarwod";

function row(date: string): SugarWodRow {
  return {
    date,
    title: "ROW",
    description: "2000m row",
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

describe("computePresetRange", () => {
  const today = dayjs("2026-09-16", "YYYY-MM-DD");

  it("returns null for all_time (no filter)", () => {
    expect(computePresetRange("all_time", today)).toBeNull();
  });

  it("anchors last_3_months to three calendar months back from today", () => {
    const range = computePresetRange("last_3_months", today);
    expect(range?.start.format("YYYY-MM-DD")).toBe("2026-06-16");
    expect(range?.end.format("YYYY-MM-DD")).toBe("2026-09-16");
  });

  it("anchors last_6_months and last_year the same way", () => {
    expect(computePresetRange("last_6_months", today)?.start.format("YYYY-MM-DD")).toBe(
      "2026-03-16"
    );
    expect(computePresetRange("last_year", today)?.start.format("YYYY-MM-DD")).toBe("2025-09-16");
  });
});

describe("getDateBounds", () => {
  it("returns the first and last dates of an already-sorted parse", () => {
    const rows = parseRows([row("01/05/2025"), row("06/10/2025"), row("12/20/2025")]);
    const bounds = getDateBounds(rows);
    expect(bounds?.start.format("YYYY-MM-DD")).toBe("2025-01-05");
    expect(bounds?.end.format("YYYY-MM-DD")).toBe("2025-12-20");
  });

  it("returns null for an empty parse", () => {
    expect(getDateBounds([])).toBeNull();
  });
});

describe("filterParsedRowsByRange", () => {
  const rows = parseRows([row("01/05/2025"), row("06/10/2025"), row("12/20/2025")]);

  it("passes every row through unfiltered when range is null", () => {
    expect(filterParsedRowsByRange(rows, null)).toHaveLength(3);
  });

  it("is inclusive of both the start and end day", () => {
    const filtered = filterParsedRowsByRange(rows, {
      start: dayjs("2025-01-05", "YYYY-MM-DD"),
      end: dayjs("2025-06-10", "YYYY-MM-DD"),
    });
    expect(filtered.map((r) => r.dateParsed.format("YYYY-MM-DD"))).toEqual([
      "2025-01-05",
      "2025-06-10",
    ]);
  });

  it("returns an empty array when nothing falls in range", () => {
    const filtered = filterParsedRowsByRange(rows, {
      start: dayjs("2030-01-01", "YYYY-MM-DD"),
      end: dayjs("2030-12-31", "YYYY-MM-DD"),
    });
    expect(filtered).toEqual([]);
  });
});
