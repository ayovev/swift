import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepMaxPrTable } from "@/components/dashboard/charts/RepMaxPrTable";
import { SegmentedControl } from "@/components/dashboard/SegmentedControl";
import { WeighInsPanel } from "@/components/dashboard/WeighInsPanel";
import { WorkoutsTab } from "@/components/dashboard/WorkoutsTab";
import { EvidenceChart } from "@/components/dashboard/progress/EvidenceChart";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import type { WeighIn } from "@/types/weighIn";
import { loadSampleRows } from "./fixtures/sampleRows";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", async (orig) => ({ ...(await orig<typeof import("@/lib/posthog")>()), capture: posthog.capture }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  posthog.capture.mockClear();
});

describe("on a phone", () => {
  it("lists each lift's PRs one lift per entry, with short dates, beside the wide table", async () => {
    const { dashboard } = buildInsights(await loadSampleRows());
    render(<RepMaxPrTable lifts={dashboard.lifts} />);
    const list = screen.getByRole("list", { name: "Current PR at each rep max" });
    expect(list.className).toMatch(/\bsm:hidden\b/);
    const squat = within(list).getByText("Back Squat").closest("li") as HTMLElement;
    expect(squat.textContent).toMatch(/1RM \d+ · [A-Z][a-z]{2} '\d\d/);
    // The wide table is still there for wider screens, with the same lifts.
    const table = screen.getByRole("table");
    expect(table.parentElement?.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:block"]));
    expect(within(list).getAllByRole("listitem")).toHaveLength(within(table).getAllByRole("row").length - 1);
  });

  it("moves a workout's date under its title, so the split column keeps its width", async () => {
    const insights = buildInsights(await loadSampleRows());
    render(<WorkoutsTab data={insights.modality} summary={insights.dashboard.summary} />);
    expect(screen.getByRole("columnheader", { name: "Date" }).className.split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:table-cell"]));
    const firstRow = screen.getAllByRole("row")[1] as HTMLElement;
    const titleCell = within(firstRow).getAllByRole("cell")[1] as HTMLElement;
    expect(titleCell.querySelector(".sm\\:hidden")?.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it("lets a long set of options wrap rather than run off the edge", () => {
    render(<SegmentedControl value="a" onChange={vi.fn()} options={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} ariaLabel="Pick" wrap />);
    expect(screen.getByRole("group", { name: "Pick" }).className).toMatch(/\bflex-wrap\b/);
  });
});

describe("deleting a weigh-in", () => {
  const w = (date: string, weightLb: number): WeighIn => ({ date, weightLb, source: "manual" });

  it("can be undone for ten seconds, which puts the same weigh-in back", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const entry = w("2026-09-05", 187.4);
    const { rerender } = render(<WeighInsPanel scans={[]} weighIns={[entry]} onSave={onSave} onDelete={onDelete} today="2026-09-11" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("2026-09-05");
    rerender(<WeighInsPanel scans={[]} weighIns={[]} onSave={onSave} onDelete={onDelete} today="2026-09-11" />);
    expect(screen.getByRole("status")).toHaveTextContent("Deleted the Sep 5, 2026 weigh-in (187.4 lb).");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onSave).toHaveBeenCalledWith(entry);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(posthog.capture.mock.calls.map((c) => c[0])).toEqual([
      { name: "interaction_used", props: { interaction: "weigh_in_deleted" } },
      { name: "interaction_used", props: { interaction: "weigh_in_delete_undone" } },
    ]);
  });

  it("stops offering Undo after ten seconds", () => {
    vi.useFakeTimers();
    render(<WeighInsPanel scans={[]} weighIns={[w("2026-09-05", 187)]} onSave={vi.fn()} onDelete={vi.fn()} today="2026-09-11" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});

describe("the evidence chart's value labels", () => {
  it("never sit on a dot, at phone width or desktop width", async () => {
    const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, "2026-09-11");
    let checked = 0;
    for (const width of [316, 1182]) {
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
      for (const row of rows.filter((r) => r.verdict)) {
        const { unmount } = render(<EvidenceChart subject={row.subject} verdict={row.verdict} />);
        const svg = screen.getByRole("img", { name: /^Sessions of / });
        const dots = [...svg.querySelectorAll('circle[r="3.5"]')].map((c) => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) }));
        // Value labels are the chart's own text children; axis ticks and the trend label sit inside groups.
        const labels = [...svg.querySelectorAll("text.fill-muted-foreground")].filter((t) => t.parentElement === svg && /^[\d:+]/.test(t.textContent ?? ""));
        checked += labels.length;
        for (const t of labels) {
          const x = Number(t.getAttribute("x"));
          const y = Number(t.getAttribute("y"));
          const w = (t.textContent ?? "").length * 6.2;
          const anchor = t.getAttribute("text-anchor");
          const left = anchor === "end" ? x - w : anchor === "start" ? x : x - w / 2;
          const onDot = dots.some((d) => d.x > left && d.x < left + w && d.y > y - 11 && d.y < y + 3);
          expect(onDot, `${row.subject.name} "${t.textContent}" at ${width}px`).toBe(false);
        }
        unmount();
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});
