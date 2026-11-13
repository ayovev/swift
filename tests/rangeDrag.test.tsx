import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bucketBand, indexAt, rangeOfBuckets, rangeOfTimes, timeAt } from "@/components/dashboard/charts/RangeDrag";
import { ConsistencyChart } from "@/components/dashboard/charts/ConsistencyChart";
import { LiftGrid } from "@/components/dashboard/charts/LiftChart";
import { ShareAreaChart, type SharePoint } from "@/components/dashboard/charts/ShareAreaChart";

/**
 * Dragging across a Training chart sets the date range (RangeDrag.tsx). jsdom has no layout, so the pointer gesture itself was
 * measured in Chromium (mouse drag on the chart, Escape to cancel, a click that does not move still picks, a touch drag on the strip);
 * these pin the arithmetic and what the chart offers.
 */
describe("indexAt", () => {
  it("maps a pointer to the bucket under it, points spread evenly from the left of the plot to the right", () => {
    expect(indexAt(100, 100, 400, 5)).toBe(0);
    expect(indexAt(300, 100, 400, 5)).toBe(2);
    expect(indexAt(500, 100, 400, 5)).toBe(4);
    expect(indexAt(199, 100, 400, 5)).toBe(1);
  });
  it("holds a pointer outside the plot to the first or last bucket", () => {
    expect(indexAt(-50, 100, 400, 5)).toBe(0);
    expect(indexAt(9999, 100, 400, 5)).toBe(4);
  });
  it("survives a plot with nothing in it", () => {
    expect(indexAt(10, 0, 0, 5)).toBe(0);
    expect(indexAt(10, 0, 100, 1)).toBe(0);
  });
});

describe("rangeOfBuckets", () => {
  const months = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05"];
  it("runs from the first bucket's first day to the last bucket's last day, whichever way it was dragged", () => {
    expect(rangeOfBuckets(months, 1, 3, "monthly")).toEqual({ start: "2024-02-01", end: "2024-04-30" });
    expect(rangeOfBuckets(months, 3, 1, "monthly")).toEqual({ start: "2024-02-01", end: "2024-04-30" });
  });
  it("is nothing for a drag that stays in one bucket", () => {
    expect(rangeOfBuckets(months, 2, 2, "monthly")).toBeNull();
  });
  it("holds the ends inside the days the chart covers, since a partial first or last bucket reaches past them", () => {
    const coverage = { start: "2024-01-21", end: "2024-05-10" };
    expect(rangeOfBuckets(months, 0, 2, "monthly", coverage)).toEqual({ start: "2024-01-21", end: "2024-03-31" });
    expect(rangeOfBuckets(months, 2, 4, "monthly", coverage)).toEqual({ start: "2024-03-01", end: "2024-05-10" });
  });
  it("is nothing when the drag would not narrow the range", () => {
    expect(rangeOfBuckets(months, 0, 4, "monthly", { start: "2024-01-01", end: "2024-05-31" })).toBeNull();
    expect(rangeOfBuckets(months, 0, 4, "monthly", { start: "2024-01-15", end: "2024-05-31" })).toBeNull();
  });
  it("follows the grouping: weeks start on Sunday, quarters and years are whole", () => {
    expect(rangeOfBuckets(["2024-03-03", "2024-03-10", "2024-03-17"], 0, 1, "weekly")).toEqual({ start: "2024-03-03", end: "2024-03-16" });
    expect(rangeOfBuckets(["2024-Q1", "2024-Q2", "2024-Q3"], 1, 2, "quarterly")).toEqual({ start: "2024-04-01", end: "2024-09-30" });
    expect(rangeOfBuckets(["2022", "2023", "2024"], 0, 1, "yearly")).toEqual({ start: "2022-01-01", end: "2023-12-31" });
  });
});

describe("ShareAreaChart", () => {
  const data: SharePoint[] = ["2024-01", "2024-02", "2024-03", "2024-04"].map((bucket, i) => ({ bucket, value: 20 + i * 10, total: 12, basis: "x of 12 workouts" }));
  const props = { data, color: "var(--primary)", label: "Share", seriesLabel: "Strength", granularity: "monthly" as const };

  it("offers the drag strip and its hint only when it is given somewhere to send a range", () => {
    const { container, rerender } = render(<ShareAreaChart {...props} />);
    expect(container.querySelector("[data-range-strip]")).toBeNull();
    rerender(<ShareAreaChart {...props} onRangeSelect={() => {}} />);
    expect(container.querySelector("[data-range-strip]")).not.toBeNull();
    // The strip owns its touches, so a finger's drag there does not scroll the page; the rest of the chart does not.
    expect((container.querySelector("[data-range-strip]") as HTMLElement).style.touchAction).toBe("none");
  });

  it("offers nothing on a chart too short to select from", () => {
    const { container } = render(<ShareAreaChart {...props} data={data.slice(0, 2)} onRangeSelect={() => {}} />);
    expect(container.querySelector("[data-range-strip]")).toBeNull();
  });
});

