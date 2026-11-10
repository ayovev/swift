import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BodyCompTab } from "@/components/dashboard/BodyCompTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import dayjs from "dayjs";
import { scanRow } from "./fixtures/rows";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("BodyCompTab — empty state", () => {
  it("shows the upload dropzone when no InBody data is loaded", async () => {
    const rows = await loadSampleRows();
    const dashboard = buildInsights(rows, null, "monthly").dashboard;
    const onFile = vi.fn();

    render(<BodyCompTab state={{ status: "idle" }} granularity="monthly" range={null} onFile={onFile} dashboard={dashboard} />);

    expect(screen.getByRole("button", { name: "Upload your InBody CSV export" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /replace file/i })).not.toBeInTheDocument();
  });
});

describe("BodyCompTab — ready state", () => {
  it("offers a 'Replace file' control that forwards a newly picked file", async () => {
    const rows = await loadSampleRows();
    const dashboard = buildInsights(rows, null, "monthly").dashboard;
    const bodyRows = await loadSampleInBodyRows();
    const onFile = vi.fn();

    const { container } = render(
      <BodyCompTab
        state={{ status: "ready", rows: bodyRows }}
        granularity="monthly"
        range={null}
        onFile={onFile}
        dashboard={dashboard}
      />
    );

    expect(screen.getByRole("button", { name: /replace file/i })).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("expected the replace-file control to render a file input");
    const file = new File(["date,Weight(lb)\n"], "inbody.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });
});

describe("BodyCompTab — date range", () => {
  it("charts only the scans inside the selected range", async () => {
    const dashboard = buildInsights(await loadSampleRows(), null, "monthly").dashboard;
    const rows = [
      scanRow("2024-01-10", { "Weight(lb)": "190" }),
      scanRow("2026-01-10", { "Weight(lb)": "180" }),
      scanRow("2026-02-10", { "Weight(lb)": "181" }),
    ];
    render(
      <BodyCompTab
        state={{ status: "ready", rows }}
        granularity="monthly"
        range={{ start: dayjs("2026-01-01"), end: dayjs("2026-12-31") }}
        onFile={vi.fn()}
        dashboard={dashboard}
      />
    );
    expect(screen.getByText(/2 months with a scan, most recent Feb 10, 2026/)).toBeInTheDocument();
  });

  it("labels each figure by what it is, so none reads as Overview's number", async () => {
    const dashboard = buildInsights(await loadSampleRows(), null, "monthly").dashboard;
    const rows = [
      scanRow("2026-01-10", { "Weight(lb)": "180" }),
      scanRow("2026-02-03", { "Weight(lb)": "181" }),
      scanRow("2026-02-17", { "Weight(lb)": "182" }),
    ];
    render(<BodyCompTab state={{ status: "ready", rows }} granularity="monthly" range={null} onFile={vi.fn()} dashboard={dashboard} />);
    // February's two scans average 181.5: called an average, with a space before the unit.
    expect(screen.getByText("Feb '26 average 181.5 lb")).toBeInTheDocument();
    // Days trained counts only the months that have a scan, and says so.
    expect(screen.getByText(/^\d[\d,]* in months with a scan$/)).toBeInTheDocument();
  });

  it("puts the trends before the list of readings", async () => {
    const dashboard = buildInsights(await loadSampleRows(), null, "monthly").dashboard;
    const rows = [scanRow("2026-01-10", { "Weight(lb)": "180" }), scanRow("2026-02-10", { "Weight(lb)": "181" })];
    render(
      <BodyCompTab state={{ status: "ready", rows }} granularity="monthly" range={null} onFile={vi.fn()} dashboard={dashboard} weighIns={[]} onSaveWeighIn={vi.fn()} onDeleteWeighIn={vi.fn()} />
    );
    const trends = screen.getByText("Trends");
    const weighIns = screen.getByText("Weigh-ins");
    expect(trends.compareDocumentPosition(weighIns) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says the range is the problem when fewer than two scans fall in it", async () => {
    const dashboard = buildInsights(await loadSampleRows(), null, "monthly").dashboard;
    const rows = [scanRow("2024-01-10"), scanRow("2024-02-10"), scanRow("2026-02-10")];
    render(
      <BodyCompTab
        state={{ status: "ready", rows }}
        granularity="monthly"
        range={{ start: dayjs("2026-01-01"), end: dayjs("2026-12-31") }}
        onFile={vi.fn()}
        dashboard={dashboard}
      />
    );
    expect(screen.getByText(/Fewer than two scans fall in this date range/)).toBeInTheDocument();
  });
});

describe("BodyCompTab: weigh-ins", () => {
  it("shows the Weigh-ins panel before any InBody file is loaded, and not when no weigh-in props are given", () => {
    const dashboard = { days_buckets: [] } as unknown as Parameters<typeof BodyCompTab>[0]["dashboard"];
    const { rerender } = render(<BodyCompTab state={{ status: "idle" }} granularity="monthly" range={null} onFile={vi.fn()} dashboard={dashboard} />);
    expect(screen.queryByText("Weigh-ins")).not.toBeInTheDocument();
    rerender(<BodyCompTab state={{ status: "idle" }} granularity="monthly" range={null} onFile={vi.fn()} dashboard={dashboard} weighIns={[]} onSaveWeighIn={vi.fn()} onDeleteWeighIn={vi.fn()} />);
    expect(screen.getByText("Weigh-ins")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save weigh-in" })).toBeInTheDocument();
  });
});
