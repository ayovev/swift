import dayjs from "dayjs";
import { beforeAll, describe, expect, it } from "vitest";
import { classifySubjects, type ProgressRow } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * Progress "as of" a past date (docs/reports.md, R-14: "Since a chosen date" compares Progress now with Progress as of that date).
 *
 * The rule under test: running the verdict engine over the whole log with a past reference date must give exactly what it would have
 * given on that day, that is, what it gives over a log that stops on that date. Anything that differs is the future leaking into the
 * past, which would put a move up to RX or a verdict that had not happened yet into a report that claims to show "then".
 */
let rows: SugarWodRow[];
let lastDay: string;

beforeAll(async () => {
  rows = await loadSampleRows();
  lastDay = rows.reduce((max, r) => {
    const d = parseWorkoutDate(r.date).format("YYYY-MM-DD");
    return d > max ? d : max;
  }, "");
});

const upTo = (all: readonly SugarWodRow[], day: string): SugarWodRow[] => all.filter((r) => parseWorkoutDate(r.date).format("YYYY-MM-DD") <= day);

/** What a report would print for a row that is judged: its group, its verdict and its move up to RX. */
function shown(r: ProgressRow) {
  return {
    key: r.subject.key,
    group: r.group,
    state: r.verdict?.state ?? null,
    change: r.verdict?.change ?? null,
    moveUp: r.moveUp?.date ?? null,
    moveUpVotes: r.moveUpVotes,
    latest: r.latest,
  };
}

/**
 * A subject with fewer than 6 sessions ("few") is never judged, and whether one exists at all can differ between the two logs: a lift
 * named only by its title is folded in once the whole log shows the lift exists (see buildProgressSubjects). So the comparison is over
 * what carries a verdict or a vote, which is all a report states about a subject.
 */
const judged = (rowsIn: readonly ProgressRow[]) => rowsIn.filter((r) => r.group !== "few").map(shown);

describe("Progress as of a past date", () => {
  /** Every 20 days across the log, from two months in, so each move up to RX in the sample falls after some reference date. */
  function days(): string[] {
    const first = rows.reduce((min, r) => {
      const d = parseWorkoutDate(r.date).format("YYYY-MM-DD");
      return min === "" || d < min ? d : min;
    }, "");
    const out: string[] = [];
    for (let d = dayjs(first).add(60, "day"); d.isBefore(dayjs(lastDay)); d = d.add(20, "day")) out.push(d.format("YYYY-MM-DD"));
    return out;
  }

  it("equals Progress over a log that stops there, for every reference date across the sample", () => {
    const all = buildProgressSubjects(rows).subjects;
    const mismatches: string[] = [];
    for (const day of days()) {
      const whole = classifySubjects(all, day);
      const stopped = classifySubjects(buildProgressSubjects(upTo(rows, day)).subjects, day);
      const a = { up: whole.headline.up, down: whole.headline.down, noClearChange: whole.headline.noClearChange, moveUps: whole.headline.moveUps, rows: judged(whole.rows) };
      const b = { up: stopped.headline.up, down: stopped.headline.down, noClearChange: stopped.headline.noClearChange, moveUps: stopped.headline.moveUps, rows: judged(stopped.rows) };
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(day);
    }
    expect(mismatches).toEqual([]);
  });

  it("never reports a move up to RX dated after the reference date", () => {
    const all = buildProgressSubjects(rows).subjects;
    for (const day of days()) {
      for (const r of classifySubjects(all, day).rows) {
        if (r.moveUp) expect(r.moveUp.date <= day, `${r.subject.key} moved up on ${r.moveUp.date}, after ${day}`).toBe(true);
      }
    }
  });

  it("finds the sample's move ups, so the checks above cannot pass by matching nothing", () => {
    const moves = classifySubjects(buildProgressSubjects(rows).subjects, lastDay).rows.filter((r) => r.moveUp);
    expect(moves.length).toBeGreaterThan(0);
  });
});
