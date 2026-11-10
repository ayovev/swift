import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceChart } from "@/components/dashboard/progress/EvidenceChart";
import { ProgressRowItem } from "@/components/dashboard/progress/ProgressRowItem";
import { changeScale } from "@/components/dashboard/progress/ChangeBar";
import { classifySubjects, type ProgressRow } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { loadSampleRows } from "./fixtures/sampleRows";

const ASOF = "2026-09-11";

async function sampleRow(name: string): Promise<{ row: ProgressRow; rows: ProgressRow[] }> {
  const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
  return { row: rows.find((r) => r.subject.name === name && r.subject.status === "RX")!, rows };
}

describe("a collapsed Progress row", () => {
  it("shows the verdict, the change, the windows and a change bar, and opens to the rest", async () => {
    const { row, rows } = await sampleRow("Power Snatch");
    expect(row.verdict?.record).toBe(true);
    const twin = rows.find((r) => r.subject.movement === row.subject.movement && r.subject.status === "SCALED")?.subject ?? null;
    const { container } = render(
      <ul>
        <ProgressRowItem row={row} twin={twin} scale={changeScale(rows)} readings={[{ date: "2023-02-06", weightLb: 170 }, { date: "2026-03-10", weightLb: 180 }]} bandLb={3} />
      </ul>
    );
    const li = container.querySelector("li") as HTMLElement;
    expect(within(li).getByText(/est\. 1RM\), \+/)).toBeInTheDocument();
    expect(within(li).getByText(/^Last \d: /)).toBeInTheDocument();
    expect(li.querySelector("[data-change-bar]")).not.toBeNull();
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

  it("draws every row's change on one scale: longer for a bigger change, right for better, left for worse", async () => {
    const { rows } = await sampleRow("Back Squat");
    const scale = changeScale(rows);
    const barOf = (row: ProgressRow) => {
      const { container, unmount } = render(
        <ul>
          <ProgressRowItem row={row} twin={null} readings={[]} bandLb={3} scale={scale} />
        </ul>
      );
      const bar = container.querySelector("[data-change-bar] [data-bar]") as HTMLElement;
      const zero = Number((container.querySelector("[data-change-bar] > span:not([data-threshold]):not([data-bar])") as HTMLElement).style.left.replace("%", ""));
      const out = { left: parseFloat(bar.style.left), width: parseFloat(bar.style.width.replace(/^max\(/, "")), zero, change: row.verdict!.change };
      unmount();
      return out;
    };
    // The sample's biggest and a smaller improvement, and a decline, whatever their names on this date.
    const better = rows.filter((r) => r.verdict && r.verdict.change > 0).sort((a, b) => b.verdict!.change - a.verdict!.change);
    const worse = rows.find((r) => r.verdict && r.verdict.change < 0)!;
    const big = barOf(better[0]!);
    const small = barOf(better[better.length - 1]!);
    const down = barOf(worse);
    expect(big.change).toBeGreaterThan(small.change);
    // Same scale: the ratio of the bars is the ratio of the changes.
    expect(big.width / small.width).toBeCloseTo(big.change / small.change, 1);
    // Better runs right of zero, worse left of it.
    expect(big.left).toBeCloseTo(big.zero, 5);
    expect(down.left + down.width).toBeCloseTo(down.zero, 5);
  });

  it("marks the verdict's threshold on every bar, so a small change reads as small", async () => {
    const { rows } = await sampleRow("Deadlift");
    const scale = changeScale(rows);
    expect(scale.lo).toBeLessThan(-5);
    expect(scale.hi).toBeGreaterThan(5);
    const deadlift = rows.find((r) => r.subject.name === "Deadlift" && r.subject.status === "RX")!;
    // An Up from a record: its +4.4% stops short of the +5% tick.
    expect(deadlift.verdict!.record).toBe(true);
    expect(deadlift.verdict!.change).toBeLessThan(5);
    const { container } = render(
      <ul>
        <ProgressRowItem row={deadlift} twin={null} readings={[]} bandLb={3} scale={scale} />
      </ul>
    );
    const ticks = [...container.querySelectorAll("[data-change-bar] [data-threshold]")] as HTMLElement[];
    expect(ticks).toHaveLength(2);
    const bar = container.querySelector("[data-change-bar] [data-bar]") as HTMLElement;
    const barEnd = parseFloat(bar.style.left) + parseFloat(bar.style.width.replace(/^max\(/, ""));
    expect(barEnd).toBeLessThan(Math.max(...ticks.map((t) => parseFloat(t.style.left))));
    expect(container.querySelector("[data-change-bar]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes the scale from every verdict, not the rows a filter shows", async () => {
    const { rows } = await sampleRow("Back Squat");
    const all = changeScale(rows);
    const fewer = changeScale(rows.filter((r) => r.subject.name === "Deadlift"));
    expect(all.hi).toBeGreaterThan(fewer.hi);
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
