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
    expect(screen.getByRole("group", { name: "Highlight a rep scheme" })).toBeInTheDocument();
  });

  it("no longer appear on Overview", () => {
    render(<OverviewTab insights={insights} workouts={rows} />);
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

  it("says this export for all time and this range once a date range narrows it", () => {
    const { unmount } = render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} />);
    expect(screen.getByText(/^Every workout in this export, most recent first/)).toBeInTheDocument();
    unmount();
    render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} ranged />);
    expect(screen.getByText(/^Every workout in this range, most recent first/)).toBeInTheDocument();
  });

  // Each row's split text: the line under the bar (its dots make it several elements, so it is found by its place, not its text).
  const splitLines = () => [...document.querySelectorAll("tbody td:last-child > div.tabular")].filter((d) => d.textContent !== "not classified");

  it("writes each row's split in the order its bar is drawn, under a header in the same order", () => {
    render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} />);
    expect(screen.getByRole("columnheader", { name: "W / G / M" })).toBeInTheDocument();
    const split = splitLines();
    expect(split.length).toBeGreaterThan(0);
    for (const el of split) expect(el.textContent!.replace(/\s*·\s*/g, " · ")).toMatch(/^W \d+ · G \d+ · M \d+$/);
    expect(screen.queryByText(/^M \d+ \/ W \d+ \/ G \d+$/)).not.toBeInTheDocument();
  });

  it("names each bar colour right where the bars are: dots in a sticky header and before each value", () => {
    const { container } = render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} />);
    const header = screen.getByRole("columnheader", { name: "W / G / M" });
    const dots = (el: Element) => [...el.querySelectorAll("span[aria-hidden=true]")].map((d) => (d as HTMLElement).style.backgroundColor).filter(Boolean);
    // The bar's own colours, in its own left-to-right order.
    expect(dots(header)).toEqual(["var(--repmax-3)", "var(--repmax-5)", "var(--repmax-1)"]);
    expect(header.textContent).toBe("WGM");
    const thead = container.querySelector("thead") as HTMLElement;
    expect(thead.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "top-0", "bg-muted"]));
    // A scroll container between the header and the page would pin it to the table instead.
    expect(thead.closest("table")!.parentElement!.className).not.toMatch(/overflow-(hidden|auto|scroll)/);
    const split = splitLines()[0]!;
    expect(dots(split)).toEqual(["var(--repmax-3)", "var(--repmax-5)", "var(--repmax-1)"]);
  });
});
