import { describe, expect, it } from "vitest";
import { buildBodyCompData } from "@/lib/analytics/buildBodyCompData";
import type { InBodyRow } from "@/types/inbody";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";

function row(overrides: Partial<InBodyRow> & { date: string }): InBodyRow {
  return {
    "Weight(lb)": "-",
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
    ...overrides,
  };
}

describe("buildBodyCompData", () => {
  it("buckets the sample export monthly by default, oldest first", async () => {
    const rows = await loadSampleInBodyRows();
    const data = buildBodyCompData(rows);
    expect(data.granularity).toBe("monthly");
    expect(data.points.map((p) => p.bucket)).toEqual([
      "2025-07",
      "2025-10",
      "2026-01",
      "2026-04",
      "2026-07",
    ]);
    expect(data.points[0]?.weight).toBe(188.0);
  });

  it("averages multiple scans landing in the same bucket", () => {
    const rows = [
      row({ date: "20260105120000", "Weight(lb)": "180" }),
      row({ date: "20260120120000", "Weight(lb)": "182" }),
    ];
    const data = buildBodyCompData(rows, "monthly");
    expect(data.points).toHaveLength(1);
    expect(data.points[0]?.weight).toBe(181);
  });

  it("excludes a metric a scan didn't measure from the average rather than counting it as zero", () => {
    const rows = [
      row({ date: "20260105120000", "Percent Body Fat(%)": "12" }),
      row({ date: "20260120120000", "Percent Body Fat(%)": "-" }),
    ];
    const data = buildBodyCompData(rows, "monthly");
    // A zero-counted "-" would have averaged to 6; excluding it keeps the real 12.
    expect(data.points[0]?.bodyFatPct).toBe(12);
  });

  it("is null for a bucket where no row measured a given metric", () => {
    const rows = [row({ date: "20260105120000" })];
    const data = buildBodyCompData(rows, "monthly");
    expect(data.points[0]?.bodyFatPct).toBeNull();
  });

  it("skips a row whose date shape is valid but the calendar date isn't (defensive, not expected in practice)", () => {
    const rows = [
      row({ date: "20260231120000", "Weight(lb)": "999" }), // Feb 31 doesn't exist
      row({ date: "20260105120000", "Weight(lb)": "180" }),
    ];
    const data = buildBodyCompData(rows, "monthly");
    expect(data.points).toHaveLength(1);
    expect(data.points[0]?.weight).toBe(180);
  });

  it("respects the requested granularity", () => {
    const rows = [
      row({ date: "20260105120000", "Weight(lb)": "180" }),
      row({ date: "20260615120000", "Weight(lb)": "182" }),
    ];
    const data = buildBodyCompData(rows, "yearly");
    expect(data.points).toHaveLength(1);
    expect(data.points[0]?.bucket).toBe("2026");
    expect(data.points[0]?.weight).toBe(181);
  });
});
