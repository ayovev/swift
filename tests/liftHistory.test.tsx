import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { LiftHistoryTab } from "@/components/dashboard/LiftHistoryTab";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { WorkoutsTab, workoutsSummaryParts } from "@/components/dashboard/WorkoutsTab";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import type { DashboardSummary } from "@/types/dashboard";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleRows } from "./fixtures/sampleRows";

// Step 1 of docs/overview.md: the lift, benchmark and PR cards move from
// Overview to Training → Lifts, and Overview's range-scoped training totals
// get a summary line on Workouts. Nothing is deleted, only moved.

const MOVED_CARDS = ["What got heavier", "Benchmarks, revisited", "Personal records"];

let insights: Insights;
let rows: SugarWodRow[];
beforeAll(async () => {
  rows = await loadSampleRows();
  insights = buildInsights(rows);
});

function summary(over: Partial<DashboardSummary>): DashboardSummary {
  return {
    ...insights.dashboard.summary,
    ...over,
  };
}

describe("Training → Lifts", () => {
  it("holds the three cards that left Overview, in order", () => {
    render(<LiftHistoryTab dashboard={insights.dashboard} />);
    const titles = MOVED_CARDS.map((t) => screen.getByText(t));
    for (let i = 1; i < titles.length; i++) {
      expect(titles[i - 1]!.compareDocumentPosition(titles[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: "Filter by rep-max scheme" })).toBeInTheDocument();
  });

  it("no longer appear on Overview", () => {
    render(<OverviewTab insights={insights} granularity="monthly" workouts={rows} />);
    for (const t of MOVED_CARDS) expect(screen.queryByText(t)).not.toBeInTheDocument();
    expect(screen.getByText("Showing up")).toBeInTheDocument();
  });
});

describe("Workouts summary line", () => {
  it("states workouts logged, the RX share and the scaled count", () => {
    expect(workoutsSummaryParts(summary({ total_logged: 1209, rx_count: 870, scaled_count: 130 }))).toEqual([
      "1,209 workouts logged",
      "87% as prescribed",
      "130 scaled",
    ]);
  });

  it("leaves the RX share out when nothing is marked RX or Scaled, rather than showing 0%", () => {
    expect(workoutsSummaryParts(summary({ total_logged: 1, rx_count: 0, scaled_count: 0 }))).toEqual([
      "1 workout logged",
    ]);
  });

  it("sits at the top of the Workouts view, for the range it was given", () => {
    render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} />);
    const line = screen.getByText(workoutsSummaryParts(insights.dashboard.summary).join(" · "));
    expect(line).toBeInTheDocument();
    expect(line.textContent).toContain(`${insights.dashboard.summary.total_logged.toLocaleString()} workouts logged`);
  });
});
