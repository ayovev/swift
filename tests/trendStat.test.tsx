import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendStat } from "@/components/dashboard/TrendStat";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("Then versus now", () => {
  it("names each half by its dates", () => {
    render(
      <TrendStat
        earlyPct={85.6}
        latePct={79.4}
        delta={-6.2}
        unitLabel="share of training in Strength"
        halves={{ early: { from: "2022-11-21", to: "2024-11-30" }, late: { from: "2024-12-02", to: "2026-11-10" } }}
      />
    );
    expect(screen.getByText("Nov 2022 to Nov 2024")).toBeInTheDocument();
    expect(screen.getByText("Dec 2024 to Nov 2026")).toBeInTheDocument();
    expect(screen.queryByText("first half")).not.toBeInTheDocument();
    expect(screen.getByText(/by count\. Your share of training in Strength has come down over time\./)).toBeInTheDocument();
  });

  it("says the range is too short rather than calling a change over a few weeks", () => {
    render(
      <TrendStat
        earlyPct={88}
        latePct={95}
        delta={7}
        unitLabel="share of training in Strength"
        halves={{ early: { from: "2026-10-10", to: "2026-10-24" }, late: { from: "2026-10-25", to: "2026-11-10" } }}
      />
    );
    expect(screen.getByText(/Too short a range to compare halves/)).toBeInTheDocument();
    expect(screen.queryByText(/over time/)).not.toBeInTheDocument();
  });

  it("dates the halves from the split the percentages are computed on", async () => {
    const { dashboard, modality } = buildInsights(await loadSampleRows(), null, "monthly");
    const h = dashboard.trend_halves!;
    expect(h.early.from <= h.early.to && h.early.to <= h.late.from && h.late.from <= h.late.to).toBe(true);
    // The modality halves split classified workouts only, so they sit inside the domain halves' span.
    const m = modality.modality_trend_halves!;
    expect(m.early.from >= h.early.from).toBe(true);
    expect(m.late.to <= h.late.to).toBe(true);
  });
});
