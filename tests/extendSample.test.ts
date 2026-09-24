import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { extendSampleRows } from "@/lib/sample/extendSample";
import type { SugarWodRow } from "@/types/sugarwod";

dayjs.extend(customParseFormat);

function row(overrides: Partial<SugarWodRow> = {}): SugarWodRow {
  return {
    date: "01/01/2024",
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

describe("extendSampleRows", () => {
  it("returns the input unchanged when today is on the last logged date", () => {
    const rows = [row({ date: "03/01/2024" })];
    const result = extendSampleRows(rows, dayjs("2024-03-01"));
    expect(result).toEqual(rows);
  });

  it("returns the input unchanged when today is before the last logged date", () => {
    const rows = [row({ date: "03/10/2024" })];
    const result = extendSampleRows(rows, dayjs("2024-03-01"));
    expect(result).toEqual(rows);
  });

  it("returns the input unchanged (defensively) when no row has a valid date", () => {
    const rows = [row({ date: "" }), row({ date: "not-a-date" })];
    const result = extendSampleRows(rows, dayjs("2024-06-01"));
    expect(result).toEqual(rows);
  });

  it("only adds rows dated after the last historical date and on/before today", () => {
    const rows = [row({ date: "01/01/2024" })];
    const today = dayjs("2024-02-01");
    const result = extendSampleRows(rows, today);
    const generated = result.slice(rows.length);
    expect(generated.length).toBeGreaterThan(0);
    for (const r of generated) {
      const d = dayjs(r.date, "MM/DD/YYYY", true);
      expect(d.isValid()).toBe(true);
      expect(d.isAfter(dayjs("2024-01-01"))).toBe(true);
      expect(d.isAfter(today)).toBe(false);
    }
  });

  it("always logs a session on today, even though every earlier gap day is a probabilistic attendance roll", () => {
    const rows = [row({ date: "01/01/2024" })];
    // Several different `today`s, so this isn't just one lucky seed —
    // today's attendance must hold regardless of what the date hashes to.
    const todays = ["2024-01-05", "2024-01-06", "2024-01-09", "2024-02-14", "2024-03-01"];
    for (const iso of todays) {
      const today = dayjs(iso);
      const result = extendSampleRows(rows, today);
      const todayKey = today.format("MM/DD/YYYY");
      const loggedToday = result.some((r) => r.date === todayKey);
      expect(loggedToday).toBe(true);
    }
  });

  it("never mutates the input array", () => {
    const rows = [row({ date: "01/01/2024" })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    extendSampleRows(rows, dayjs("2024-03-01"));
    expect(rows).toEqual(snapshot);
  });

  it("is deterministic for the same (rows, today) pair", () => {
    const rows = [row({ date: "01/01/2024" })];
    const today = dayjs("2024-04-15");
    const a = extendSampleRows(rows, today);
    const b = extendSampleRows(rows, today);
    expect(a).toEqual(b);
  });

  it("keeps every generated row schema-valid: literal rx/scaled, literal pr, MM/DD/YYYY dates", () => {
    const rows = [row({ date: "01/01/2024" })];
    const result = extendSampleRows(rows, dayjs("2024-06-01"));
    for (const r of result) {
      expect(["RX", "SCALED"]).toContain(r.rx_or_scaled);
      expect(["", "PR"]).toContain(r.pr);
      expect(dayjs(r.date, "MM/DD/YYYY", true).isValid()).toBe(true);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      if (r.score_type === "Load") {
        expect(r.barbell_lift.length).toBeGreaterThan(0);
      }
    }
  });

  it("extends a larger, varied historical set without breaking schema", () => {
    // A hand-built stand-in for a real multi-month export — enough variety
    // (lifts across several movements, a PR, both RX and scaled, several
    // sessions on some days) to exercise historicalStats() non-trivially,
    // without paying for a full parse of the real 1,209-row fixture the way
    // loadSampleRows() would.
    const lifts = ["Back Squat", "Deadlift", "Clean & Jerk"];
    const sampleRows: SugarWodRow[] = [];
    let date = dayjs("2024-01-01");
    for (let day = 0; day < 90; day++) {
      if (day % 2 === 0) {
        sampleRows.push(
          row({
            date: date.format("MM/DD/YYYY"),
            rx_or_scaled: day % 5 === 0 ? "SCALED" : "RX",
            pr: day === 40 ? "PR" : "",
          })
        );
      }
      if (day % 6 === 0) {
        const lift = lifts[(day / 6) % lifts.length]!;
        sampleRows.push(
          row({
            date: date.format("MM/DD/YYYY"),
            title: `${lift} 5x5`,
            description: `${lift} for load: work up to a heavy set of 5.`,
            score_type: "Load",
            barbell_lift: lift,
            best_result_raw: String(200 + day),
            best_result_display: String(200 + day),
          })
        );
      }
      date = date.add(1, "day");
    }

    const lastDate = date.subtract(1, "day");
    const today = lastDate.add(30, "day");

    const result = extendSampleRows(sampleRows, today);
    expect(result.length).toBeGreaterThan(sampleRows.length);

    const generated = result.slice(sampleRows.length);
    for (const r of generated) {
      expect(["RX", "SCALED"]).toContain(r.rx_or_scaled);
      expect(["", "PR"]).toContain(r.pr);
      const d = dayjs(r.date, "MM/DD/YYYY", true);
      expect(d.isValid()).toBe(true);
      expect(d.isAfter(lastDate)).toBe(true);
      expect(d.isAfter(today)).toBe(false);
      if (r.score_type === "Load") expect(r.barbell_lift.length).toBeGreaterThan(0);
    }
  });
});