describe("the lift charts' continuous date axis", () => {
  const day = (iso: string) => new Date(iso).getTime();
  const domain = [day("2023-01-01"), day("2024-01-01")] as const;

  it("maps a pointer linearly from the plot's left edge (the domain's start) to its right (its end)", () => {
    expect(timeAt(100, 100, 400, domain)).toBe(domain[0]);
    expect(timeAt(500, 100, 400, domain)).toBe(domain[1]);
    expect(timeAt(300, 100, 400, domain)).toBe(domain[0] + (domain[1] - domain[0]) / 2);
    expect(timeAt(-20, 100, 400, domain)).toBe(domain[0]);
    expect(timeAt(9999, 100, 400, domain)).toBe(domain[1]);
  });

  it("makes a range of the two days, whichever way it was dragged", () => {
    expect(rangeOfTimes(day("2023-03-05"), day("2023-09-20"), domain)).toEqual({ start: "2023-03-05", end: "2023-09-20" });
    expect(rangeOfTimes(day("2023-09-20"), day("2023-03-05"), domain)).toEqual({ start: "2023-03-05", end: "2023-09-20" });
  });

  it("is nothing inside one day, or when it would not narrow the chart", () => {
    expect(rangeOfTimes(day("2023-03-05"), day("2023-03-05") + 3_600_000, domain)).toBeNull();
    expect(rangeOfTimes(domain[0], domain[1], domain)).toBeNull();
    expect(rangeOfTimes(domain[0] - 86_400_000, domain[1] + 86_400_000, domain)).toBeNull();
  });

  it("reads a logged date as its own day: dates parse as UTC midnight, so UTC is the day", () => {
    expect(rangeOfTimes(day("2023-03-01"), day("2023-03-31"), domain)).toEqual({ start: "2023-03-01", end: "2023-03-31" });
  });

  const lift = Array.from({ length: 8 }, (_, i) => ({ date: `2024-0${i + 1}-10`, value: 200 + i, repMax: 5, pr: false }) as never);
  it("offers one strip for the whole grid, and only when it is given somewhere to send a range", () => {
    const { container, rerender } = render(<LiftGrid lifts={{ "Back Squat": lift, Deadlift: lift }} highlight="most" />);
    expect(container.querySelector("[data-range-strip]")).toBeNull();
    rerender(<LiftGrid lifts={{ "Back Squat": lift, Deadlift: lift }} highlight="most" onRangeSelect={() => {}} />);
    expect(container.querySelectorAll("[data-range-strip]")).toHaveLength(1);
  });
});

describe("the Body Comp charts' two layouts", () => {
  const span = { left: 48, width: 400, top: 8, height: 160 };

  it("a bar chart is equal slices of the whole plot: a bucket owns its band, so a pointer anywhere in it is that bucket", () => {
    const bands = { kind: "bands" } as const;
    expect(indexAt(48, 48, 400, 4, bands)).toBe(0);
    expect(indexAt(147, 48, 400, 4, bands)).toBe(0);
    expect(indexAt(149, 48, 400, 4, bands)).toBe(1);
    expect(indexAt(447, 48, 400, 4, bands)).toBe(3);
    expect(indexAt(9999, 48, 400, 4, bands)).toBe(3);
    expect(bucketBand(1, 2, 4, bands, span)).toEqual({ left: 148, right: 348 });
  });

  it("a line chart's points sit inset from the plot's edges by its x axis padding, so the first and last are not at the edge", () => {
    const pts = { kind: "points", inset: 12 } as const;
    // Four points across 400px with 12px each side: at 12, 137.3, 262.7, 388 from the left edge.
    expect(indexAt(48 + 12, 48, 400, 4, pts)).toBe(0);
    expect(indexAt(48 + 138, 48, 400, 4, pts)).toBe(1);
    expect(indexAt(48 + 388, 48, 400, 4, pts)).toBe(3);
    expect(indexAt(48 + 80, 48, 400, 4, pts)).toBe(1); // nearer the second point than the first
    const b = bucketBand(1, 2, 4, pts, span);
    expect(b.left).toBeCloseTo(48 + 12 + 125.33 - 62.67, 1);
    expect(b.right).toBeCloseTo(48 + 12 + 2 * 125.33 + 62.67, 1);
  });

  it("holds a band inside the plot", () => {
    expect(bucketBand(0, 3, 4, { kind: "points", inset: 12 }, span)).toEqual({ left: 48, right: 448 });
  });

  it("leaves the Overview's bar chart as it was when it is given nowhere to send a range", () => {
    const buckets = ["2024-01", "2024-02", "2024-03"].map((bucket, i) => ({ bucket, count: i + 1 }));
    const { container, rerender } = render(<ConsistencyChart buckets={buckets} granularity="monthly" />);
    expect(container.querySelector(".relative")).toBeNull();
    rerender(<ConsistencyChart buckets={buckets} granularity="monthly" onRangeSelect={() => {}} />);
    expect(container.firstElementChild?.className).toContain("relative");
  });
});
