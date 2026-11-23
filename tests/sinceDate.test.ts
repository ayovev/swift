import { beforeAll, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { compareProgress, sinceStateLabel, stateOf, type SinceRow } from "@/lib/analytics/insights/sinceDate";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleRows } from "./fixtures/sampleRows";

let rows: SugarWodRow[];
let lastDay: string;
beforeAll(async () => {
  rows = await loadSampleRows();
  lastDay = rows.map((r) => parseWorkoutDate(r.date).format("YYYY-MM-DD")).sort().at(-1)!;
});

describe("compareProgress", () => {
  it("compares the engine at two dates, and the earlier side is exactly Progress as of that date", () => {
    const { subjects } = buildProgressSubjects(rows);
    const since = dayjs(lastDay).subtract(12, "month").format("YYYY-MM-DD");
    const c = compareProgress(subjects, since, lastDay);
    expect(c.headlineNow).toEqual(classifySubjects(subjects, lastDay).headline);
    expect(c.headlineThen).toEqual(classifySubjects(subjects, since).headline);
    const earlier = new Map(classifySubjects(subjects, since).rows.map((r) => [r.subject.key, r]));
    for (const row of c.rows) expect(row.then).toBe(stateOf(earlier.get(row.key)));
  });

  it("marks a subject as not logged yet when nothing had been logged by the earlier date", () => {
    const { subjects } = buildProgressSubjects(rows);
    const first = rows.map((r) => parseWorkoutDate(r.date).format("YYYY-MM-DD")).sort()[0]!;
    const c = compareProgress(subjects, dayjs(first).subtract(1, "day").format("YYYY-MM-DD"), lastDay);
    expect(c.rows.length).toBeGreaterThan(0);
    expect(c.rows.every((r) => r.then === "none")).toBe(true);
    expect(c.headlineThen.counted).toBe(0);
  });

  it("counts only the sessions after the earlier date and up to today", () => {
    const { subjects } = buildProgressSubjects(rows);
    const since = dayjs(lastDay).subtract(6, "month").format("YYYY-MM-DD");
    const c = compareProgress(subjects, since, lastDay);
    for (const r of c.rows) {
      const direct = r.subject.sessions.filter((s) => s.date > since && s.date <= lastDay).length;
      expect(r.sessionsSince).toBe(direct);
    }
    expect(c.rows.some((r) => r.sessionsSince > 0)).toBe(true);
  });

  it("flags a row as changed exactly when its two states differ, and finds some change over a year of the sample", () => {
    const { subjects } = buildProgressSubjects(rows);
    const c = compareProgress(subjects, dayjs(lastDay).subtract(12, "month").format("YYYY-MM-DD"), lastDay);
    for (const r of c.rows as SinceRow[]) expect(r.changed).toBe(r.then !== r.now);
    expect(c.rows.some((r) => r.changed)).toBe(true);
  });

  it("does not let a later move up to RX show in the earlier state", () => {
    const { subjects } = buildProgressSubjects(rows);
    // Back squat moved up to RX on 2023-08-07 (see tests/asOfDate.test.ts); on 2023-01-20 it must not be a move up.
    const c = compareProgress(subjects, "2023-01-20", lastDay);
    const squat = c.rows.find((r) => r.key === "back squat|RX");
    expect(squat?.then).not.toBe("move-up");
  });

  it("words every state", () => {
    for (const s of ["up", "down", "not-tested-since", "no-clear-change", "move-up", "few", "not-recent", "none"] as const) {
      expect(sinceStateLabel(s).length).toBeGreaterThan(0);
    }
  });
});
