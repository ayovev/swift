import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { describe, expect, it } from "vitest";
import { extendSampleRows } from "@/lib/sample/extendSample";
import type { SugarWodRow } from "@/types/sugarwod";
import { franRow } from "./fixtures/rows";

dayjs.extend(customParseFormat);

describe("extendSampleRows", () => {
  it("returns the input unchanged when today is on the last logged date", () => {
    const rows = [franRow({ date: "03/01/2024" })];
    const result = extendSampleRows(rows, dayjs("2024-03-01"));
    expect(result).toEqual(rows);
  });

  it("returns the input unchanged when today is before the last logged date", () => {
    const rows = [franRow({ date: "03/10/2024" })];
    const result = extendSampleRows(rows, dayjs("2024-03-01"));
    expect(result).toEqual(rows);
  });

  it("returns the input unchanged (defensively) when no row has a valid date", () => {
    const rows = [franRow({ date: "" }), franRow({ date: "not-a-date" })];
    const result = extendSampleRows(rows, dayjs("2024-06-01"));
    expect(result).toEqual(rows);
  });

  it("only adds rows dated after the last historical date and on/before today", () => {
    const rows = [franRow({ date: "01/01/2024" })];
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
    const rows = [franRow({ date: "01/01/2024" })];
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
    const rows = [franRow({ date: "01/01/2024" })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    extendSampleRows(rows, dayjs("2024-03-01"));
    expect(rows).toEqual(snapshot);
  });

  it("is deterministic for the same (rows, today) pair", () => {
    const rows = [franRow({ date: "01/01/2024" })];
    const today = dayjs("2024-04-15");
    const a = extendSampleRows(rows, today);
    const b = extendSampleRows(rows, today);
    expect(a).toEqual(b);
  });

  it("keeps every generated row schema-valid: literal rx/scaled, literal pr, MM/DD/YYYY dates", () => {
    const rows = [franRow({ date: "01/01/2024" })];
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
          franRow({
            date: date.format("MM/DD/YYYY"),
            rx_or_scaled: day % 5 === 0 ? "SCALED" : "RX",
            pr: day === 40 ? "PR" : "",
          })
        );
      }
      if (day % 6 === 0) {
        const lift = lifts[(day / 6) % lifts.length]!;
        sampleRows.push(
          franRow({
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

// The tail's lifts and PRs follow the athlete's own history (measured on the
// bundled export: 22% of lift sessions beat the best so far, 10.8% of other
// entries are PRs). Before, every lift session sat at 98 to 103% of the best
// and every PR raised the base for the next, so two years of tail took the
// Snatch from 145 to 215 lb and the demo's Progress drifted to "everything Up".
describe("extendSampleRows: lifts and PRs follow the athlete", () => {
  const isoOf = (r: SugarWodRow) => dayjs(r.date, "MM/DD/YYYY").format("YYYY-MM-DD");

  it("flags a generated lift PR only when it beats the best so far", async () => {
    const { loadSampleRows } = await import("./fixtures/sampleRows");
    const real = await loadSampleRows();
    const ext = extendSampleRows(real, dayjs("2027-11-09"));
    const best = new Map<string, number>();
    for (const r of ext.slice(0, real.length)) {
      if (r.score_type === "Load" && r.barbell_lift) best.set(r.barbell_lift, Math.max(best.get(r.barbell_lift) ?? 0, Number(r.best_result_raw)));
    }
    const tail = ext.slice(real.length).filter((r) => r.score_type === "Load").sort((a, b) => (isoOf(a) < isoOf(b) ? -1 : 1));
    for (const r of tail) {
      const v = Number(r.best_result_raw);
      const before = best.get(r.barbell_lift) ?? 0;
      expect(r.pr === "PR").toBe(v > before);
      best.set(r.barbell_lift, Math.max(before, v));
    }
  });

  it("keeps PRs near the history's own rate rather than on most lift sessions", async () => {
    const { loadSampleRows } = await import("./fixtures/sampleRows");
    const real = await loadSampleRows();
    const tail = extendSampleRows(real, dayjs("2027-11-09")).slice(real.length);
    const share = (rows: SugarWodRow[]) => rows.filter((r) => r.pr === "PR").length / rows.length;
    const lifts = tail.filter((r) => r.score_type === "Load");
    const other = tail.filter((r) => r.score_type !== "Load");
    expect(share(lifts)).toBeGreaterThan(0.05);
    expect(share(lifts)).toBeLessThan(0.3);
    expect(share(other)).toBeGreaterThan(0.02);
    expect(share(other)).toBeLessThan(0.2);
  });

  it("grows each lift's best at a bounded yearly rate however old the export gets", async () => {
    const { loadSampleRows } = await import("./fixtures/sampleRows");
    const real = await loadSampleRows();
    const ext = extendSampleRows(real, dayjs("2028-11-09")); // two years past the export's end
    const best = (rows: SugarWodRow[], lift: string) =>
      Math.max(...rows.filter((r) => r.score_type === "Load" && r.barbell_lift === lift).map((r) => Number(r.best_result_raw)));
    for (const lift of ["Snatch", "Back Squat", "Deadlift", "Clean & Jerk"]) {
      const start = best(real, lift);
      // At most 5% a year on the level, plus one capped 6% step past it, plus rounding to 5 lb.
      expect(best(ext, lift)).toBeLessThanOrEqual(Math.ceil((start * (1 + 0.05 * 2.2) * 1.06) / 5) * 5);
    }
  });
});
