import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ReportsTab } from "@/components/reports/ReportsTab";
import { clearBrand, updateBrand } from "@/lib/brand/brandStore";
import type { TimelineEntry } from "@/types/timeline";
import { scanRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({ capture: (e: unknown) => capture(e) }));

/** The Progress report on the bundled sample, as of the sample's own last day so the figures are fixed. */
const rows = await loadSampleRows();
const AS_OF = "2026-09-11";
// A 1x1 PNG, enough for parseBrand to accept as a logo.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function renderReport(props: Partial<Parameters<typeof ReportsTab>[0]> = {}) {
  return render(
    <ThemeProvider>
      <ReportsTab workouts={rows} asOf={AS_OF} {...props} />
    </ThemeProvider>
  );
}

const changed: TimelineEntry = { id: "c", initiation: "changed", area: "training", name: "Strength block", startDate: "2025-01-06", endDate: "2025-06-30" };
const happened: TimelineEntry = { id: "h", initiation: "happened", area: "travel", name: "Two weeks abroad", startDate: "2025-03-01", endDate: "2025-03-14" };
const sheet = (): HTMLElement => screen.getByRole("article", { name: "Progress report" });

beforeEach(() => {
  capture.mockClear();
  window.print = vi.fn();
  localStorage.clear();
  clearBrand();
});
afterEach(() => {
  localStorage.clear();
  clearBrand();
});

describe("the Progress report", () => {
  it("prints the headline and each verdict from Progress's own words, with est. 1RM on a lift", () => {
    renderReport();
    const page = within(sheet());
    expect(page.getByText("Improving")).toBeInTheDocument();
    expect(page.getByRole("heading", { name: "Lifts and benchmarks" })).toBeInTheDocument();
    expect(page.getAllByText(/est\. 1RM/).length).toBeGreaterThan(0);
    // A verdict is a glyph and a word, never color alone.
    expect(sheet().querySelector("[data-verdict='up']")).not.toBeNull();
  });

  it("says its basis in the footer (the log's last day) and the report date in the header", () => {
    renderReport();
    expect(within(sheet()).getByText(/^Workout log through /)).toBeInTheDocument();
    expect(within(sheet()).getByTestId("report-prepared")).toHaveTextContent("Prepared Sep 11, 2026");
  });

  it("compares with an earlier date only when a period is chosen, and prints which date it compared from", () => {
    renderReport();
    expect(within(sheet()).queryByTestId("report-since")).toBeNull();
    expect(within(sheet()).queryByText(/^Compared from/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
    expect(within(sheet()).getByTestId("report-since")).toBeInTheDocument();
    expect(within(sheet()).getByText("Compared since Mar 11, 2026.")).toBeInTheDocument();
  });

  it("offers the app's own presets, the same ones the Training date range and the Progress filter use", () => {
    renderReport();
    const group = screen.getByRole("group", { name: "Period" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All time", "Last month", "Last 3 months", "Last 6 months", "Last 9 months", "Last year", "Custom",
    ]);
  });

  it("refuses a custom period whose start is not before its end, and prints no comparison for it", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("The start must be before the end");
    expect(within(sheet()).queryByTestId("report-since")).toBeNull();
  });

  it("reports a closed block as it stood on its last day, and says it covers through that day", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-01-06" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2025-06-30" } });
    const page = within(sheet());
    expect(page.getByTestId("report-period")).toHaveTextContent("Jan 6, 2025 – Jun 30, 2025");
    expect(page.getByText("Compared from Jan 6, 2025 to Jun 30, 2025.")).toBeInTheDocument();
    expect(page.getByRole("heading", { name: "From Jan 6, 2025 to Jun 30, 2025" })).toBeInTheDocument();
    expect(page.getByText(/Report covers through Jun 30, 2025\./)).toBeInTheDocument();
    // Nothing logged after the end is in it: the footer's basis is the last workout on or before it.
    expect(page.getByText(/Workout log through (?:Jun \d+|May \d+), 2025\./)).toBeInTheDocument();
    expect(page.getByRole("columnheader", { name: "At the end" })).toBeInTheDocument();
  });

  it("leaves a section out when it is switched off", () => {
    renderReport();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lifts and benchmarks" }));
    expect(within(sheet()).queryByTestId("report-verdicts")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Not judged/ }));
    expect(within(sheet()).getByTestId("report-not-judged")).toBeInTheDocument();
  });
});

describe("PRs since the comparison date", () => {
  it("lists the PRs flagged in SugarWOD after the chosen date, and only when a date is chosen", () => {
    renderReport();
    expect(within(sheet()).queryByTestId("report-prs")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /^PRs in the period/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
    const prs = within(sheet()).getByTestId("report-prs");
    expect(within(prs).getByRole("heading", { name: "PRs since Mar 11, 2026" })).toBeInTheDocument();
    expect(within(prs).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(prs).getByText(/PRs as flagged in SugarWOD/)).toBeInTheDocument();
  });

  it("leaves the section out when it is switched off", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^PRs in the period/ }));
    expect(within(sheet()).queryByTestId("report-prs")).toBeNull();
  });
});

