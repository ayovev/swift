import dayjs from "dayjs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { bodySourcesCaption } from "@/components/dashboard/overview/OverviewPanels";
import { LiftsTab } from "@/components/dashboard/LiftsTab";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { displayName } from "@/lib/analytics/insights/display";
import { BODY_COMP_TAB, LIFTS_TAB, LIFT_HISTORY_TAB, TIMELINE_TAB, WORKOUTS_TAB } from "@/components/dashboard/tabs";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { OVERVIEW_RECENT_DAYS } from "@/lib/analytics/insightConfig";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import type { ProgressHeadline } from "@/lib/analytics/insights/headline";
import {
  bodyWeightStat,
  daysTrainedStat,
  latestPrStat,
  latestTimelineEntry,
  monthlyDaysTrained,
  overviewScopeSentence,
  progressState,
  progressStat,
  recentWindow,
  monthlyModalityMix,
  weightChangeText,
  whatMoved,
  whatMovedEmptyText,
} from "@/lib/analytics/overview";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import type { TimelineEntry } from "@/types/timeline";
import { liftRow, logRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

// Steps 2 and 3 of docs/overview.md: Overview's totals row, scope sentence and
// panels, from the full history as of today. `today` is always passed in.

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
      scoreType: "",
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

  it("reads a change inside the noise band as within normal variation", () => {
    const stat = bodyWeightStat([r(100, 184), r(3, 183)], 3, TODAY)!;
    expect(stat.recent).toEqual({ kind: "within" });
    expect(weightChangeText(stat.recent!, "recent")).toBe("Within normal variation over 90 days");
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
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
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
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("most recent PR"));
    fireEvent.click(screen.getByText("body weight"));
    fireEvent.click(screen.getByText("progress"));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual([LIFT_HISTORY_TAB, BODY_COMP_TAB, LIFTS_TAB]);
  });
});

describe("monthlyDaysTrained", () => {
  it("covers the last 12 calendar months, ending with the current one, marked partial", () => {
    const months = monthlyDaysTrained(parsed([logRow("01/15/2024", "A"), logRow("11/02/2026", "B"), logRow("11/02/2026", "C")]), TODAY);
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe("2025-12");
    expect(months.at(-1)).toEqual({ month: "2026-11", days: 1, partial: true });
    expect(months.slice(0, -1).every((m) => !m.partial && m.days === 0)).toBe(true);
  });

  it("starts at the first logged month when the log is younger than a year", () => {
    const months = monthlyDaysTrained(parsed([logRow("08/20/2026", "A"), logRow("08/21/2026", "B"), logRow("10/01/2026", "C")]), TODAY);
    expect(months.map((m) => [m.month, m.days])).toEqual([
      ["2026-08", 2],
      ["2026-09", 0],
      ["2026-10", 1],
      ["2026-11", 0],
    ]);
  });

  it("follows each row's date, not the athlete's grouping", () => {
    const rows = [logRow("10/01/2026", "A"), logRow("10/20/2026", "B")];
    const weekly = buildInsights(rows, null, "weekly").allRows;
    expect(monthlyDaysTrained(weekly, TODAY).find((m) => m.month === "2026-10")?.days).toBe(2);
  });
});

describe("monthlyModalityMix", () => {
  it("covers the same months as the days chart, so the two line up column for column", () => {
    const rows = parsed([logRow("08/20/2026", "FRAN", "21-15-9Thrusters (65/95 lb)Pull-ups"), logRow("11/02/2026", "RUN", "5k run")]);
    expect(monthlyModalityMix(rows, TODAY).map((m) => m.month)).toEqual(monthlyDaysTrained(rows, TODAY).map((m) => m.month));
  });

  it("splits each month to 100, leaving unclassified workouts out and empty months without a split", () => {
    const mix = monthlyModalityMix(
      parsed([
        logRow("08/20/2026", "RUN", "5k run"),
        logRow("08/21/2026", "FRAN", "21-15-9Thrusters (65/95 lb)Pull-ups"),
        logRow("08/22/2026", "REST DAY", "mobility notes only"),
        logRow("10/03/2026", "ROW", "2000m row"),
      ]),
      TODAY
    );
    const aug = mix.find((m) => m.month === "2026-08")!;
    expect(aug.workouts).toBe(2);
    expect(aug.unclassified).toBe(1);
    expect(aug.split!.M).toBe(50);
    expect(aug.split!.M + aug.split!.W + aug.split!.G).toBeCloseTo(100, 5);
    expect(mix.find((m) => m.month === "2026-09")).toEqual({ month: "2026-09", split: null, workouts: 0, unclassified: 0, partial: false });
    expect(mix.find((m) => m.month === "2026-10")?.split).toEqual({ M: 100, W: 0, G: 0 });
    expect(mix.at(-1)).toMatchObject({ month: "2026-11", partial: true, split: null });
  });

  it("says beside the chart how many workouts it left out", () => {
    const rows = [logRow(daysAgo(3), "RUN", "5k run"), logRow(daysAgo(4), "REST DAY", "mobility notes only"), logRow(daysAgo(5), "NOTES", "felt good")];
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    const mix = screen.getByRole("region", { name: "What it was made of" });
    expect(within(mix).getByText("2 workouts with no recognised movement are left out.")).toBeInTheDocument();
  });

  it("reads the same 12 months whatever the athlete's grouping", () => {
    const rows = [logRow("10/01/2026", "RUN", "5k run")];
    expect(monthlyModalityMix(buildInsights(rows, null, "weekly").allRows, TODAY)).toEqual(monthlyModalityMix(parsed(rows), TODAY));
  });
});

