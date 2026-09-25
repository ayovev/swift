import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
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

describe("generateSampleBodyComp", () => {
  it("returns [] when no row has a valid date", () => {
    const rows = [row({ date: "" }), row({ date: "not-a-date" })];
    expect(generateSampleBodyComp(rows, dayjs("2024-06-01"))).toEqual([]);
  });

  it("is deterministic for the same (workoutRows, today) pair", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2024-04-15");
    const a = generateSampleBodyComp(rows, today);
    const b = generateSampleBodyComp(rows, today);
    expect(a).toEqual(b);
  });

  it("never mutates the input array", () => {
    const rows = [row({ date: "01/01/2022" })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    generateSampleBodyComp(rows, dayjs("2024-06-01"));
    expect(rows).toEqual(snapshot);
  });

  it("generates every scan with a valid strict YYYYMMDDHHmmss date between the first workout and today", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2025-06-15");
    const scans = generateSampleBodyComp(rows, today);
    expect(scans.length).toBeGreaterThan(0);
    for (const scan of scans) {
      expect(scan.date).toMatch(/^\d{14}$/);
      const d = dayjs(scan.date, "YYYYMMDDHHmmss", true);
      expect(d.isValid()).toBe(true);
      expect(d.isBefore(dayjs("2022-01-01"), "day")).toBe(false);
      expect(d.isAfter(today, "day")).toBe(false);
    }
  });

  it("pins the most recent scan to today, so the chart never reads as stale", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2025-03-10");
    const scans = generateSampleBodyComp(rows, today);
    const last = scans[scans.length - 1]!;
    const lastDate = dayjs(last.date, "YYYYMMDDHHmmss", true);
    expect(lastDate.isSame(today, "day")).toBe(true);
  });

  it("spaces scans roughly every two weeks, never leaving a much larger gap", () => {
    const rows = [row({ date: "01/01/2022" })];
    const today = dayjs("2024-01-01");
    const scans = generateSampleBodyComp(rows, today);
    const dates = scans.map((s) => dayjs(s.date, "YYYYMMDDHHmmss", true)).sort((a, b) => a.diff(b));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]!.diff(dates[i - 1]!, "day")).toBeLessThanOrEqual(21);
    }
  });

  it("keeps every scan internally consistent and schema-valid", () => {
    const rows = [row({ date: "01/01/2022" })];
    const scans = generateSampleBodyComp(rows, dayjs("2025-01-01"));
    for (const scan of scans) {
      const weight = Number.parseFloat(scan["Weight(lb)"]);
      const bodyFatPct = Number.parseFloat(scan["Percent Body Fat(%)"]);
      const bodyFatMass = Number.parseFloat(scan["Body Fat Mass(lb)"]);
      const smm = Number.parseFloat(scan["Skeletal Muscle Mass(lb)"]);
      const slm = Number.parseFloat(scan["Soft Lean Mass(lb)"]);
      const bmi = Number.parseFloat(scan["BMI(kg/m²)"]);
      const score = Number.parseFloat(scan["InBody Score"]);

      for (const n of [weight, bodyFatPct, bodyFatMass, smm, slm, bmi, score]) {
        expect(Number.isNaN(n)).toBe(false);
      }
      expect(bodyFatMass).toBeCloseTo((weight * bodyFatPct) / 100, 0);
      expect(weight).toBeGreaterThan(0);
      expect(bodyFatPct).toBeGreaterThan(0);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it("never emits the literal '-' for any of the seven modeled fields", () => {
    const rows = [row({ date: "01/01/2022" })];
    const scans = generateSampleBodyComp(rows, dayjs("2025-01-01"));
    for (const scan of scans) {
      for (const value of Object.values(scan)) {
        expect(value).not.toBe("-");
      }
    }
  });
});
