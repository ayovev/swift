import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartViewToggle, seriesSummary, useChartView } from "@/components/dashboard/charts/ChartTable";
import { ShareAreaChart, type SharePoint } from "@/components/dashboard/charts/ShareAreaChart";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { EvidenceChart } from "@/components/dashboard/progress/EvidenceChart";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { loadSampleRows } from "./fixtures/sampleRows";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", async (orig) => ({ ...(await orig<typeof import("@/lib/posthog")>()), capture: posthog.capture }));

/**
 * Every chart has a table twin and a text alternative (ChartTable.tsx), and the evidence chart's dots are reachable by keyboard
 * (EvidenceChart.tsx): WCAG 1.1.1, 1.3.1 and 2.1.1.
 */

beforeEach(() => {
  window.localStorage.removeItem("swift.chartView");
  posthog.capture.mockClear();
});
afterEach(() => {
  window.localStorage.removeItem("swift.chartView");
  vi.restoreAllMocks();
});

function View({ id }: { id: string }) {
  const [view] = useChartView();
  return <span data-testid={id}>{view}</span>;
}

describe("the chart or table preference", () => {
  it("is one switch for every chart on the page, remembered on this device", () => {
    render(
      <>
        <ChartViewToggle />
        <View id="a" />
        <View id="b" />
      </>
    );
    expect(screen.getByTestId("a")).toHaveTextContent("chart");
    fireEvent.click(screen.getByRole("button", { name: "Show charts as tables" }));
    expect(screen.getByTestId("a")).toHaveTextContent("table");
    expect(screen.getByTestId("b")).toHaveTextContent("table");
    expect(window.localStorage.getItem("swift.chartView")).toBe("table");
    const back = screen.getByRole("button", { name: "Show charts" });
    expect(back).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(back);
    expect(screen.getByTestId("b")).toHaveTextContent("chart");
  });

  it("still switches when storage is blocked, for this tab", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <>
        <ChartViewToggle />
        <View id="a" />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Show charts as tables" }));
    expect(screen.getByTestId("a")).toHaveTextContent("table");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Show charts" }));
    });
  });

  it("tells analytics only that it was used", () => {
    render(<ChartViewToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Show charts as tables" }));
    expect(posthog.capture.mock.calls).toEqual([[{ name: "interaction_used", props: { interaction: "chart_view_toggled" } }]]);
  });
});

describe("seriesSummary", () => {
  it("names the span and the low, high and latest points", () => {
    const pts = [
      { label: "Jan", value: 80 },
      { label: "Feb", value: 55 },
      { label: "Mar", value: 92 },
      { label: "Apr", value: 79 },
    ];
    expect(seriesSummary("Strength share", pts, (v) => `${v}%`)).toBe("Strength share, Jan to Apr. Lowest 55% (Feb), highest 92% (Mar), latest 79% (Apr).");
    expect(seriesSummary("Strength share", [], (v) => `${v}%`)).toBe("Strength share: no data.");
  });
});

const point = (bucket: string, value: number, total: number): SharePoint => ({ bucket, value, total, basis: `${Math.round((value * total) / 100)} of ${total} workouts` });

describe("a share chart's twin", () => {
  const data = [point("2024-01", 80, 20), point("2024-02", 50, 2), point("2024-03", 70, 20)];

  it("names the chart by its summary", () => {
    render(<ShareAreaChart data={data} color="red" label="Strength share, month by month" seriesLabel="Strength" granularity="monthly" />);
    expect(screen.getByRole("img", { name: /^Strength share, month by month, Jan '24 to Mar '24\. Lowest 50\.0% \(Feb '24\)/ })).toBeInTheDocument();
  });

  it("shows every bucket with its share and what it is of, as a table", () => {
    window.localStorage.setItem("swift.chartView", "table");
    render(<ShareAreaChart data={data} color="red" label="Strength share" seriesLabel="Strength" granularity="monthly" />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Month", "Share", "Of"]);
    expect(within(table).getAllByRole("row")).toHaveLength(1 + data.length);
    expect(within(table).getByText("1 of 2 workouts, too few to join the line")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("Overview's twins", () => {
  it("puts both Training charts' months in one table", async () => {
    window.localStorage.setItem("swift.chartView", "table");
    const rows = await loadSampleRows();
    render(<OverviewTab insights={buildInsights(rows)} workouts={rows} asOf="2026-09-11" />);
    const training = screen.getByText("Showing up").closest("[data-slot=card]") as HTMLElement;
    const table = within(training).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Month", "Days trained", "W", "G", "M"]);
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(2);
  });
});

describe("the evidence chart", () => {
  async function backSquat() {
    const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, "2026-09-11");
    return rows.find((r) => r.subject.name === "Back Squat" && r.subject.status === "RX")!;
  }

  it("walks its sessions by keyboard, showing and announcing each", async () => {
    const row = await backSquat();
    const { container } = render(<EvidenceChart subject={row.subject} verdict={row.verdict} />);
    const chart = screen.getByRole("img", { name: /Sessions of Back Squat/ });
    expect(chart).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(chart, { key: "End" });
    const last = row.subject.sessions[row.subject.sessions.length - 1]!;
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    const live = container.querySelector("[aria-live=polite]") as HTMLElement;
    expect(live.textContent).toMatch(new RegExp(`^${Math.round(last.value)} lb est\\. on `));
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    const before = row.subject.sessions[row.subject.sessions.length - 2]!;
    expect(live.textContent).toMatch(new RegExp(`^${Math.round(before.value)} lb est\\. on `));
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(live.textContent).toBe("");
  });

  it("lists its sessions as a table, saying which window each was compared in", async () => {
    window.localStorage.setItem("swift.chartView", "table");
    const row = await backSquat();
    render(<EvidenceChart subject={row.subject} verdict={row.verdict} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Date", "Est. 1RM", "Compared as", "Max effort"]);
    expect(within(table).getAllByRole("row")).toHaveLength(1 + row.subject.sessions.length);
    expect(within(table).getAllByText("Recent")).toHaveLength(row.verdict!.recent.length);
    expect(within(table).getAllByText("Previous")).toHaveLength(row.verdict!.previous.length);
  });
});
