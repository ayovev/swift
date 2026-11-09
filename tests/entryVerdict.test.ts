import { describe, expect, it } from "vitest";
import { entryBodyWeightLine, entryFactsLine, entryLeftOut, entryShortfall, entrySummary, overlapsLine } from "@/lib/analytics/insights/entryDisplay";
import { entryVerdict } from "@/lib/analytics/insights/entryVerdict";
import type { ProgressSession, ProgressSubject } from "@/lib/analytics/insights/sessions";
import type { TimelineEntry } from "@/types/timeline";

const s = (date: string, value: number, maxEffort = false): ProgressSession => ({ date, value, maxEffort });
function subject(name: string, sessions: ProgressSession[], status: "RX" | "SCALED" = "RX"): ProgressSubject {
  const movement = name.toLowerCase();
  return { key: `${movement}|${status}`, movement, name, status, kind: "lift", format: "load", lowerIsBetter: false, sessions, entries: sessions };
}
/** n sessions a month apart ending the month before `endMonth`, all at `value`. */
const run = (year: number, firstMonth: number, values: number[]): ProgressSession[] =>
  values.map((v, i) => s(`${year}-${String(firstMonth + i).padStart(2, "0")}-10`, v));

const ENTRY: TimelineEntry = { id: "e", initiation: "changed", area: "nutrition", name: "Spring cut", startDate: "2025-05-01", endDate: "2025-08-31" };
const ASOF = "2026-01-01";

/** Four sessions before the entry (Jan to Apr 2025) and four during it (May to Aug). */
const lifter = (name: string, before: number[], during: number[]) => subject(name, [...run(2025, 1, before), ...run(2025, 5, during)]);

