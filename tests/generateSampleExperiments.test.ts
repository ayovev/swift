import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { generateSampleExperiments } from "@/lib/sample/generateSampleExperiments";
import type { SugarWodRow } from "@/types/sugarwod";

dayjs.extend(customParseFormat);

function row(overrides: Partial<SugarWodRow> = {}): SugarWodRow {
  return {
    date: "01/01/2022",
    title: "FRAN",
    description: "21-15-9Thrusters (65/95 lb)Pull-ups",
    best_result_raw: "240",
    best_result_display: "4:00",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
    ...overrides,
  };
}

describe("generateSampleExperiments", () => {
  it("returns [] when no row has a valid date", () => {
    const rows = [row({ date: "" }), row({ date: "not-a-date" })];
    expect(generateSampleExperiments(rows, dayjs("2024-06-01"))).toEqual([]);
  });

  it("returns [] when the span is too short for any offset to have enough margin", () => {
    const rows = [row({ date: "01/01/2024" })];
    expect(generateSampleExperiments(rows, dayjs("2024-06-01"))).toEqual([]);
  });

  it("is deterministic for the same (workoutRows, today) pair", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2026-09-25");
    const a = generateSampleExperiments(rows, today);
    const b = generateSampleExperiments(rows, today);
    expect(a).toEqual(b);
  });

  it("never mutates the input array", () => {
    const rows = [row({ date: "01/01/2022" })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    generateSampleExperiments(rows, dayjs("2026-09-25"));
    expect(rows).toEqual(snapshot);
  });

  it("places every experiment date strictly between the first workout and today, with margin on both sides", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2026-09-25");
    const experiments = generateSampleExperiments(rows, today);
    expect(experiments.length).toBeGreaterThan(0);
    for (const experiment of experiments) {
      const d = dayjs(experiment.date, "YYYY-MM-DD", true);
      expect(d.isValid()).toBe(true);
      expect(d.diff(dayjs("2022-01-01"), "month", true)).toBeGreaterThanOrEqual(4);
      expect(today.diff(d, "month", true)).toBeGreaterThanOrEqual(4);
      expect(experiment.label.length).toBeGreaterThan(0);
      expect(experiment.id.length).toBeGreaterThan(0);
    }
  });

  it("generates unique ids for every experiment", () => {
    const rows = [row({ date: "01/01/2022" })];
    const experiments = generateSampleExperiments(rows, dayjs("2026-09-25"));
    const ids = new Set(experiments.map((e) => e.id));
    expect(ids.size).toBe(experiments.length);
  });
});
