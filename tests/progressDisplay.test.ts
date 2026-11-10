import { describe, expect, it } from "vitest";
import { bodyContextLines, valueAt, type BodyReading } from "@/lib/analytics/insights/bodyContext";
import { quarterBests, trendLine } from "@/lib/analytics/insights/chart";
import { displayName, factsLine, formatClock, monthSpan, newBestText, shortfallText, verdictText } from "@/lib/analytics/insights/display";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { filterRowsByPeriod, periodRange } from "@/lib/analytics/insights/period";
import { buildProgressSubjects, parseRoundsReps, type ProgressSession, type ProgressSubject } from "@/lib/analytics/insights/sessions";
import { progressVerdict } from "@/lib/analytics/insights/verdict";
import { workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const s = (date: string, value: number, extra: Partial<ProgressSession> = {}): ProgressSession => ({ date, value, maxEffort: false, ...extra });

function subject(name: string, status: "RX" | "SCALED", format: ProgressSubject["format"], sessions: ProgressSession[]): ProgressSubject {
  const kind = format === "load" ? "lift" : "benchmark";
  const movement = name.toLowerCase();
  return { key: `${movement}|${status}`, movement, name, status, kind, format, lowerIsBetter: format === "time", sessions, entries: sessions };
}

const lift = (name: string, ...sessions: ProgressSession[]) => subject(name, "RX", "load", sessions);
const verdictOf = (sub: ProgressSubject) => progressVerdict(sub.sessions, sub.lowerIsBetter, sub.kind) as NonNullable<ReturnType<typeof progressVerdict>>;

describe("display (A1-DSP)", () => {
  const fsq = lift("Front Squat", s("2023-07-07", 205), s("2024-03-11", 166), s("2024-03-18", 161), s("2024-04-08", 184), s("2025-03-31", 178), s("2026-02-03", 189), s("2026-03-30", 200), s("2026-04-07", 178), s("2026-08-07", 194));

  it("DSP-01 names the windows and gives the change in pounds first", () => {
    const t = verdictText(fsq, verdictOf(fsq));
    expect(t.windows).toBe("Last 4: Feb to Aug 2026 · Previous 4: Mar 2024 to Mar 2025");
    expect(t.change).toBe("+16 lb (184 to 200 lb est. 1RM), +8.7%");
  });

  it("DSP-02 shortens a window to its months", () => {
    expect(monthSpan("2026-08-02", "2026-08-30")).toBe("Aug 2026");
    expect(monthSpan("2026-03-02", "2026-08-30")).toBe("Mar to Aug 2026");
    expect(monthSpan("2024-03-02", "2025-03-30")).toBe("Mar 2024 to Mar 2025");
  });

  it("DSP-03 writes times as m:ss, or h:mm:ss from an hour", () => {
    expect(formatClock(827)).toBe("13:47");
    expect(formatClock(3735)).toBe("1:02:15");
    const nancy = subject("Nancy", "SCALED", "time", [s("2023-01-04", 884), s("2023-04-05", 878), s("2023-06-26", 866), s("2024-11-12", 827), s("2025-04-28", 877), s("2025-09-22", 956), s("2026-04-13", 899)]);
    expect(verdictText(nancy, verdictOf(nancy)).change).toBe("0:50 slower (13:47 to 14:37), 6.0% slower");
    const fast = subject("Fran", "RX", "time", [s("2025-01-10", 840), s("2025-02-07", 830), s("2025-03-07", 800), s("2025-04-04", 760), s("2025-05-02", 740), s("2025-06-06", 720)]);
    expect(verdictText(fast, verdictOf(fast)).change).toBe("1:20 faster (13:20 to 12:00), 10.0% faster");
    const long = subject("Murph", "RX", "time", [s("2025-01-10", 3508), s("2025-02-10", 3508), s("2025-03-10", 3508), s("2025-04-10", 3735), s("2025-05-10", 3735), s("2025-06-10", 3735)]);
    expect(verdictText(long, verdictOf(long)).change).toBe("3:47 slower (58:28 to 1:02:15), 6.5% slower");
  });

  it("DSP-04 and DSP-05 Rounds + Reps give a difference only where reps per round is known", () => {
    const cindy = subject("Cindy", "RX", "rounds-reps", [
      s("2025-01-10", 480, { display: "16" }), s("2025-02-10", 460, { display: "15+10" }), s("2025-03-10", 485, { display: "16+5" }),
      s("2025-04-10", 495, { display: "16+15" }), s("2025-05-10", 512, { display: "17+2" }), s("2025-06-10", 530, { display: "17+20" }),
    ]);
    expect(verdictText(cindy, verdictOf(cindy)).change).toBe("+45 reps (16+5 to 17+20), +9.3%");
    const other = { ...cindy, movement: "annie", name: "Annie" };
    expect(verdictText(other, verdictOf(other)).change).toBe("16+5 to 17+20");
  });

  it("DSP-06 reads Rounds + Reps from the display", () => {
    expect(parseRoundsReps("5+10")).toEqual({ rounds: 5, reps: 10 });
    expect(parseRoundsReps("12+19")).toEqual({ rounds: 12, reps: 19 });
    expect(parseRoundsReps("16")).toEqual({ rounds: 16, reps: 0 });
  });

  it("DSP-06 the builder turns Cindy's display into total reps", () => {
    const rows = ["16", "15+10", "16+5", "16+15", "17+2", "17+20"].map((d, i) =>
      workoutRow({ date: `0${i + 1}/10/2025`, title: "CINDY", best_result_raw: "16.015", best_result_display: d, score_type: "Rounds + Reps" })
    );
    const cindy = buildProgressSubjects(rows).subjects.find((x) => x.movement === "cindy") as ProgressSubject;
    expect(cindy.sessions.map((x) => x.value)).toEqual([480, 460, 485, 495, 512, 530]);
  });

  it("DSP-07 says so when the bests display the same", () => {
    const flat = lift("Back Squat", s("2025-01-10", 200), s("2025-02-10", 190), s("2025-03-10", 211.6), s("2025-04-10", 190), s("2025-05-10", 212.4), s("2025-06-10", 190));
    expect(verdictText(flat, verdictOf(flat)).change).toBe("no change in the best (212 and 212 lb est. 1RM)");
    const t = subject("Nancy", "RX", "time", [s("2025-01-10", 900), s("2025-02-10", 827), s("2025-03-10", 900), s("2025-04-10", 900), s("2025-05-10", 827), s("2025-06-10", 900)]);
    expect(verdictText(t, verdictOf(t)).change).toBe("no change in the best (13:47 and 13:47)");
  });

  it("DSP-08 notes a recent window spanning more than 24 months", () => {
    const long = lift("Power Snatch", s("2023-01-27", 120), s("2023-02-06", 124), s("2023-05-05", 120), s("2024-01-18", 140), s("2025-02-03", 135), s("2026-03-10", 145));
    expect(verdictText(long, verdictOf(long)).longGap).toBe("Recent sessions span 26 months (Jan 2024 to Mar 2026).");
    expect(verdictText(fsq, verdictOf(fsq)).longGap).toBeNull();
  });

  it("DSP-09 leaves RX unmarked and names Scaled", () => {
    expect(displayName(lift("Back Squat"))).toBe("Back Squat");
    expect(displayName(subject("Nancy", "SCALED", "time", []))).toBe("Nancy (Scaled)");
  });

  it("VRD-17 writes the new best note", () => {
    const climb = lift("Deadlift", ...[100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map((v, i) => s(`2025-${String(i + 1).padStart(2, "0")}-10`, v)));
    const v = verdictOf(climb);
    expect(newBestText(climb, v, v.previousBest)).toBe("New best est. 1RM: 111 lb on Dec 10, 2025, 3.7% above the previous best of 107 lb.");
  });

  it("VRD-17b names the logged set a lift's new best was estimated from", () => {
    const sets = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
    const climb = lift("Deadlift", ...sets.map((v, i) => s(`2025-${String(i + 1).padStart(2, "0")}-10`, v, { logged: { load: v - 6, reps: 2 } })));
    const v = verdictOf(climb);
    expect(newBestText(climb, v, v.previousBest)).toBe("New best est. 1RM: 111 lb on Dec 10, 2025 (from 105 × 2), 3.7% above the previous best of 107 lb.");
  });

  it("DSP-12 never lets a lift's estimate read as a load that was lifted", async () => {
    // Over the real sample: every lift verdict line and every record note says the pounds are an estimate, and no benchmark does.
    const { subjects } = buildProgressSubjects(await loadSampleRows());
    let lifts = 0;
    for (const sub of subjects) {
      const v = progressVerdict(sub.sessions, sub.lowerIsBetter, sub.kind);
      if (!v) continue;
      const note = newBestText(sub, v, v.previousBest);
      if (sub.format === "load") {
        lifts++;
        expect(verdictText(sub, v).change).toContain("est. 1RM");
        if (note) expect(note).toMatch(/^New best est\. 1RM: .* \(from \d+ × \d+\)/);
      } else {
        expect(verdictText(sub, v).change).not.toContain("est.");
        if (note) expect(note).not.toContain("est.");
      }
    }
    expect(lifts).toBeGreaterThan(5);
  });
});

describe("the facts line (A1-FCT)", () => {
  it("FCT-01 states what was logged and no direction", () => {
    const hpc = lift("Hang Power Clean", s("2022-12-06", 139.9), s("2023-01-02", 120.5), s("2023-01-09", 151.9), s("2026-03-10", 175), s("2026-08-19", 185));
    expect(factsLine(hpc)).toBe("Hang Power Clean: 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est. (Mar 2026), +10 lb. Needs 1 more session for a verdict.");
  });

  it("FCT-03 a single session shows no comparison", () => {
    expect(factsLine(lift("Back Pause Squat", s("2023-09-22", 200)))).toBe("Back Pause Squat: 1 session (Sep 2023). Needs 5 more sessions for a verdict.");
  });

  it("FCT-04 a time benchmark", () => {
    const fran = subject("Fran", "SCALED", "time", [s("2023-01-16", 456), s("2023-04-11", 392), s("2025-05-19", 457)]);
    expect(factsLine(fran)).toBe("Fran (Scaled): 3 sessions. Latest 7:37 (May 2025), previous 6:32 (Apr 2023), 1:05 slower. Needs 3 more sessions for a verdict.");
  });

  it("FCT-08 words the shortfall", () => {
    expect(shortfallText(5)).toBe("Needs 1 more session for a verdict.");
    expect(shortfallText(4)).toBe("Needs 2 more sessions for a verdict.");
  });
});

describe("body context lines (A1-BDY)", () => {
  const fsq = lift("Front Squat", s("2024-04-08", 184));
  const base = { subject: fsq, state: "up" as const, change: 8.8, from: "2024-04-08", to: "2026-03-30", bests: { previous: 184, recent: 200 } };
  const at = (a: number, b: number): BodyReading[] => [{ date: "2024-04-08", weightLb: a }, { date: "2026-03-30", weightLb: b }];

  it("BDY-01 to BDY-03 relate body weight to the lift by share", () => {
    expect(bodyContextLines(base, at(180, 183.6), 3)).toEqual({ first: "Body weight 180 to 183.6 lb (+3.6 lb) over the same span.", relation: "A little of this change is body weight." });
    expect(bodyContextLines(base, at(180, 185.4), 3)?.relation).toBe("About half of this change is body weight.");
    expect(bodyContextLines(base, at(180, 193), 3)?.relation).toBe("Most of this change is body weight.");
  });

  it("BDY-05 states the comparison when body weight moved at least as much", () => {
    const dl = { ...base, subject: lift("Deadlift"), change: 1.4, bests: { previous: 370, recent: 375 } };
    expect(bodyContextLines(dl, at(180, 185.4), 3)?.relation).toBe("Body weight rose at least as much as the lift (+3.0% vs +1.4%).");
  });

  it("BDY-06 and BDY-07 name the best case and its reverse", () => {
    expect(bodyContextLines(base, at(180, 176), 3)?.relation).toBe("Body weight fell 4 lb while the lift rose: relative to body weight, +11.2%.");
    const down = { ...base, state: "down" as const, change: -6, bests: { previous: 200, recent: 188 } };
    expect(bodyContextLines(down, at(180, 185), 3)?.relation).toBe("Body weight rose 5 lb while the lift fell: relative to body weight, −8.5%.");
  });

  it("BDY-08 a change inside the band has no relating sentence; exactly the band is inside", () => {
    expect(bodyContextLines(base, at(180, 182), 3)).toEqual({ first: "Body weight 180 to 182 lb, within normal variation.", relation: null });
    expect(bodyContextLines(base, at(180, 183), 3)?.relation).toBeNull();
    expect(bodyContextLines(base, at(180, 183.1), 3)?.relation).not.toBeNull();
  });

  it("BDY-09 no sentence for a benchmark, a move up to RX or not tested since", () => {
    const fran = subject("Fran", "RX", "time", []);
    expect(bodyContextLines({ ...base, subject: fran }, at(180, 185.4), 3)?.relation).toBeNull();
    expect(bodyContextLines({ ...base, state: "move-up", change: null, bests: null }, at(180, 185.4), 3)?.relation).toBeNull();
    expect(bodyContextLines({ ...base, state: "not-tested-since" }, at(180, 185.4), 3)?.relation).toBeNull();
  });

  it("BDY-11 writes the first line in its four forms", () => {
    expect(bodyContextLines(base, at(178, 184), 3)?.first).toBe("Body weight 178 to 184 lb (+6 lb) over the same span.");
    const withComp: BodyReading[] = [
      { date: "2024-04-08", weightLb: 178, leanLb: 150, fatLb: 20 },
      { date: "2026-03-30", weightLb: 184, leanLb: 152.4, fatLb: 23.6 },
    ];
    expect(bodyContextLines(base, withComp, 3)?.first).toBe("Body weight +6 lb: lean +2.4 lb, fat +3.6 lb.");
    expect(bodyContextLines(base, [{ date: "2024-04-08", weightLb: 178 }], 3)?.first).toBe("No body weight within 21 days of Mar 2026.");
  });

  it("BDY-12 reads a date by that day, a line between readings 45 days apart, or the nearest within 21 days", () => {
    const r: BodyReading[] = [{ date: "2026-03-01", weightLb: 180 }, { date: "2026-04-15", weightLb: 190 }];
    expect(valueAt("2026-03-01", r, "weightLb")).toBe(180);
    expect(valueAt("2026-03-16", r, "weightLb")).toBeCloseTo(183.33, 1);
    expect(valueAt("2026-05-07", r, "weightLb")).toBeNull();
    expect(valueAt("2026-05-06", r, "weightLb")).toBe(190);
  });

  it("BDY-13 has no line without readings", () => {
    expect(bodyContextLines(base, [], 3)).toBeNull();
  });
});

describe("the Logged in filter (A1-FLT)", () => {
  const mk = (name: string, last: string) => subject(name, "RX", "load", [s("2025-01-10", 100), s("2025-02-10", 100), s("2025-03-10", 100), s("2025-04-10", 100), s("2025-05-10", 100), s(last, 100)]);
  const { rows } = classifySubjects([mk("A", "2026-08-09"), mk("B", "2026-08-08"), mk("C", "2026-06-09"), mk("D", "2026-03-09")], "2026-09-09");

  it("FLT-05 lists a session N calendar months back and not the day before", () => {
    expect(periodRange("last_1_month", "2026-09-09")).toEqual({ start: "2026-08-09", end: "2026-09-09" });
    expect(filterRowsByPeriod(rows, periodRange("last_1_month", "2026-09-09")).map((r) => r.subject.name)).toEqual(["A"]);
    expect(filterRowsByPeriod(rows, periodRange("last_3_months", "2026-09-09")).map((r) => r.subject.name)).toEqual(["A", "B", "C"]);
  });

  it("clamps a month shorter than the reference day", () => {
    expect(periodRange("last_1_month", "2026-03-31")).toEqual({ start: "2026-02-28", end: "2026-03-31" });
  });

  it("FLT-01 All lists everything", () => {
    expect(filterRowsByPeriod(rows, periodRange("all", "2026-09-09"))).toHaveLength(4);
  });

  it("FLT-12 a custom range is inclusive, and a start after the end is invalid", () => {
    expect(filterRowsByPeriod(rows, periodRange("custom", "2026-09-09", { start: "2026-03-09", end: "2026-06-09" })).map((r) => r.subject.name)).toEqual(["C", "D"]);
    expect(periodRange("custom", "2026-09-09", { start: "2026-06-09", end: "2026-03-09" })).toBe("invalid");
  });
});

describe("the evidence chart numbers", () => {
  it("picks the best of each quarter", () => {
    const q = quarterBests([s("2025-01-10", 100), s("2025-02-10", 105), s("2025-04-10", 103)], false);
    expect(q.map((x) => x.value)).toEqual([105, 103]);
  });

  it("draws a trend only with four quarters, and it is a Theil-Sen line", () => {
    const rising = ["2025-01-15", "2025-04-15", "2025-07-15", "2025-10-15"].map((d, i) => s(d, 100 + i * 10));
    expect(trendLine(rising.slice(0, 3), false)).toBeNull();
    const t = trendLine(rising, false);
    expect(t).not.toBeNull();
    expect(t!.to.y).toBeGreaterThan(t!.from.y);
    expect(t!.from.y).toBeCloseTo(100, 0);
  });
});
