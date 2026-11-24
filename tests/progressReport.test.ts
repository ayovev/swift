import { beforeAll, describe, expect, it } from "vitest";
import { buildProgressReportData, entriesInPeriod, prsSince } from "@/lib/analytics/insights/progressReport";
import { entryVerdict } from "@/lib/analytics/insights/entryVerdict";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import { scanRow, workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const TODAY = "2026-09-11";
let rows: SugarWodRow[];
beforeAll(async () => {
  rows = await loadSampleRows();
});

const entry = (over: Partial<TimelineEntry> & { id: string; startDate: string }): TimelineEntry => ({
  initiation: "changed",
  area: "training",
  endDate: null,
  ...over,
});

describe("prsSince", () => {
  it("lists the flagged PRs after the date and up to today, newest first, and nothing else", () => {
    const since = "2026-01-01";
    const prs = prsSince(rows, since, TODAY);
    const direct = rows.filter((r) => {
      const d = parseWorkoutDate(r.date).format("YYYY-MM-DD");
      return r.pr === "PR" && d > since && d <= TODAY;
    });
    expect(prs).toHaveLength(direct.length);
    expect(prs.length).toBeGreaterThan(0);
    const dates = prs.map((p) => p.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("leaves out the comparison day itself, a PR dated after today, and rows that are not flagged", () => {
    const log = [
      workoutRow({ date: "03/01/2026", title: "On the day", pr: "PR" }),
      workoutRow({ date: "03/02/2026", title: "After", pr: "PR", best_result_display: "225", score_type: "Load" }),
      workoutRow({ date: "03/03/2026", title: "Not a PR" }),
      workoutRow({ date: "04/01/2026", title: "Future", pr: "PR" }),
    ];
    const prs = prsSince(log, "2026-03-01", "2026-03-31");
    expect(prs).toEqual([{ date: "2026-03-02", title: "After", display: "225 lb" }]);
  });

  it("keeps the log's own order within a day", () => {
    const log = [
      workoutRow({ date: "03/02/2026", title: "First", pr: "PR" }),
      workoutRow({ date: "03/02/2026", title: "Second", pr: "PR" }),
    ];
    expect(prsSince(log, "2026-03-01", "2026-03-31").map((p) => p.title)).toEqual(["First", "Second"]);
  });
});

describe("entriesInPeriod", () => {
  const all = [
    entry({ id: "old", startDate: "2025-01-01", endDate: "2025-02-01" }),
    entry({ id: "spans", startDate: "2026-02-01", endDate: "2026-04-01" }),
    entry({ id: "ongoing", startDate: "2026-05-01" }),
    entry({ id: "future", startDate: "2026-10-01" }),
  ];

  it("keeps entries that share a day with the period, an ongoing one running to today", () => {
    expect(entriesInPeriod(all, "2026-03-15", TODAY).map((e) => e.id)).toEqual(["spans", "ongoing"]);
  });

  it("keeps every entry that has started when no date is chosen", () => {
    expect(entriesInPeriod(all, null, TODAY).map((e) => e.id)).toEqual(["old", "spans", "ongoing"]);
  });
});

describe("buildProgressReportData", () => {
  it("gives an entry the athlete changed the Timeline's own before and after, and an entry that happened none", () => {
    const changed = entry({ id: "c", name: "Strength block", startDate: "2025-01-06", endDate: "2025-06-30" });
    const happened = entry({ id: "h", initiation: "happened", area: "travel", name: "Trip", startDate: "2025-02-01", endDate: "2025-02-10" });
    const data = buildProgressReportData(rows, TODAY, null, { timeline: [changed, happened] });
    const { subjects } = buildProgressSubjects(rows);
    const [a, b] = data.changes;
    expect(a!.entry.id).toBe("c");
    expect(JSON.stringify(a!.verdict)).toEqual(JSON.stringify(entryVerdict(changed, subjects, TODAY)));
    expect(b!.entry.id).toBe("h");
    expect(b!.verdict).toBeNull();
  });

  it("prints no PRs without a comparison date, and the PRs after it with one", () => {
    expect(buildProgressReportData(rows, TODAY, null).prs).toEqual([]);
    expect(buildProgressReportData(rows, TODAY, "2026-01-01").prs).toEqual(prsSince(rows, "2026-01-01", TODAY));
  });

  it("reads body weight over an entry's span from scans and weigh-ins, and says when there is none", () => {
    const e = entry({ id: "c", startDate: "2026-03-01", endDate: "2026-04-01" });
    const none = buildProgressReportData(rows, TODAY, null, { timeline: [e] });
    expect(none.hasBodyReadings).toBe(false);
    expect(none.changes[0]!.bodyLine).toBeNull();

    const scans = [scanRow("2026-03-01", { "Weight(lb)": "190.0" }), scanRow("2026-04-01", { "Weight(lb)": "180.0" })];
    const withScans = buildProgressReportData(rows, TODAY, null, { timeline: [e], scans });
    expect(withScans.hasBodyReadings).toBe(true);
    expect(withScans.changes[0]!.bodyLine).toMatch(/190 lb to 180 lb, down 10 lb/);
  });
});
