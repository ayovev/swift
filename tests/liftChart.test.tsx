import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiftGrid, MIN_CHART_EFFORTS, mostLoggedScheme } from "@/components/dashboard/charts/LiftChart";
import { LiftHistoryTab } from "@/components/dashboard/LiftHistoryTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import type { LiftEntry } from "@/types/dashboard";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * The lift small multiples (LiftChart.tsx): one rep scheme highlighted per chart, every other effort grey, and a chart only for a
 * lift with MIN_CHART_EFFORTS efforts. Recharts draws nothing in jsdom, so the marks themselves were checked in a browser; these
 * pin the rules around them.
 */

const { dashboard } = buildInsights(await loadSampleRows());
const e = (repMax: number | null, value = 100): LiftEntry => ({ date: "2024-01-01", value, repMax, pr: false }) as LiftEntry;
const efforts = (v: readonly LiftEntry[]) => v.filter((x) => x.value > 0).length;

describe("mostLoggedScheme", () => {
  it("picks the scheme with the most logged efforts, tracked schemes first on a tie, ignoring unlogged loads", () => {
    expect(mostLoggedScheme([e(5), e(5), e(1), e(null)])).toBe("5RM");
    expect(mostLoggedScheme([e(3), e(1)])).toBe("1RM");
    expect(mostLoggedScheme([e(null), e(null), e(1)])).toBe("other");
    expect(mostLoggedScheme([e(5, 0), e(5, 0), e(1)])).toBe("1RM");
  });
});

describe("the lift grid", () => {
  it("charts only lifts with enough efforts and names the rest in one line", () => {
    const { container } = render(<LiftGrid lifts={dashboard.lifts} highlight="most" />);
    const charted = Object.entries(dashboard.lifts).filter(([, v]) => efforts(v) >= MIN_CHART_EFFORTS);
    const listed = Object.entries(dashboard.lifts).filter(([, v]) => efforts(v) > 0 && efforts(v) < MIN_CHART_EFFORTS);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(charted.length);
    expect(listed.length).toBeGreaterThan(0);
    const line = container.querySelector("[data-also-logged]") as HTMLElement;
    for (const [name, v] of listed) expect(line.textContent).toContain(`${name} (${efforts(v)})`);
  });

  it("keeps every chart when a scheme is highlighted, rather than filtering", () => {
    render(<LiftHistoryTab dashboard={dashboard} />);
    const before = screen.getAllByRole("heading", { level: 3 }).length;
    fireEvent.click(screen.getByRole("button", { name: "3RM" }));
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(before);
  });
});