describe("Changes you made", () => {
  it("has no section, and a disabled switch that says why, when the Timeline has no entries", () => {
    renderReport();
    expect(within(sheet()).queryByTestId("report-changes")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /^Changes you made/ })).toBeDisabled();
  });

  it("gives an entry the athlete changed a before and after, and an entry that happened only a context line", () => {
    renderReport({ timeline: [changed, happened] });
    const section = within(sheet()).getByTestId("report-changes");
    const items = within(section).getAllByTestId("report-change");
    expect(items).toHaveLength(2);

    expect(within(items[0]!).getByRole("heading", { name: "Strength block" })).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(/Improving|Steady|Declining|No before and after yet/);

    expect(within(items[1]!).getByRole("heading", { name: "Two weeks abroad" })).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Shown for context, with no before and after.");
    expect(items[1]).not.toHaveTextContent(/Improving|Declining|No before and after yet/);
  });

  it("limits the entries to those that touch the chosen period", () => {
    renderReport({ timeline: [changed, happened] });
    fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
    // Both entries ended in 2025, before Mar 11, 2026.
    expect(within(sheet()).queryByTestId("report-changes")).toBeNull();
  });

  it("prints body weight over an entry only when that section is on, and offers it only with readings", () => {
    const scans = [scanRow("2025-01-06", { "Weight(lb)": "190.0" }), scanRow("2025-06-30", { "Weight(lb)": "180.0" })];
    renderReport({ timeline: [changed], scans });
    expect(within(sheet()).queryByText(/Body weight over this entry/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Body weight over each entry/ }));
    expect(within(sheet()).getByText(/Body weight over this entry: 190 lb to 180 lb, down 10 lb/)).toBeInTheDocument();
  });

  it("disables the body switch and says why when there are no readings", () => {
    renderReport({ timeline: [changed] });
    expect(screen.getByRole("checkbox", { name: /^Body weight over each entry/ })).toBeDisabled();
    expect(screen.getByText(/needs InBody scans or weigh-ins/)).toBeInTheDocument();
  });
});

describe("the coach's report", () => {
  beforeEach(() => localStorage.setItem("swift.audience", "coach"));

  it("prints the coach note at the end, after the report body, and only when there is one", () => {
    renderReport();
    expect(within(sheet()).queryByTestId("report-note")).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "Nice block. Hold the squat work steady." } });
    const note = within(sheet()).getByTestId("report-note");
    expect(note).toHaveTextContent("Hold the squat work steady.");
    // Document order: the verdicts come before the note.
    expect(within(sheet()).getByTestId("report-verdicts").compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("limits the note to 500 characters and says it is not saved", () => {
    renderReport();
    const box = screen.getByLabelText(/^Coach note/);
    expect(box).toHaveAttribute("maxlength", "500");
    expect(screen.getByText(/Not saved/)).toBeInTheDocument();
  });

  it("shows the gym's logo beside the Swift mark", () => {
    updateBrand({ logo: PNG, name: "Iron Works" });
    renderReport();
    // The gym's logo leads the header row, and there is no separate gym-name label.
    expect(within(sheet()).queryByTestId("report-label")).toBeNull();
    const brand = within(sheet()).getByTestId("report-brand");
    expect(within(brand).getByRole("img", { name: "Iron Works" })).toBeInTheDocument();
    expect(within(sheet()).getAllByAltText("Swift").length).toBeGreaterThan(0);
  });
});

describe("the athlete's report", () => {
  it("has no coach note and no gym brand, only the Swift mark", () => {
    updateBrand({ logo: PNG, name: "Iron Works" });
    renderReport();
    expect(screen.queryByLabelText(/^Coach note/)).toBeNull();
    expect(within(sheet()).queryByTestId("report-brand")).toBeNull();
    expect(within(sheet()).getAllByAltText("Swift").length).toBeGreaterThan(0);
  });
});

describe("printing", () => {
  it("opens the print dialog and reports only which report and for whom", () => {
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "A private note" } });
    fireEvent.click(screen.getByRole("button", { name: /Print or save as PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({ name: "report_generated", props: { report_kind: "progress", audience: "coach" } });
    // Nothing from the note, the period, the sections or the log rides along.
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/private|Squat|Fran/i);
  });

  it("keeps the controls out of print, so the sheet is all that prints", () => {
    renderReport();
    const controls = screen.getByRole("button", { name: /Print or save as PDF/ }).closest("div.print\\:hidden");
    expect(controls).not.toBeNull();
    expect(sheet().closest(".print\\:hidden")).toBeNull();
  });
});
