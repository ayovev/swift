import dayjs from "dayjs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import { TOP_MOVEMENTS, buildTrainingMix } from "@/lib/analytics/trainingMix";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleRows } from "./fixtures/sampleRows";

let rows: SugarWodRow[];
let all: Insights;
beforeAll(async () => {
  rows = await loadSampleRows();
  all = buildInsights(rows);
});

const range = (start: string, end: string) => ({ start: dayjs(start).startOf("day"), end: dayjs(end).endOf("day") });

describe("buildTrainingMix", () => {
  const START = "2025-01-06";
  const END = "2025-06-30";

  it("reports the numbers the Training views show for the same range", () => {
    const mix = buildTrainingMix(all.allRows, START, END);
    const training = buildInsights(rows, range(START, END));
    expect(mix.workouts).toBe(training.dashboard.summary.total_logged);
    expect(mix.days).toBe(training.dashboard.summary.unique_days);
    for (const d of mix.domains) expect({ count: d.count, pct: d.pct }).toEqual(training.dashboard.overall[d.domain]);
    expect(mix.unclassified).toBe(training.modality.unclassified_count);
    expect(mix.classified).toBe(training.modality.classified_count);
  });

  it("keeps the ten domains as tags that overlap and the three modalities as a split that adds to 100", () => {
    const mix = buildTrainingMix(all.allRows, START, END);
    expect(mix.domains).toHaveLength(DOMAIN_LIST.length);
    expect(mix.domains.reduce((n, d) => n + d.pct, 0)).toBeGreaterThan(100);
    const sorted = mix.domains.map((d) => d.pct);
    expect([...sorted].sort((a, b) => b - a)).toEqual(sorted);

    expect(mix.split).not.toBeNull();
    const sum = MODALITY_LIST.reduce((n, m) => n + mix.split![m], 0);
    expect(Math.round(sum * 10) / 10).toBe(100);
  });

  it("draws one entry per month from the first workout to the end, and the split's months line up with the days'", () => {
    const mix = buildTrainingMix(all.allRows, START, END);
    expect(mix.months[0]!.month).toBe("2025-01");
    expect(mix.months.at(-1)!.month).toBe("2025-06");
    expect(mix.mix.map((m) => m.month)).toEqual(mix.months.map((m) => m.month));
    expect(mix.months.reduce((n, m) => n + m.days, 0)).toBe(mix.days);
  });

  it("marks only the months the period cuts as partial", () => {
    const cut = buildTrainingMix(all.allRows, "2025-01-06", "2025-06-15");
    expect(cut.months.map((m) => m.partial)).toEqual([true, false, false, false, false, true]);
    const whole = buildTrainingMix(all.allRows, "2025-01-01", "2025-06-30");
    expect(whole.months.every((m) => !m.partial)).toBe(true);
  });

  it("counts nothing logged after the end or before the start", () => {
    const mix = buildTrainingMix(all.allRows, START, END);
    expect(mix.lastLogged! <= END).toBe(true);
    const before = buildTrainingMix(all.allRows, null, "2025-01-05");
    const through = buildTrainingMix(all.allRows, null, END);
    expect(through.workouts).toBe(before.workouts + mix.workouts);
  });

  it("covers the whole log, up to the end, for all time", () => {
    const mix = buildTrainingMix(all.allRows, null, "2026-09-11");
    expect(mix.workouts).toBe(all.dashboard.summary.total_logged);
    expect(mix.months[0]!.month).toBe("2022-11");
    expect(mix.months.length).toBeGreaterThan(12);
  });

  it("lists the most-used single movements, most first, no more than the cap", () => {
    const mix = buildTrainingMix(all.allRows, null, "2026-09-11");
    expect(mix.movements.length).toBeLessThanOrEqual(TOP_MOVEMENTS);
    expect(mix.movements.length).toBeGreaterThan(0);
    const counts = mix.movements.map((m) => m.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(mix.movements[0]!.pct).toBeCloseTo((mix.movements[0]!.count / mix.workouts) * 100, 0);
  });

  it("is empty, not an error, for a period with no workouts", () => {
    const mix = buildTrainingMix(all.allRows, "2020-01-01", "2020-12-31");
    expect(mix).toMatchObject({ workouts: 0, days: 0, months: [], mix: [], split: null, movements: [] });
    expect(mix.domains.every((d) => d.count === 0)).toBe(true);
  });
});
