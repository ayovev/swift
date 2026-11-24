import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { BodyTrainingTab } from "@/components/reports/BodyTrainingTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { scanRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({ capture: (e: unknown) => capture(e) }));

/** The Body and training report on the bundled sample, as of the sample's own last day so the figures are fixed. */
const insights = buildInsights(await loadSampleRows());
const AS_OF = "2026-09-11";

const scans = [
  scanRow("2025-01-10", { "Weight(lb)": "190.0", "Soft Lean Mass(lb)": "150.0", "Body Fat Mass(lb)": "30.0" }),
  scanRow("2025-03-10", { "Weight(lb)": "186.0", "Soft Lean Mass(lb)": "151.0", "Body Fat Mass(lb)": "26.0" }),
  scanRow("2025-05-10", { "Weight(lb)": "184.0", "Soft Lean Mass(lb)": "152.0", "Body Fat Mass(lb)": "23.0" }),
];
const weighIns: WeighIn[] = [{ date: "2025-04-01", weightLb: 185, source: "manual" }, { date: "2025-04-15", weightLb: 184.5, source: "manual" }];
const timeline: TimelineEntry[] = [
  { id: "c", initiation: "changed", area: "nutrition", name: "Spring cut", startDate: "2025-02-01", endDate: "2025-04-30" },
  { id: "h", initiation: "happened", area: "travel", name: "Two weeks abroad", startDate: "2025-03-01", endDate: "2025-03-14" },
];

function renderReport(props: Partial<Parameters<typeof BodyTrainingTab>[0]> = {}) {
  return render(
    <ThemeProvider>
      <BodyTrainingTab parsedRows={insights.allRows} scans={scans} weighIns={weighIns} timeline={timeline} asOf={AS_OF} {...props} />
    </ThemeProvider>
  );
}
const sheet = (): HTMLElement => screen.getByRole("article", { name: "Body and training report" });
const customPeriod = (from: string, to: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
};

beforeEach(() => {
  capture.mockClear();
  window.print = vi.fn();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("when there is nothing to report on", () => {
  it("says it needs an InBody file or weigh-ins, and draws no report", () => {
    renderReport({ scans: [], weighIns: [] });
    expect(screen.getByTestId("body-training-unavailable")).toHaveTextContent("Needs an InBody file or weigh-ins.");
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("button", { name: /Print or save as PDF/ })).toBeNull();
  });

  it("runs on weigh-ins alone", () => {
    renderReport({ scans: [], weighIns });
    expect(within(sheet()).getByTestId("body-weight")).toBeInTheDocument();
    // No scans: lean and fat mass start off, and cannot be switched on.
    expect(screen.getByRole("checkbox", { name: /^Lean and fat mass/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^Lean and fat mass/ })).toBeDisabled();
  });
});

describe("the Body and training report", () => {
  beforeEach(() => {
    renderReport();
    customPeriod("2025-01-01", "2025-06-30");
  });

  it("prints body weight with where each reading came from, its change and its noise band", () => {
    const body = within(within(sheet()).getByTestId("body-weight"));
    expect(body.getByText(/Body weight, 5 readings \(3 from scans, 2 from weigh-ins\)/)).toBeInTheDocument();
    expect(body.getByText(/Body weight, first reading to last in this period: 190 lb to 184 lb, down 6 lb\./)).toBeInTheDocument();
    expect(body.getByText(/A change of [\d.]+ lb or less between readings is within normal variation\./)).toBeInTheDocument();
  });

  it("starts with lean and fat mass on for an athlete who has InBody scans, and the switch turns it off", () => {
    expect(screen.getByRole("checkbox", { name: /^Lean and fat mass/ })).toBeChecked();
    expect(within(sheet()).getByTestId("body-leanfat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Lean and fat mass/ }));
    expect(within(sheet()).queryByTestId("body-leanfat")).toBeNull();
  });

  it("puts days trained per month beside the body data, over the same period", () => {
    expect(within(sheet()).getByTestId("mix-days")).toBeInTheDocument();
    expect(within(sheet()).getByText(/^Days trained per month, Jan 25 to Jun 25\./)).toBeInTheDocument();
  });

  it("shows Progress as of the end of the period and says the report does not relate it to the body data", () => {
    const card = within(sheet()).getByTestId("body-headline");
    expect(card).toHaveTextContent(/^Progress as of Jun 30, 2025: (Improving|Steady|Declining|No headline yet)/);
    expect(card).toHaveTextContent("This report does not relate them.");
  });

  it("numbers the entries that touch the period, in the order they are shaded on the chart", () => {
    const key = within(sheet()).getByTestId("body-entry-key");
    const items = within(key).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^1\. Spring cut · Something I changed · Nutrition/),
      expect.stringMatching(/^2\. Two weeks abroad · Something that happened · Travel/),
    ]);
    // Notes are not printed.
    expect(sheet()).not.toHaveTextContent(/note/i);
  });

  it("states the basis of every source, and where the report stops", () => {
    expect(within(sheet()).getByText(/Workout log through .*\. InBody scans through May 10, 2025\. Weigh-ins through Apr 15, 2025\. Report covers through Jun 30, 2025\./)).toBeInTheDocument();
  });

  it("says so, and draws no chart, for a period with no readings", () => {
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2024-06-30" } });
    expect(within(sheet()).getByText("No body readings fall in this period.")).toBeInTheDocument();
  });

  it("shows tables, with the entries listed, when the chart preference is Table", () => {
    fireEvent.click(within(screen.getByRole("group", { name: "Show charts as" })).getByRole("button", { name: "Table" }));
    const page = within(sheet());
    expect(page.getByRole("region", { name: "Body weight readings" })).toBeInTheDocument();
    expect(page.getByRole("region", { name: "Days trained per month" })).toBeInTheDocument();
    expect(page.getByTestId("body-entries")).toBeInTheDocument();
  });
});

describe("the coach's report and printing", () => {
  it("prints the coach note at the end, only for a coach", () => {
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "Weight is moving the right way." } });
    expect(within(sheet()).getByTestId("report-note")).toHaveTextContent("Weight is moving the right way.");
  });

  it("warns that a saved copy holds health data", () => {
    renderReport();
    expect(screen.getByText(/holds health data/)).toBeInTheDocument();
  });

  it("reports only that a Body and training report was generated, and for whom", () => {
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "A private note" } });
    fireEvent.click(screen.getByRole("button", { name: /Print or save as PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({ name: "report_generated", props: { report_kind: "body-training", audience: "coach" } });
    // No weight, date or note rides along.
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/private|190|184|2025/);
  });
});
