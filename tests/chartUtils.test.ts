import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { mergeBucketCounts, niceAxisTicks, niceTimeTicks } from "@/components/dashboard/charts/chartUtils";

function stepSizes(ticks: number[]): number[] {
  return ticks.slice(1).map((t, i) => Number((t - ticks[i]!).toFixed(6)));
}

describe("niceAxisTicks", () => {
  it("produces evenly-spaced ticks for a range that isn't already a round number", () => {
    // Regression case: Recharts' own default tick generation for this exact
    // domain reads 124.5, 149.5, 174.5, 199.5, 215.5 — three 25-unit steps
    // then a cramped 16-unit one, because it forces the raw domain max back
    // in as the last tick regardless of step size.
    const { domain, ticks } = niceAxisTicks(124.5, 215.5);
    const steps = stepSizes(ticks);
    expect(new Set(steps).size).toBe(1);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
  });

  it("keeps every step equal for another uneven range", () => {
    const { ticks } = niceAxisTicks(126, 204);
    const steps = stepSizes(ticks);
    expect(new Set(steps).size).toBe(1);
  });

  it("covers the requested range without clipping either end", () => {
    const { domain } = niceAxisTicks(132.25, 242.75);
    expect(domain[0]).toBeLessThanOrEqual(132.25);
    expect(domain[1]).toBeGreaterThanOrEqual(242.75);
  });

  it("handles a zero-width range without dividing by zero", () => {
    expect(niceAxisTicks(150, 150)).toEqual({ domain: [150, 150], ticks: [150] });
  });

  it("defaults to a 6-tick target", () => {
    // 0-10 in steps of 2 is a clean multiple, so the target is met exactly.
    expect(niceAxisTicks(0, 10).ticks).toHaveLength(6);
  });

  it("wholeNumbers keeps count-style ticks from landing on a fraction", () => {
    // A max of 1 (e.g. a busy day is 1 workout) would otherwise produce
    // 0, 0.2, 0.4, 0.6, 0.8, 1 — "0.4 workouts" makes no sense.
    const { ticks } = niceAxisTicks(0, 1, 6, true);
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it("every tick is a multiple of the chosen round step", () => {
    // The tradeoff for staying "≈6, always round" instead of "exactly 6": a
    // tick like 104 or 118 should never appear — only clean multiples.
    const spans: [number, number][] = [
      [124.5, 215.5],
      [100, 240],
      [100, 400],
      [140, 200],
      [90, 130],
      [155, 365],
      [95, 135],
    ];
    for (const [min, max] of spans) {
      const { ticks } = niceAxisTicks(min, max);
      const step = ticks[1]! - ticks[0]!;
      for (const t of ticks) {
        expect(Number(((t - ticks[0]!) / step).toFixed(6)) % 1).toBe(0);
      }
    }
  });

  it("stays within 1 tick of the target across a range of real chart spans", () => {
    // A single fixed 1/2/5/10 classification (the classic algorithm) lands
    // as far as 5-9 ticks on these actual spans from the sample export;
    // searching nearby candidates for the closest count keeps it tighter.
    const spans: [number, number][] = [
      [124.5, 215.5],
      [100, 240],
      [100, 400],
      [140, 200],
      [90, 130],
      [0, 30],
      [0, 3],
    ];
    for (const [min, max] of spans) {
      const { ticks } = niceAxisTicks(min, max);
      expect(Math.abs(ticks.length - 6)).toBeLessThanOrEqual(1);
    }
  });

  it("doesn't blow up the domain when wholeNumbers can't get close to the target", () => {
    // Every whole-number step ties on "how far from 6 ticks", which used to
    // make the tie-break pick an arbitrarily large step (e.g. 10) rather
    // than the smallest one that actually fits this domain.
    const { ticks } = niceAxisTicks(0, 1, 6, true);
    expect(ticks).toEqual([0, 1]);
  });
});

describe("niceTimeTicks", () => {
  function ms(iso: string): number {
    return dayjs(iso).valueOf();
  }

  it("produces evenly-spaced ticks in calendar-step units, not raw milliseconds", () => {
    // Regression case: a plain "divide the ms range into N" would land ticks
    // on arbitrary dates like "Nov 5" rather than a calendar boundary.
    const ticks = niceTimeTicks(ms("2022-11-21"), ms("2026-09-11"));
    for (const t of ticks) {
      const d = dayjs(t);
      expect(d.date()).toBe(1);
    }
    const steps = ticks.slice(1).map((t, i) => dayjs(t).diff(ticks[i]!, "month"));
    expect(new Set(steps).size).toBe(1);
  });

  it("leaves the domain untouched — ticks never fall outside [min, max]", () => {
    const min = ms("2023-03-07");
    const max = ms("2026-07-27");
    const ticks = niceTimeTicks(min, max);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    }
  });

  it("stays within a couple ticks of the target across real lift-history spans", () => {
    const spans: [string, string][] = [
      ["2022-11-21", "2026-09-11"],
      ["2023-02-01", "2026-08-07"],
      ["2024-01-10", "2024-06-20"],
      ["2024-05-01", "2024-05-20"],
    ];
    for (const [a, b] of spans) {
      const ticks = niceTimeTicks(ms(a), ms(b));
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(ticks.length - 6)).toBeLessThanOrEqual(2);
    }
  });

  it("handles a zero-width range without dividing by zero", () => {
    const t = ms("2024-01-01");
    expect(niceTimeTicks(t, t)).toEqual([t]);
  });
});

describe("mergeBucketCounts", () => {
  it("pairs matching buckets by key, in the primary series' order", () => {
    const primary = [
      { bucket: "2024-01", count: 10 },
      { bucket: "2024-02", count: 5 },
    ];
    const secondary = [
      { bucket: "2024-02", count: 3 },
      { bucket: "2024-01", count: 7 },
    ];
    expect(mergeBucketCounts(primary, secondary)).toEqual([
      { bucket: "2024-01", count: 10, secondaryCount: 7 },
      { bucket: "2024-02", count: 5, secondaryCount: 3 },
    ]);
  });

  it("falls back to 0 for a primary bucket missing from the secondary series", () => {
    const primary = [{ bucket: "2024-01", count: 10 }];
    expect(mergeBucketCounts(primary, [])).toEqual([
      { bucket: "2024-01", count: 10, secondaryCount: 0 },
    ]);
  });

  it("drops a secondary bucket with no primary counterpart", () => {
    const primary = [{ bucket: "2024-01", count: 10 }];
    const secondary = [
      { bucket: "2024-01", count: 7 },
      { bucket: "2024-02", count: 99 },
    ];
    expect(mergeBucketCounts(primary, secondary)).toEqual([
      { bucket: "2024-01", count: 10, secondaryCount: 7 },
    ]);
  });

  it("returns an empty array for an empty primary series", () => {
    expect(mergeBucketCounts([], [{ bucket: "2024-01", count: 5 }])).toEqual([]);
  });
});
