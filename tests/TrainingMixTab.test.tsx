import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TrainingMixTab } from "@/components/reports/TrainingMixTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleRows } from "./fixtures/sampleRows";

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({ capture: (e: unknown) => capture(e) }));

/** The Training mix report on the bundled sample, as of the sample's own last day so the figures are fixed. */
const rows = await loadSampleRows();
const insights = buildInsights(rows);
const AS_OF = "2026-09-11";

function renderReport() {
  return render(
    <ThemeProvider>
      <TrainingMixTab parsedRows={insights.allRows} asOf={AS_OF} />
    </ThemeProvider>
  );
}
const sheet = (): HTMLElement => screen.getByRole("article", { name: "Training mix report" });

beforeEach(() => {
  capture.mockClear();
  window.print = vi.fn();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("the Training mix report", () => {
  it("states how much was trained, and every section's chart with its summary sentence", () => {
    renderReport();
    const page = within(sheet());
    expect(page.getByTestId("mix-summary")).toHaveTextContent(/\d[\d,]* workouts on \d[\d,]* training days, through Sep 11, 2026\./);
    for (const id of ["mix-days", "mix-modalities", "mix-domains", "mix-movements"]) expect(page.getByTestId(id)).toBeInTheDocument();
    // Each chart is followed by its summary sentence (R-6), and carries it as its name.
    expect(page.getByText(/^Days trained per month, .* to .*\. Lowest .*highest .*latest /)).toBeInTheDocument();
    expect(page.getByRole("img", { name: /^Average split of a classified workout/ })).toBeInTheDocument();
    expect(page.getByText(/add up to more than 100%/)).toBeInTheDocument();
  });

  it("keeps the ten domains as tags (separate bars, sorted) and the modalities as a split that adds to 100", () => {
    renderReport();
    const domains = within(within(sheet()).getByTestId("mix-domains")).getAllByRole("listitem");
    expect(domains).toHaveLength(10);
    const shares = domains.map((li) => Number(li.textContent!.match(/(\d+)%$/)![1]));
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    expect(shares.reduce((n, v) => n + v, 0)).toBeGreaterThan(100);

    const key = within(sheet()).getByTestId("mix-modalities");
    expect(key).toHaveTextContent("W · ");
    expect(key).toHaveTextContent("G · ");
    expect(key).toHaveTextContent("M · ");
  });

  it("shows tables instead of charts when the app's chart preference is Table, and prints what it shows", () => {
    localStorage.setItem("swift.chartView", "table");
    renderReport();
    const page = within(sheet());
    expect(page.getByRole("region", { name: "Days trained per month" })).toBeInTheDocument();
    expect(page.getByRole("region", { name: "M/W/G split per month" })).toBeInTheDocument();
    expect(page.getByRole("region", { name: "Share of workouts touching each domain" })).toBeInTheDocument();
    expect(page.queryAllByRole("img", { name: /^Days trained per month|^Average split|^Share of workouts/ })).toHaveLength(0);
  });

  it("switches every chart to a table with the Charts switch", () => {
    renderReport();
    expect(within(sheet()).queryByRole("region", { name: "Days trained per month" })).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "Show charts as" })).getByRole("button", { name: "Table" }));
    expect(within(sheet()).getByRole("region", { name: "Days trained per month" })).toBeInTheDocument();
  });

  it("offers charts or tables as a segmented control that shows which is selected, and reports only that it was used", () => {
    renderReport();
    const group = screen.getByRole("group", { name: "Show charts as" });
    const chart = within(group).getByRole("button", { name: "Chart" });
    const table = within(group).getByRole("button", { name: "Table" });
    expect(chart).toHaveAttribute("aria-pressed", "true");
    expect(table).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(table);
    expect(table).toHaveAttribute("aria-pressed", "true");
    expect(chart).toHaveAttribute("aria-pressed", "false");
    // Choosing the one already selected changes nothing and sends nothing more.
    fireEvent.click(table);
    expect(capture.mock.calls.filter(([e]) => (e as { props?: { interaction?: string } }).props?.interaction === "chart_view_toggled")).toHaveLength(1);
  });

  it("says once how many entries sit outside the M/W/G split", () => {
    renderReport();
    expect(within(sheet()).getAllByTestId("mix-unclassified")).toHaveLength(1);
    expect(within(sheet()).getByTestId("mix-unclassified")).toHaveTextContent(/of [\d,]+ entries had no recognized movement and sit outside the M\/W\/G split\./);
  });

  it("lists the most-used movements, and leaves a section out when it is switched off", () => {
    renderReport();
    expect(within(within(sheet()).getByTestId("mix-movements")).getAllByRole("listitem").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Most-used movements" }));
    expect(within(sheet()).queryByTestId("mix-movements")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "The ten domains" }));
    expect(within(sheet()).queryByTestId("mix-domains")).toBeNull();
  });
});

describe("the period", () => {
  it("uses the app's presets and narrows the report to the period", () => {
    renderReport();
    const group = screen.getByRole("group", { name: "Period" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "All time", "Last month", "Last 3 months", "Last 6 months", "Last 9 months", "Last year", "Custom",
    ]);
    const all = within(sheet()).getByTestId("mix-summary").textContent!;
    fireEvent.click(screen.getByRole("button", { name: "Last 3 months" }));
    expect(screen.getByTestId("report-period")).toHaveTextContent("Jun 11, 2026 – Sep 11, 2026");
    expect(within(sheet()).getByTestId("mix-summary").textContent).not.toBe(all);
  });

  it("reports a closed block through its last day, with nothing after it", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-01-06" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2025-06-30" } });
    const page = within(sheet());
    expect(page.getByTestId("report-period")).toHaveTextContent("Jan 6, 2025 – Jun 30, 2025");
    expect(page.getByText(/Report covers through Jun 30, 2025\./)).toBeInTheDocument();
  });

  it("says so, and draws nothing, for a period with no workouts", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2020-12-31" } });
    expect(within(sheet()).getByTestId("mix-empty")).toHaveTextContent("No workouts were logged in this period.");
    expect(within(sheet()).queryByTestId("mix-days")).toBeNull();
  });
});

describe("the coach's report and printing", () => {
  it("prints the coach note at the end, only for a coach", () => {
    renderReport();
    expect(screen.queryByLabelText(/^Coach note/)).toBeNull();
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "Good volume this block." } });
    const note = within(screen.getAllByRole("article", { name: "Training mix report" })[1]!).getByTestId("report-note");
    expect(note).toHaveTextContent("Good volume this block.");
  });

  it("reports only that a Training mix report was generated, and for whom", () => {
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "A private note" } });
    fireEvent.click(screen.getByRole("button", { name: /Print or save as PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({ name: "report_generated", props: { report_kind: "training-mix", audience: "coach" } });
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/private|Squat|Fran/i);
  });

  it("keeps the controls out of print, so the sheet is all that prints", () => {
    renderReport();
    expect(screen.getByRole("button", { name: /Print or save as PDF/ }).closest("div.print\\:hidden")).not.toBeNull();
    expect(sheet().closest(".print\\:hidden")).toBeNull();
  });
});
