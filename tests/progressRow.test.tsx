import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceChart } from "@/components/dashboard/progress/EvidenceChart";
import { ProgressRowItem } from "@/components/dashboard/progress/ProgressRowItem";
import { classifySubjects, type ProgressRow } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { loadSampleRows } from "./fixtures/sampleRows";

const ASOF = "2026-09-11";

async function sampleRow(name: string): Promise<{ row: ProgressRow; rows: ProgressRow[] }> {
  const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
  return { row: rows.find((r) => r.subject.name === name && r.subject.status === "RX")!, rows };
}

describe("a collapsed Progress row", () => {
  it("shows the verdict, the change, the windows and a sparkline, and opens to the rest", async () => {
    const { row, rows } = await sampleRow("Power Snatch");
    expect(row.verdict?.record).toBe(true);
    const twin = rows.find((r) => r.subject.movement === row.subject.movement && r.subject.status === "SCALED")?.subject ?? null;
    const { container } = render(
      <ul>
        <ProgressRowItem row={row} twin={twin} readings={[{ date: "2023-02-06", weightLb: 170 }, { date: "2026-03-10", weightLb: 180 }]} bandLb={3} />
      </ul>
    );
    const li = container.querySelector("li") as HTMLElement;
    expect(within(li).getByText(/est\. 1RM\), \+/)).toBeInTheDocument();
    expect(within(li).getByText(/^Last \d: /)).toBeInTheDocument();
    expect(li.querySelector("svg[data-sparkline]")).not.toBeNull();
    // Collapsed: no new-best note, no body-weight lines.
    expect(within(li).queryByText(/^New best/)).not.toBeInTheDocument();
    expect(within(li).queryByText(/^Body weight/)).not.toBeInTheDocument();
    fireEvent.click(within(li).getByRole("button", { expanded: false }));
    expect(within(li).getByText(/^New best est\. 1RM/)).toBeInTheDocument();
    expect(within(li).getAllByText(/Body weight/).length).toBeGreaterThan(0);
    expect(within(li).getByRole("img", { name: /Sessions of Power Snatch/ })).toBeInTheDocument();
  });

  it("keeps the long-gap caveat on the collapsed row, since it qualifies the verdict", async () => {
    const { row } = await sampleRow("Power Snatch");
    const { container } = render(
      <ul>
        <ProgressRowItem row={row} twin={null} readings={[]} bandLb={3} />
      </ul>
    );
    expect(within(container).getByText(/^Recent sessions span \d+ months/)).toBeInTheDocument();
  });

  it("draws the sparkline's dots in the chart's encoding: recent in the accent, previous dark", async () => {
    const { row } = await sampleRow("Back Squat");
    const { container } = render(
      <ul>
        <ProgressRowItem row={row} twin={null} readings={[]} bandLb={3} />
      </ul>
    );
    const spark = container.querySelector("svg[data-sparkline]") as SVGElement;
    expect(spark.getAttribute("aria-hidden")).toBe("true");
    expect(spark.querySelectorAll("circle.fill-accent-link")).toHaveLength(row.verdict!.recent.length);
    expect(spark.querySelectorAll("circle.fill-foreground")).toHaveLength(row.verdict!.previous.length);
    expect(spark.querySelectorAll("circle")).toHaveLength(row.subject.sessions.length);
  });
});

describe("the evidence chart's size", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A ResizeObserver that reports one width straight away, as a browser would on the first layout. */
  function stubWidth(width: number) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe() {
          this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
      }
    );
  }

  for (const [width, height] of [
    [316, 170],
    [700, 210],
    [1182, 240],
  ] as const) {
    it(`draws at its container's real width (${width}px), so its 11px text stays 11px`, async () => {
      stubWidth(width);
      const { row } = await sampleRow("Back Squat");
      render(<EvidenceChart subject={row.subject} verdict={row.verdict} />);
      const svg = screen.getByRole("img", { name: /Sessions of Back Squat/ });
      expect(svg.getAttribute("viewBox")).toBe(`0 0 ${width} ${height}`);
      expect(svg.getAttribute("width")).toBe(String(width));
      expect(svg.querySelectorAll("text.text-\\[11px\\]").length).toBeGreaterThan(5);
      // As many date ticks as fit (about 64px each), never the full set squeezed in.
      const xLabels = [...svg.querySelectorAll("text")].filter((t) => t.getAttribute("text-anchor") === "middle" && Number(t.getAttribute("y")) > height - 20);
      expect(xLabels.length).toBeLessThanOrEqual(Math.max(2, Math.floor((width - 96) / 64)) + 1);
    });
  }

  it("draws solid gridlines; the one dashed line is the trend", async () => {
    stubWidth(800);
    const { row } = await sampleRow("Back Squat");
    render(<EvidenceChart subject={row.subject} verdict={row.verdict} />);
    const svg = screen.getByRole("img", { name: /Sessions of Back Squat/ });
    const dashed = [...svg.querySelectorAll("line")].filter((l) => l.getAttribute("stroke-dasharray"));
    expect(dashed).toHaveLength(1);
    expect(within(svg as unknown as HTMLElement).getByText("Trend")).toBeInTheDocument();
  });
});