describe("whatMoved", () => {
  const row = (key: string, group: ProgressRow["group"], latest: string) => ({ subject: { key }, group, latest }) as unknown as ProgressRow;

  it("keeps up and down only, most recently logged first, at most five", () => {
    const rows = [
      row("a", "up", "2026-01-01"),
      row("b", "no-clear-change", "2026-11-01"),
      row("c", "down", "2026-10-01"),
      row("d", "up", "2026-09-01"),
      row("e", "up", "2026-08-01"),
      row("f", "up", "2026-07-01"),
      row("g", "down", "2026-06-01"),
      row("h", "few", "2026-11-05"),
    ];
    expect(whatMoved(rows).rows.map((r) => r.subject.key)).toEqual(["c", "d", "e", "f", "g"]);
    expect(whatMoved(rows).moreDown).toBe(0);
  });

  it("never lets recent ups push a down off the panel", () => {
    // The sample's shape: ten ups logged recently, one down logged long ago. Sorting by recency alone listed five ups.
    const ups = Array.from({ length: 10 }, (_, i) => row(`u${i}`, "up", `2026-10-${String(20 - i).padStart(2, "0")}`));
    const got = whatMoved([...ups, row("old-down", "down", "2025-04-01")]);
    expect(got.rows.map((r) => r.subject.key)).toEqual(["u0", "u1", "u2", "u3", "old-down"]);
    expect(got.moreDown).toBe(0);
  });

  it("keeps two slots for downs and counts the rest", () => {
    const ups = Array.from({ length: 6 }, (_, i) => row(`u${i}`, "up", `2026-10-${String(20 - i).padStart(2, "0")}`));
    const downs = ["2025-01-01", "2025-02-01", "2025-03-01"].map((d, i) => row(`d${i}`, "down", d));
    const got = whatMoved([...ups, ...downs]);
    expect(got.rows.map((r) => r.subject.key)).toEqual(["u0", "u1", "u2", "d2", "d1"]);
    expect(got.moreDown).toBe(1);
  });

  it("gives slots ups don't need back to downs", () => {
    const downs = Array.from({ length: 7 }, (_, i) => row(`d${i}`, "down", `2026-0${i + 1}-01`));
    const got = whatMoved([row("u", "up", "2025-01-01"), ...downs]);
    expect(got.rows).toHaveLength(5);
    expect(got.rows.filter((r) => r.group === "down")).toHaveLength(4);
    expect(got.moreDown).toBe(3);
  });

  it("lists the sample's one down on Overview, matching the totals row's count", async () => {
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    const moved = screen.getByText("What moved").closest("[data-slot=card]") as HTMLElement;
    expect(within(moved).getAllByText("Down")).toHaveLength(1);
  });

  it("names a move up to RX in its pill, as the Timeline does, rather than a bare Up", async () => {
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    const moved = screen.getByText("What moved").closest("[data-slot=card]") as HTMLElement;
    const moves = [...moved.querySelectorAll("[data-verdict=move-up]")];
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(m.textContent).toBe("Moved up to RX");
  });
});

