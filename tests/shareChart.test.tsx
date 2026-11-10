import { fireEvent, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { describe, expect, it, vi } from "vitest";
import { ShareAreaChart, shareRows, type SharePoint } from "@/components/dashboard/charts/ShareAreaChart";
import { THIN_BUCKET_WORKOUTS } from "@/components/dashboard/charts/chartUtils";
import { ScopeLine } from "@/components/dashboard/ScopeLine";
import { bucketBounds } from "@/lib/analytics/granularity";

/**
 * Share-over-time charts draw each bucket for what it is (ShareAreaChart.tsx): a thin bucket is a hollow dot off the line, a partly
 * covered first or last bucket is dashed, every tooltip names its denominator, and too few buckets get a sentence instead of a line.
 * Recharts draws nothing in jsdom, so the rules are tested on `shareRows` and on what the component renders around the chart.
 */

const point = (bucket: string, value: number, total: number): SharePoint => ({ bucket, value, total, basis: `of ${total}` });

describe("bucketBounds", () => {
  it("gives each bucket's first and last day at every grouping", () => {
    expect(bucketBounds("2024-10-03", "daily")).toEqual({ start: "2024-10-03", end: "2024-10-03" });
    expect(bucketBounds("2024-09-29", "weekly")).toEqual({ start: "2024-09-29", end: "2024-10-05" });
    expect(bucketBounds("2024-02", "monthly")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(bucketBounds("2024-Q4", "quarterly")).toEqual({ start: "2024-10-01", end: "2024-12-31" });
    expect(bucketBounds("2024", "yearly")).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });
});

describe("shareRows", () => {
  it("takes a thin bucket out of the line and draws it as a hollow dot", () => {
    const rows = shareRows([point("2024-01", 80, 20), point("2024-02", 100, THIN_BUCKET_WORKOUTS - 1), point("2024-03", 70, 20)], "monthly");
    expect(rows.map((r) => r.thin)).toEqual([false, true, false]);
    expect(rows[1]!.solid).toBeNull();
    expect(rows[1]!.thinValue).toBe(100);
    // Its whole neighbours each lose their partner in the area, so each gets a dot of its own.
    expect(rows[0]!.lone).toBe(80);
    expect(rows[2]!.lone).toBe(70);
  });

  it("joins whole buckets into the area, with no lone dots between them", () => {
    const rows = shareRows([point("2024-01", 80, 20), point("2024-02", 90, 20), point("2024-03", 70, 20)], "monthly");
    expect(rows.map((r) => r.solid)).toEqual([80, 90, 70]);
    expect(rows.every((r) => r.lone === null && r.edge === null)).toBe(true);
  });

  it("marks a first and last bucket the coverage only partly reaches, and joins each to its whole neighbour", () => {
    const data = [point("2022-11", 73, 15), point("2022-12", 82, 20), point("2023-01", 79, 20), point("2023-02", 100, 8)];
    const rows = shareRows(data, "monthly", { start: "2022-11-21", end: "2023-02-10" });
    expect(rows[0]).toMatchObject({ partial: true, from: "2022-11-21", to: null, solid: null, edge: 73 });
    expect(rows[1]).toMatchObject({ partial: false, solid: 82, edge: 82 });
    expect(rows[2]).toMatchObject({ partial: false, solid: 79, edge: 79 });
    expect(rows[3]).toMatchObject({ partial: true, from: null, to: "2023-02-10", solid: null, edge: 100 });
  });

  it("doesn't call a bucket partial when the coverage takes in all of it", () => {
    const rows = shareRows([point("2024-01", 80, 20), point("2024-02", 90, 20), point("2024-03", 70, 20)], "monthly", { start: "2024-01-01", end: "2024-03-31" });
    expect(rows.some((r) => r.partial)).toBe(false);
  });
});

describe("ShareAreaChart", () => {
  it("says so in a sentence when there are too few buckets for a trend", () => {
    render(<ShareAreaChart data={[point("2026-10", 88, 22), point("2026-11", 95, 8)]} color="red" label="x" seriesLabel="Strength" granularity="monthly" />);
    expect(screen.getByText(/^Only 2 months in this range, too few to show a trend\. Group by week, or widen the date range, to see more\.$/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keys the hollow and dashed marks when the chart draws them, and not otherwise", () => {
    const thinAndPartial = [point("2024-01", 80, 20), point("2024-02", 100, 2), point("2024-03", 70, 20), point("2024-04", 60, 20)];
    const { unmount } = render(
      <ShareAreaChart data={thinAndPartial} color="red" label="x" seriesLabel="Strength" granularity="monthly" coverage={{ start: "2024-01-01", end: "2024-04-12" }} />
    );
    expect(screen.getByText(`Fewer than ${THIN_BUCKET_WORKOUTS} workouts, not joined to the line`)).toBeInTheDocument();
    expect(screen.getByText("Part of a month only: the range or the log starts or ends inside it")).toBeInTheDocument();
    unmount();
    const whole = [point("2024-01", 80, 20), point("2024-02", 90, 20), point("2024-03", 70, 20)];
    const { container } = render(<ShareAreaChart data={whole} color="red" label="x" seriesLabel="Strength" granularity="monthly" />);
    expect(container.querySelector("[data-share-key]")).toBeNull();
  });
});

describe("the grouping menu", () => {
  const props = (days: number) => ({
    dateBounds: { start: dayjs("2024-01-01"), end: dayjs("2024-01-01").add(days, "day") },
    range: null,
    rangePreset: "all_time" as const,
    onRangeSelect: vi.fn(),
    granularity: "monthly" as const,
    onGranularityChange: vi.fn(),
    dailyDisabled: false,
  });

  it("says weekly is noisy over a range longer than a year, and nothing over a shorter one", async () => {
    const { unmount } = render(<ScopeLine {...props(800)} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Grouped by/ }), { button: 0 });
    expect(await screen.findByRole("menuitemradio", { name: /Weekly\s*Noisy over this range/ })).toBeInTheDocument();
    unmount();
    render(<ScopeLine {...props(200)} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Grouped by/ }), { button: 0 });
    expect(await screen.findByRole("menuitemradio", { name: /^Weekly$/ })).toBeInTheDocument();
  });
});
