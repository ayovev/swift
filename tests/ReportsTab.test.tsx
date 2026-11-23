import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ReportsTab } from "@/components/reports/ReportsTab";
import { clearBrand, updateBrand } from "@/lib/brand/brandStore";
import { loadSampleRows } from "./fixtures/sampleRows";

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({ capture: (e: unknown) => capture(e) }));

/** The Progress report on the bundled sample, as of the sample's own last day so the figures are fixed. */
const rows = await loadSampleRows();
const AS_OF = "2026-09-11";
// A 1x1 PNG, enough for parseBrand to accept as a logo.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function renderReport() {
  return render(
    <ThemeProvider>
      <ReportsTab workouts={rows} asOf={AS_OF} />
    </ThemeProvider>
  );
}
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

  it("says its basis in the footer: the log's last day and the report date", () => {
    renderReport();
    expect(within(sheet()).getByText(/Workout log through .* Report date Sep 11, 2026\./)).toBeInTheDocument();
  });

  it("compares with an earlier date only when one is chosen, and prints which date it compared from", () => {
    renderReport();
    expect(within(sheet()).queryByTestId("report-since")).toBeNull();
    expect(within(sheet()).queryByText(/^Compared from/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "6 months" }));
    expect(within(sheet()).getByTestId("report-since")).toBeInTheDocument();
    expect(within(sheet()).getByText("Compared from Mar 11, 2026.")).toBeInTheDocument();
  });

  it("refuses a date that is not before today, and prints no comparison for it", () => {
    renderReport();
    fireEvent.click(screen.getByRole("button", { name: "A date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-11" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date before today.");
    expect(within(sheet()).queryByTestId("report-since")).toBeNull();
  });

  it("leaves a section out when it is switched off", () => {
    renderReport();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lifts and benchmarks" }));
    expect(within(sheet()).queryByTestId("report-verdicts")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /^Not judged/ }));
    expect(within(sheet()).getByTestId("report-not-judged")).toBeInTheDocument();
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