describe("latestTimelineEntry", () => {
  const entry = (id: string, startDate: string, endDate: string | null): TimelineEntry => ({ id, initiation: "changed", area: "nutrition", startDate, endDate });

  it("prefers the ongoing entry that started most recently, and counts the other ongoing ones", () => {
    const got = latestTimelineEntry([entry("a", "2026-01-01", null), entry("b", "2026-09-02", null), entry("c", "2026-10-01", "2026-10-20")], TODAY);
    expect(got).toEqual({ entry: expect.objectContaining({ id: "b" }), moreOngoing: 1 });
  });

  it("falls back to the entry that ended most recently, and ignores one starting after today", () => {
    const got = latestTimelineEntry([entry("a", "2026-01-01", "2026-02-01"), entry("b", "2026-05-01", "2026-06-01"), entry("z", "2026-12-01", null)], TODAY);
    expect(got).toEqual({ entry: expect.objectContaining({ id: "b" }), moreOngoing: 0 });
    expect(latestTimelineEntry([], TODAY)).toBeNull();
  });
});

describe("OverviewTab panels", () => {
  it("replaces the range-driven charts with the three panels", async () => {
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    expect(screen.getByText("Showing up")).toBeInTheDocument();
    expect(screen.getByText("Last 12 months, by month")).toBeInTheDocument();
    expect(screen.getByText("What moved")).toBeInTheDocument();
    expect(screen.getByText("Body weight")).toBeInTheDocument();
    expect(screen.queryByText("Where your training went")).not.toBeInTheDocument();
    expect(screen.queryByText("Cardio, weights, gymnastics")).not.toBeInTheDocument();
    // The Training panel's mix is a 12-month chart now; the most-trained list is gone.
    expect(screen.getByText("Weightlifting, gymnastics, cardio")).toBeInTheDocument();
    expect(screen.queryByText(/Most trained/)).not.toBeInTheDocument();
    expect(screen.queryByText("Last 90 days")).not.toBeInTheDocument();
  });

  it("says a lift's change in What moved is an estimated 1RM, so it can't be read against the logged PR beside it", async () => {
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    const moved = screen.getByText("What moved").closest("[data-slot=card]") as HTMLElement;
    const changes = within(moved).getAllByText(/ lb\b/);
    expect(changes.length).toBeGreaterThan(0);
    for (const line of changes) expect(line.textContent).toContain("lb est. 1RM");
  });

  it("keys the in-progress month's hatch, and only when the chart has a current month", () => {
    const current = [logRow(daysAgo(2), "FRAN")];
    const { unmount } = render(<OverviewTab insights={buildInsights(current)} workouts={current} asOf={TODAY} />);
    expect(screen.getByText("This month so far")).toBeInTheDocument();
    unmount();
    // A log that ended over a year ago draws an empty current month: no hatched bar, so nothing to key.
    const old = [logRow(daysAgo(500), "FRAN")];
    render(<OverviewTab insights={buildInsights(old)} workouts={old} asOf={TODAY} />);
    expect(screen.queryByText("This month so far")).not.toBeInTheDocument();
  });

  it("says what's missing in one line each, and still offers the sections", () => {
    const rows = [logRow(daysAgo(200), "FRAN")];
    const onNavigate = vi.fn();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} onNavigate={onNavigate} />);
    expect(screen.getByText("No classified workouts in the last 12 months.")).toBeInTheDocument();
    // No lift logged at all: nothing moved is not the same as nothing measured.
    expect(screen.getAllByText("No lift or benchmark has been logged yet.")).toHaveLength(2); // the stat and the panel
    expect(screen.queryByText("No lift or benchmark has changed enough to call.")).not.toBeInTheDocument();
    expect(screen.getByText("No timeline entries yet.")).toBeInTheDocument();
    // The prompt is said once, in the panel; the totals stat doesn't repeat it.
    expect(screen.getAllByText(/Upload an InBody export or add a weigh-in/)).toHaveLength(1);
    for (const name of ["See workouts", "See progress", "See timeline", "See body composition"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual([WORKOUTS_TAB, LIFTS_TAB, TIMELINE_TAB, BODY_COMP_TAB]);
  });

  it("shows a single body reading's number and date once, in the totals, and no line", () => {
    const rows = [logRow(daysAgo(2), "FRAN")];
    render(
      <OverviewTab
        insights={buildInsights(rows)}
        workouts={rows}
        asOf={TODAY}
        weighIns={[{ date: "2026-11-01", weightLb: 183.4, source: "manual" }]}
      />
    );
    expect(screen.getByText("Read Nov 1")).toBeInTheDocument();
    expect(screen.getAllByText(/183\.4 lb/)).toHaveLength(1);
    expect(screen.getByText("One reading so far. A second draws the line.")).toBeInTheDocument();
  });

  it("replaces an empty year of Showing up with one line, not blank axes", () => {
    const rows = [logRow(daysAgo(500), "5K RUN", "5k run")];
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    expect(screen.getByText("No workouts in the last 12 months.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /days trained per month/ })).not.toBeInTheDocument();
    expect(screen.queryByText("This month so far")).not.toBeInTheDocument();
  });

  it("names the latest timeline entry by name and area", () => {
    const rows = [logRow(daysAgo(2), "FRAN")];
    const timeline: TimelineEntry[] = [{ id: "1", initiation: "changed", area: "nutrition", name: "Cut", startDate: "2026-09-02", endDate: null }];
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} timeline={timeline} />);
    expect(screen.getByText("Ongoing since Sep 2: Cut, Nutrition.")).toBeInTheDocument();
  });

  it("opens a moved lift's own row on Progress", async () => {
    const rows = await loadSampleRows();
    const onOpenProgressSubject = vi.fn();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} onOpenProgressSubject={onOpenProgressSubject} />);
    const moved = screen.getByText("What moved").closest("[data-slot=card]") as HTMLElement;
    const first = within(moved).getAllByRole("listitem")[0]!;
    fireEvent.click(within(first).getByRole("button"));
    expect(onOpenProgressSubject).toHaveBeenCalledTimes(1);
    expect(typeof onOpenProgressSubject.mock.calls[0]![0]).toBe("string");
  });
});

