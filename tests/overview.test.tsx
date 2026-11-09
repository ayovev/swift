import dayjs from "dayjs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { BODY_COMP_TAB, LIFTS_TAB, LIFT_HISTORY_TAB } from "@/components/dashboard/tabs";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { OVERVIEW_RECENT_DAYS } from "@/lib/analytics/insightConfig";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import type { ProgressHeadline } from "@/lib/analytics/insights/headline";
import {
  bodyWeightStat,
  daysTrainedStat,
  latestPrStat,
  overviewScopeSentence,
  progressStat,
  recentWindow,
  weightChangeText,
} from "@/lib/analytics/overview";
import { liftRow, logRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

// Step 2 of docs/overview.md: Overview's totals row and scope sentence, from
// the full history as of today. `today` is always passed in.

const TODAY = "2026-11-09";
const parsed = (rows: Parameters<typeof buildInsights>[0]) => buildInsights(rows).allRows;
/** MM/DD/YYYY for a date `n` days before TODAY. */
const daysAgo = (n: number) => dayjs(TODAY).subtract(n, "day").format("MM/DD/YYYY");

describe("recentWindow", () => {
  it("is the last 90 days ending today, and the 90 before them", () => {
    const w = recentWindow(TODAY);
    expect(OVERVIEW_RECENT_DAYS).toBe(90);
    expect(dayjs(TODAY).diff(w.recentStart, "day")).toBe(89);
    expect(dayjs(w.recentStart).diff(w.priorStart, "day")).toBe(90);
  });
});

describe("overviewScopeSentence", () => {
  it("names the last logged workout, with the year only when it isn't this year", () => {
    expect(overviewScopeSentence(parsed([logRow("11/06/2026", "FRAN")]), TODAY)).toBe(
      "Uses your full history, as of today. Last workout logged Nov 6."
    );
    expect(overviewScopeSentence(parsed([logRow("12/30/2025", "FRAN")]), TODAY)).toBe(
      "Uses your full history, as of today. Last workout logged Dec 30, 2025."
    );
  });

  it("ignores a workout dated after today", () => {
    const rows = parsed([logRow("11/06/2026", "FRAN"), logRow("12/01/2026", "GRACE")]);
    expect(overviewScopeSentence(rows, TODAY)).toMatch(/Last workout logged Nov 6\.$/);
  });
});

describe("daysTrainedStat", () => {
  it("counts days, not entries, all time and in each window", () => {
    const rows = parsed([
      logRow(daysAgo(200), "A"),
      logRow(daysAgo(100), "B"),
      logRow(daysAgo(10), "C"),
      logRow(daysAgo(10), "D"), // same day: one day trained
      logRow(daysAgo(0), "E"),
    ]);
    expect(daysTrainedStat(rows, TODAY)).toEqual({ total: 4, recent: 2, prior: 1 });
  });

  it("drops the comparison when the earlier window is entirely before the first workout", () => {
    const rows = parsed([logRow(daysAgo(30), "A"), logRow(daysAgo(5), "B")]);
    expect(daysTrainedStat(rows, TODAY)).toEqual({ total: 2, recent: 2, prior: null });
  });

  it("keeps a zero comparison when training started inside the earlier window", () => {
    const rows = parsed([logRow(daysAgo(91), "A"), logRow(daysAgo(5), "B")]);
    expect(daysTrainedStat(rows, TODAY).prior).toBe(1);
  });
});

describe("latestPrStat", () => {
  it("is null with no PR ever logged", () => {
    expect(latestPrStat(parsed([logRow(daysAgo(1), "FRAN")]), TODAY)).toBeNull();
  });

  it("reads SugarWOD's PR flag: the latest PR, its score and date, and the count in the last 90 days", () => {
    const rows = parsed([
      liftRow(daysAgo(200), "Back Squat", 250, { pr: "PR", best_result_display: "250 lb" }),
      liftRow(daysAgo(40), "Deadlift", 315, { pr: "PR", best_result_display: "315 lb" }),
      logRow(daysAgo(12), "Back Squat 3RM", "", { pr: "PR", best_result_display: "285 lb" }),
      logRow(daysAgo(12), "FRAN", "", { pr: "PR", best_result_display: "3:58" }),
      logRow(daysAgo(2), "GRACE"),
    ]);
    expect(latestPrStat(rows, TODAY)).toEqual({
      title: "Back Squat 3RM",
      display: "285 lb",
      date: dayjs(TODAY).subtract(12, "day").format("YYYY-MM-DD"),
      moreThatDay: 1,
      recentCount: 3,
    });
  });
});

describe("bodyWeightStat", () => {
  const r = (n: number, weightLb: number): BodyReading => ({ date: dayjs(TODAY).subtract(n, "day").format("YYYY-MM-DD"), weightLb });

  it("is null with no readings", () => {
    expect(bodyWeightStat([], 3, TODAY)).toBeNull();
  });

  it("gives a single reading no change lines", () => {
    expect(bodyWeightStat([r(4, 180)], 3, TODAY)).toMatchObject({ latestLb: 180, readings: 1, recent: null, sinceFirst: null });
  });

  it("measures the 90-day change from the last reading on or before the window's start", () => {
    const stat = bodyWeightStat([r(300, 195), r(120, 186), r(95, 185.5), r(30, 184), r(3, 183.4)], 1, TODAY)!;
    expect(stat.latestLb).toBe(183.4);
    expect(stat.recent).toEqual({ kind: "change", lb: 183.4 - 185.5 });
    expect(stat.sinceFirst).toEqual({ kind: "change", lb: 183.4 - 195 });
  });

  it("reads a change inside the noise band as within normal scan variation", () => {
    const stat = bodyWeightStat([r(100, 184), r(3, 183)], 3, TODAY)!;
    expect(stat.recent).toEqual({ kind: "within" });
    expect(weightChangeText(stat.recent!, "recent")).toBe("Within normal scan variation over 90 days");
  });

  it("leaves the 90-day line out without a reading that old, or without one inside the window", () => {
    expect(bodyWeightStat([r(60, 190), r(3, 183)], 1, TODAY)!.recent).toBeNull();
    expect(bodyWeightStat([r(300, 190), r(120, 183)], 1, TODAY)!.recent).toBeNull();
  });

  it("writes a change with a real minus sign and one decimal at most", () => {
    expect(weightChangeText({ kind: "change", lb: -2.1000001 }, "recent")).toBe("−2.1 lb in 90 days");
    expect(weightChangeText({ kind: "change", lb: 9.6 }, "sinceFirst")).toBe("+9.6 lb since first reading");
  });
});

describe("progressStat", () => {
  const headline = (over: Partial<ProgressHeadline>): ProgressHeadline => ({
    label: null,
    up: 0,
    down: 0,
    noClearChange: 0,
    counted: 0,
    moveUps: 0,
    leftOut: { under6: 0, notRecent: 0, notTested: 0 },
    longGaps: 0,
    closest: [],
    ...over,
  });

  it("restates the label with the count that earned it, then the rest", () => {
    expect(progressStat(headline({ label: "Improving", up: 5, noClearChange: 2, down: 1, counted: 8 }))).toEqual({
      value: "Improving",
      lines: ["Up in 5 of 8 lifts and benchmarks", "2 no clear change, 1 down"],
    });
    expect(progressStat(headline({ label: "Steady", up: 1, noClearChange: 4, down: 1, counted: 6 }))).toEqual({
      value: "Steady",
      lines: ["Across 6 lifts and benchmarks", "1 up, 4 no clear change, 1 down"],
    });
    expect(progressStat(headline({ label: "Declining", down: 3, counted: 3 }))).toEqual({
      value: "Declining",
      lines: ["Down in 3 of 3 lifts and benchmarks"],
    });
  });

  it("says what a missing headline is waiting for, in Progress's wording", () => {
    expect(progressStat(headline({ counted: 2 }))).toEqual({
      value: "No headline yet",
      lines: ["Needs 3 lifts or benchmarks with a verdict, has 2."],
    });
  });
});

describe("OverviewTab totals", () => {
  it("shows days trained, most recent PR, body weight and progress, in that order", async () => {
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} granularity="monthly" workouts={rows} asOf={TODAY} />);
    const totals = screen.getByRole("region", { name: "Totals" });
    const labels = ["days trained", "most recent PR", "body weight", "progress"].map((l) => within(totals).getByText(l));
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1]!.compareDocumentPosition(labels[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // No InBody data or weigh-ins passed: the body stat says so.
    expect(within(totals).getByText("No body data yet")).toBeInTheDocument();
    // The old range-scoped totals have moved to Workouts.
    expect(within(totals).queryByText("workouts logged")).not.toBeInTheDocument();
    expect(within(totals).queryByText("as prescribed")).not.toBeInTheDocument();
  });

  it("opens each stat's section: PRs on Lifts, body weight on Body Comp, the headline on Progress", async () => {
    const rows = await loadSampleRows();
    const onNavigate = vi.fn();
    render(<OverviewTab insights={buildInsights(rows)} granularity="monthly" workouts={rows} asOf={TODAY} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("most recent PR"));
    fireEvent.click(screen.getByText("body weight"));
    fireEvent.click(screen.getByText("progress"));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual([LIFT_HISTORY_TAB, BODY_COMP_TAB, LIFTS_TAB]);
  });
});