describe("the before and after of an entry the athlete changed (A1-TLN-32 to 40)", () => {
  it("TLN-32 compares the last N sessions on each side, N = min(4, during, before)", () => {
    const v = entryVerdict(ENTRY, [lifter("Back Squat", [100, 100, 100, 100], [110, 110, 110, 110])], ASOF);
    const r = v.compared[0]!.verdict!;
    expect(r.window).toBe(4);
    expect(r.change).toBe(10);
    expect(r.state).toBe("up");
  });

  it("TLN-33 shrinks the window to the smaller side, and needs at least 3", () => {
    const three = subject("Back Squat", [...run(2025, 1, [100, 100, 100, 100]), ...run(2025, 5, [110, 110, 110])]);
    expect(entryVerdict(ENTRY, [three], ASOF).compared[0]!.verdict!.window).toBe(3);
    const two = subject("Back Squat", [...run(2025, 1, [100, 100, 100, 100]), ...run(2025, 5, [110, 110])]);
    expect(entryVerdict(ENTRY, [two], ASOF).compared).toHaveLength(0);
  });

  it("TLN-34 summarises with the headline's own label and sentence once three subjects count", () => {
    const subjects = [
      lifter("Back Squat", [100, 100, 100, 100], [110, 110, 110, 110]),
      lifter("Deadlift", [200, 200, 200, 200], [220, 220, 220, 220]),
      lifter("Press", [100, 100, 100, 100], [100, 100, 101, 100]),
    ];
    const v = entryVerdict(ENTRY, subjects, ASOF);
    expect(v.label).toBe("Improving");
    expect(entrySummary(v)).toBe("Improving in 2 of 3 lifts and benchmarks (1 no clear change).");
  });

  it("TLN-35 leaves a not-tested-since subject out of the count and says so", () => {
    const subjects = [
      lifter("Back Squat", [100, 100, 100, 100], [110, 110, 110, 110]),
      lifter("Deadlift", [200, 200, 200, 200], [220, 220, 220, 220]),
      lifter("Press", [100, 100, 100, 100], [100, 100, 101, 100]),
      lifter("Clean", [150, 150, 150, 150], [120, 120, 120, 120]),
    ];
    const v = entryVerdict(ENTRY, subjects, ASOF);
    expect(v.notTested).toBe(1);
    expect(v.counted).toBe(3);
    expect(entryLeftOut(v)).toBe("Left out: 1 not tested since.");
  });

  it("TLN-36 reads a drop with a max effort during the entry as Down", () => {
    const maxed = subject("Clean", [...run(2025, 1, [150, 150, 150, 150]), s("2025-05-10", 120), s("2025-06-10", 120), s("2025-07-10", 120), s("2025-08-10", 120, true)]);
    expect(entryVerdict(ENTRY, [maxed], ASOF).compared[0]!.verdict!.state).toBe("down");
  });

  it("TLN-37 gives no label under three counted subjects, and says what is short", () => {
    const subjects = [
      lifter("Back Squat", [100, 100, 100, 100], [110, 110, 110, 110]),
      subject("Fran", [s("2025-02-10", 100), s("2025-03-10", 100), s("2025-04-10", 100), s("2025-05-10", 100), s("2025-06-10", 100)]),
    ];
    const v = entryVerdict(ENTRY, subjects, ASOF);
    expect(v.label).toBeNull();
    expect(entryShortfall(v)).toBe(
      "Needs 3 lifts or benchmarks with at least 3 sessions during this entry and 3 before it, has 1. Closest: Fran, 1 more during."
    );
  });

  it("TLN-38 lists facts for subjects with a session on each side, no direction, most sessions during first", () => {
    const subjects = [
      subject("Fran", [s("2025-02-10", 100), s("2025-03-10", 100), s("2025-04-10", 100), s("2025-05-10", 120)]),
      subject("Nancy", [s("2025-04-10", 90), s("2025-05-10", 95), s("2025-06-10", 96)]),
      subject("Cindy", [s("2025-09-10", 90)]),
    ];
    const v = entryVerdict(ENTRY, subjects, ASOF);
    expect(v.facts.map((r) => r.subject.name)).toEqual(["Nancy", "Fran"]);
    expect(entryFactsLine(subjects[1]!, ENTRY, ASOF)).toBe("Nancy: 1 session before, 2 during. Best before 90 lb, best during 96 lb.");
    expect(entryFactsLine(subjects[1]!, ENTRY, ASOF)).not.toMatch(/%|up|down/i);
  });

  it("TLN-39 runs an ongoing entry to the reference date and ignores later sessions", () => {
    const ongoing: TimelineEntry = { ...ENTRY, endDate: null };
    const sessions = [...run(2025, 1, [100, 100, 100, 100]), ...run(2025, 5, [110, 110, 110, 110]), s("2026-03-10", 300)];
    const v = entryVerdict(ongoing, [subject("Back Squat", sessions)], "2026-01-01");
    expect(v.compared[0]!.verdict!.recentBest.value).toBe(110);
  });

  it("TLN-40 counts a move up to RX dated inside the entry as one Up vote", () => {
    const scaled = subject("Fran", [s("2025-02-10", 300), s("2025-03-10", 300), s("2025-04-10", 300)], "SCALED");
    const rx = subject("Fran", [s("2025-06-10", 240)], "RX");
    const v = entryVerdict(ENTRY, [scaled, rx], ASOF);
    expect(v.moveUps).toHaveLength(1);
    expect(v.up).toBe(1);
    const outside = entryVerdict({ ...ENTRY, startDate: "2025-07-01" }, [scaled, rx], ASOF);
    expect(outside.moveUps).toHaveLength(0);
  });

  it("changes nothing in the subjects it reads", () => {
    const subjects = [lifter("Back Squat", [100, 100, 100, 100], [110, 110, 110, 110])];
    const before = JSON.stringify(subjects);
    entryVerdict(ENTRY, subjects, ASOF);
    expect(JSON.stringify(subjects)).toBe(before);
  });
});

describe("an entry's body weight and overlaps", () => {
  const readings = [
    { date: "2025-05-01", weightLb: 190 },
    { date: "2025-08-31", weightLb: 184 },
  ];

  it("states the weight at each end of the span with the change, once", () => {
    expect(entryBodyWeightLine(ENTRY, readings, 3, ASOF)).toBe("Body weight over this entry: 190 lb to 184 lb, down 6 lb.");
  });

  it("calls a change inside the noise band within normal variation", () => {
    const flat = [{ date: "2025-05-01", weightLb: 190 }, { date: "2025-08-31", weightLb: 188 }];
    expect(entryBodyWeightLine(ENTRY, flat, 3, ASOF)).toBe("Body weight over this entry: 190 lb to 188 lb, within normal variation.");
  });

  it("says nothing without readings at both ends", () => {
    expect(entryBodyWeightLine(ENTRY, [], 3, ASOF)).toBeNull();
    expect(entryBodyWeightLine(ENTRY, [{ date: "2020-01-01", weightLb: 190 }], 3, ASOF)).toBeNull();
  });

  it("names overlapping entries, or nothing", () => {
    expect(overlapsLine(["Two weeks abroad", "Shoulder tweak"])).toBe("Overlaps: Two weeks abroad, Shoulder tweak");
    expect(overlapsLine([])).toBeNull();
  });
});