describe("Progress, reached from What moved", () => {
  it("opens the chosen row and leaves the others closed", async () => {
    const rows = await loadSampleRows();
    const moved = whatMoved(classifySubjects(buildProgressSubjects(rows).subjects, TODAY).rows).rows.filter((r) => r.verdict);
    expect(moved.length).toBeGreaterThan(1);
    const [target, other] = moved;
    render(<LiftsTab workouts={rows} scans={[]} asOf={TODAY} focusSubjectKey={target!.subject.key} />);
    const button = (r: ProgressRow) =>
      screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false })).find((b) => b.textContent?.startsWith(displayName(r.subject)))!;
    expect(button(target!)).toHaveAttribute("aria-expanded", "true");
    expect(button(other!)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("bodySourcesCaption", () => {
  it("names only the sources the weight line is drawn from", () => {
    expect(bodySourcesCaption(12, 0)).toBe("InBody scans");
    expect(bodySourcesCaption(0, 5)).toBe("Weigh-ins");
    expect(bodySourcesCaption(12, 5)).toBe("InBody scans and weigh-ins");
    expect(bodySourcesCaption(0, 0)).toBeNull();
  });
});

describe("progressState and the empty-state words", () => {
  const h = (counted: number) => ({ label: null, up: 0, down: 0, noClearChange: counted, counted, moveUps: 0, leftOut: { under6: 0, notRecent: 0, notTested: 0 }, longGaps: 0, closest: [] }) as ProgressHeadline;
  const r = (group: ProgressRow["group"]) => ({ group }) as ProgressRow;

  it("tells nothing logged, nothing recent, too few to compare and nothing moved apart", () => {
    expect(progressState([], h(0))).toBe("none-logged");
    expect(progressState([r("not-recent"), r("not-recent")], h(0))).toBe("not-recent");
    expect(progressState([r("few"), r("not-recent")], h(0))).toBe("too-few");
    expect(progressState([r("no-clear-change"), r("few")], h(1))).toBe("counted");
  });

  it("only says nothing changed once something could be compared", () => {
    expect(whatMovedEmptyText("counted")).toBe("No lift or benchmark has changed enough to call.");
    expect(whatMovedEmptyText("too-few")).toBe("Nothing to compare yet: a lift or benchmark needs 6 sessions.");
    expect(whatMovedEmptyText("not-recent")).toBe("No lift or benchmark was logged in the last 12 months.");
    expect(whatMovedEmptyText("none-logged")).toBe("No lift or benchmark has been logged yet.");
  });

  it("gives an old log the same reason Progress gives, not a session count", () => {
    expect(progressStat(h(0), "not-recent")).toEqual({ value: "No headline yet", lines: ["No lift or benchmark was logged in the last 12 months."] });
  });
});

describe("Overview's most recent PR", () => {
  it("shows the score with its unit, as a load in pounds", () => {
    const rows = [liftRow(daysAgo(3), "Back Squat", 285, { pr: "PR", best_result_display: "285", title: "Back Squat 3RM" })];
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf={TODAY} />);
    expect(screen.getByText(/^285 lb · Nov 6/)).toBeInTheDocument();
  });
});
