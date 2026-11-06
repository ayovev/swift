import { describe, expect, it } from "vitest";
import { buildLiftSubjects, estimateOneRepMax } from "@/lib/analytics/plateauDetector";
import { classifySubjects, findMoveUps, headlineSentence, labelOf } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects, type ProgressSession, type ProgressSubject } from "@/lib/analytics/insights/sessions";
import { progressVerdict, roundHalfAway } from "@/lib/analytics/insights/verdict";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import { workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * The progress verdict (src/lib/analytics/insights), as cases. Each `it` names the Insights acceptance case it pins; the numbers are
 * the ones the design was worked out on. Values are estimated 1RMs in pounds, supplied directly, so a verdict case does not depend on
 * the estimator (it has its own cases). A `*` in a comment marks a max effort.
 */

const s = (date: string, value: number, maxEffort = false): ProgressSession => ({ date, value, maxEffort });
const lift = (...sessions: ProgressSession[]) => progressVerdict(sessions, false, "lift");

function subject(partial: Partial<ProgressSubject> & { name: string; status: "RX" | "SCALED"; sessions: ProgressSession[] }): ProgressSubject {
  const movement = partial.movement ?? partial.name.toLowerCase();
  const kind = partial.kind ?? "lift";
  const lowerIsBetter = partial.lowerIsBetter ?? false;
  const format = partial.format ?? (kind === "lift" ? "load" : lowerIsBetter ? "time" : "rounds-reps");
  return { key: `${movement}|${partial.status}`, movement, kind, format, lowerIsBetter, entries: partial.sessions, ...partial };
}

/** One row of a lift, `date` as YYYY-MM-DD; reps default to a single. */
function entry(date: string, lift: string, load: number, opts: { reps?: number; status?: "RX" | "SCALED"; pr?: boolean; desc?: string } = {}) {
  const [y, m, d] = date.split("-");
  return workoutRow({
    date: `${m}/${d}/${y}`,
    title: lift.toUpperCase(),
    description: opts.desc ?? `${lift} ${opts.reps ?? 1}RM`,
    barbell_lift: lift,
    score_type: "Load",
    best_result_raw: String(load),
    rx_or_scaled: opts.status ?? "RX",
    pr: opts.pr ? "PR" : "",
  });
}

// A1-VRD-05's sessions.
const VRD05: ProgressSession[] = [
  s("2024-03-05", 170, true), s("2024-06-11", 176), s("2024-09-10", 183, true), s("2024-12-03", 186), s("2025-01-10", 195, true),
  s("2025-02-07", 150), s("2025-03-07", 155), s("2025-04-04", 158), s("2025-05-02", 160), s("2025-07-11", 200, true),
];
const monthly = (values: number[]) => values.map((v, i) => s(`2025-${String(i + 1).padStart(2, "0")}-10`, v));

describe("sessions and values (A1-SES)", () => {
  it("SES-01 collapses same-day entries to the best", () => {
    const rows = [
      entry("2025-01-10", "Deadlift", 195), entry("2025-02-07", "Deadlift", 188), entry("2025-03-07", "Deadlift", 190), entry("2025-03-07", "Deadlift", 200),
      entry("2025-04-04", "Deadlift", 202), entry("2025-05-02", "Deadlift", 204), entry("2025-06-06", "Deadlift", 206),
    ];
    const { subjects } = buildProgressSubjects(rows);
    const d = subjects[0] as ProgressSubject;
    expect(d.sessions).toHaveLength(6);
    expect(d.entries).toHaveLength(7);
    expect(d.sessions.find((x) => x.date === "2025-03-07")?.value).toBe(200);
    expect(progressVerdict(d.sessions, false, "lift")?.n).toBe(6);
  });

  it("SES-02 estimates a 1RM as the average of Epley and Brzycki, a single as-is", () => {
    expect(estimateOneRepMax(200, 1)).toBe(200);
    expect(estimateOneRepMax(225, 3)).toBeCloseTo(242.87, 2);
    expect(estimateOneRepMax(165, 5)).toBeCloseTo(189.06, 2);
  });

  it("SES-03 uses 1 to 8 reps and counts the rest as unused", () => {
    const rows = [
      entry("2025-01-10", "Back Squat", 225, { reps: 8 }),
      entry("2025-02-10", "Back Squat", 225, { reps: 9 }),
      entry("2025-03-10", "Back Squat", 225, { desc: "Back Squat for load" }),
    ];
    const { subjects, unused } = buildProgressSubjects(rows);
    expect(subjects[0]?.sessions.map((x) => x.value.toFixed(1))).toEqual(["282.2"]);
    expect(unused).toMatchObject({ loadRows: 3, used: 1, outsideRange: 1, noScheme: 1 });
  });

  it("SES-04 compares sessions of different rep schemes", () => {
    expect(estimateOneRepMax(185, 3)).toBeCloseTo(199.7, 1);
  });

  it("SES-05 a Load row naming no lift is not a subject", () => {
    const { subjects, unused } = buildProgressSubjects([workoutRow({ date: "01/10/2025", title: "MYSTERY", description: "3RM", score_type: "Load", best_result_raw: "200" })]);
    expect(subjects).toHaveLength(0);
    expect(unused.noLiftNamed).toBe(1);
  });

  it("SES-06 a benchmark uses the better score of a day (lower is better for a time)", () => {
    const rows = [
      workoutRow({ date: "01/10/2025", title: "FRAN", best_result_raw: "460", rx_or_scaled: "RX" }),
      workoutRow({ date: "01/10/2025", title: "FRAN", best_result_raw: "456", rx_or_scaled: "RX" }),
    ];
    const fran = buildProgressSubjects(rows).subjects[0] as ProgressSubject;
    expect(fran.lowerIsBetter).toBe(true);
    expect(fran.sessions.map((x) => x.value)).toEqual([456]);
  });

  it("SES-07 RX and Scaled are separate subjects", () => {
    const rows = [
      workoutRow({ date: "01/10/2025", title: "FRAN", best_result_raw: "456", rx_or_scaled: "RX" }),
      workoutRow({ date: "02/10/2025", title: "FRAN", best_result_raw: "400", rx_or_scaled: "SCALED" }),
    ];
    expect(buildProgressSubjects(rows).subjects.map((x) => x.key).sort()).toEqual(["fran|RX", "fran|SCALED"]);
  });

  it("VRD-14 ignores SugarWOD's PR flag", () => {
    const base = [entry("2025-01-10", "Deadlift", 195), entry("2025-02-07", "Deadlift", 188), entry("2025-03-07", "Deadlift", 190), entry("2025-04-04", "Deadlift", 202), entry("2025-05-02", "Deadlift", 204), entry("2025-06-06", "Deadlift", 206)];
    const flagged = base.map((r) => ({ ...r, pr: "PR" }));
    const a = buildProgressSubjects(base).subjects[0] as ProgressSubject;
    const b = buildProgressSubjects(flagged).subjects[0] as ProgressSubject;
    expect(progressVerdict(b.sessions, false, "lift")).toEqual(progressVerdict(a.sessions, false, "lift"));
  });
});

describe("the verdict (A1-VRD)", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAway(4.95, 1)).toBe(5);
    expect(roundHalfAway(-4.95, 1)).toBe(-5);
  });

  it("VRD-01 gives no verdict with fewer than 6 sessions", () => {
    expect(progressVerdict(VRD05.slice(0, 5), false, "lift")).toBeNull();
  });

  it("VRD-02 sizes the window from the session count", () => {
    const v = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    const six = lift(...monthly(v.slice(0, 6)));
    expect(six).toMatchObject({ window: 3, previousBest: { value: 102 }, recentBest: { value: 105 } });
    const seven = lift(...monthly(v.slice(0, 7)));
    expect(seven).toMatchObject({ window: 3, previousBest: { value: 103 }, recentBest: { value: 106 } });
    const ten = lift(...monthly(v));
    expect(ten).toMatchObject({ window: 4, previousBest: { value: 105 }, recentBest: { value: 109, date: "2025-10-10" }, change: 3.8, record: true, state: "up" });
  });

  it("VRD-03 is up by the window alone when an older peak blocks the record", () => {
    const base = [s("2024-01-10", 230), s("2024-04-10", 190), s("2024-07-10", 195), s("2024-10-10", 200), s("2025-01-10", 192), s("2025-04-10", 205), s("2025-07-10", 208), s("2025-10-10", 210), s("2026-01-10", 207)];
    expect(lift(...base)).toMatchObject({ window: 4, previousBest: { value: 200 }, recentBest: { value: 210 }, change: 5, record: false, state: "up" });
  });

  it("VRD-04 compares the rounded percentage", () => {
    const base = (best: number) => [s("2024-01-10", 230), s("2024-04-10", 190), s("2024-07-10", 195), s("2024-10-10", 200), s("2025-01-10", 192), s("2025-04-10", 205), s("2025-07-10", 208), s("2025-10-10", best), s("2026-01-10", 207)];
    expect(lift(...base(209.8))?.state).toBe("no-clear-change");
    expect(lift(...base(209.9))?.state).toBe("up");
  });

  it("VRD-05 is up by a record under 5%", () => {
    expect(lift(...VRD05)).toMatchObject({ window: 4, previousBest: { value: 195 }, recentBest: { value: 200, date: "2025-07-11" }, change: 2.6, record: true, state: "up" });
  });

  it("VRD-06 needs a record margin of 2%", () => {
    const withLast = (v: number) => [...VRD05.slice(0, 9), s("2025-07-11", v, true)];
    expect(lift(...withLast(198.9))?.state).toBe("up");
    expect(lift(...withLast(198.8))?.state).toBe("no-clear-change");
    expect(lift(...withLast(198))?.state).toBe("no-clear-change");
  });

  it("VRD-07 a build cycle is not a decline", () => {
    expect(lift(...VRD05.slice(0, 9))).toMatchObject({ window: 4, previousBest: { value: 195 }, recentBest: { value: 160 }, change: -17.9, record: false, state: "not-tested-since" });
  });

  it("VRD-08 a failed test is a decline", () => {
    expect(lift(...VRD05.slice(0, 8), s("2025-05-02", 175, true))).toMatchObject({ change: -10.3, state: "down" });
  });

  it("VRD-09 one max effort anywhere in the recent window is enough", () => {
    const marked = [...VRD05.slice(0, 5), s("2025-02-07", 150, true), ...VRD05.slice(6, 9)];
    expect(lift(...marked)?.state).toBe("down");
  });

  it("VRD-10 a light day does not matter", () => {
    const v = [s("2025-01-10", 200), s("2025-02-07", 196), s("2025-03-07", 198), s("2025-04-04", 199), s("2025-05-02", 200), s("2025-06-06", 170), s("2025-07-04", 199), s("2025-08-01", 201)];
    expect(lift(...v)).toMatchObject({ window: 4, previousBest: { value: 200 }, recentBest: { value: 201 }, change: 0.5, state: "no-clear-change" });
  });

  it("VRD-11 noise stays noise at 6, 7 and 8 sessions", () => {
    const alt = [188, 212, 188, 212, 188, 212, 188, 212];
    for (const n of [6, 7, 8]) expect(lift(...monthly(alt.slice(0, n)))).toMatchObject({ previousBest: { value: 212 }, recentBest: { value: 212 }, change: 0, record: false, state: "no-clear-change" });
  });

  it("VRD-12 a time benchmark is down, never not tested since", () => {
    const nancy = [s("2023-01-04", 884, true), s("2023-04-05", 878, true), s("2023-06-26", 866, true), s("2024-11-12", 827, true), s("2025-04-28", 877, true), s("2025-09-22", 956, true), s("2026-04-13", 899, true)];
    expect(progressVerdict(nancy, true, "benchmark")).toMatchObject({ window: 3, previousBest: { value: 827 }, recentBest: { value: 877 }, change: -6, state: "down" });
  });

  it("VRD-13 a faster benchmark is up", () => {
    const v = [s("2025-01-10", 840, true), s("2025-02-07", 830, true), s("2025-03-07", 800, true), s("2025-04-04", 760, true), s("2025-05-02", 740, true), s("2025-06-06", 720, true)];
    expect(progressVerdict(v, true, "benchmark")).toMatchObject({ change: 10, state: "up" });
  });

  it("VRD-16 the margin has no same-scheme exception", () => {
    const triples = [190, 192, 195, 196, 197, 198].map((load, i) => s(`2025-0${i + 1}-10`, estimateOneRepMax(load, 3)));
    expect(lift(...triples)).toMatchObject({ window: 3, change: 1.5, record: false, state: "no-clear-change" });
  });

  it("VRD-17 a slow steady climb reads up", () => {
    const v = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map((x, i) => s(`2025-${String(i + 1).padStart(2, "0")}-10`, x));
    expect(lift(...v)).toMatchObject({ window: 4, previousBest: { value: 107 }, recentBest: { value: 111 }, change: 3.7, record: true, state: "up" });
  });

  it("VRD-18 a very slow climb stays unclear", () => {
    const v = Array.from({ length: 12 }, (_, m) => s(`2025-${String(m + 1).padStart(2, "0")}-10`, 100 * 1.0025 ** m));
    expect(lift(...v)).toMatchObject({ change: 1, record: false, state: "no-clear-change" });
  });

  it("VRD-19 the record is the recent best", () => {
    const v = [s("2025-01-10", 100), s("2025-02-07", 102), s("2025-03-07", 104), s("2025-04-04", 108), s("2025-05-02", 110), s("2025-06-06", 112)];
    expect(lift(...v)).toMatchObject({ window: 3, change: 7.7, record: true, recentBest: { value: 112, date: "2025-06-06" }, state: "up" });
  });

  it("VRD-20 an older peak blocks the record", () => {
    const fs = [s("2023-07-07", 205), s("2024-03-11", 166), s("2024-03-18", 161), s("2024-04-08", 184), s("2025-03-31", 178), s("2026-02-03", 189), s("2026-03-30", 200), s("2026-04-07", 178), s("2026-08-07", 194)];
    expect(lift(...fs)).toMatchObject({ change: 8.7, record: false, state: "up" });
    expect(lift(...fs.slice(1))).toMatchObject({ record: true, recentBest: { value: 200, date: "2026-03-30" } });
  });
});

describe("Scaled to RX and recency (A1-SCL, A1-REC)", () => {
  const fran = (rxDate = "2025-12-08") => [
    subject({ name: "Fran", status: "SCALED", kind: "benchmark", lowerIsBetter: true, sessions: [s("2023-01-16", 456, true), s("2023-04-11", 392, true), s("2025-05-19", 457, true)] }),
    subject({ name: "Fran", status: "RX", kind: "benchmark", lowerIsBetter: true, sessions: [s(rxDate, 553, true)] }),
  ];

  it("SCL-02 a move up to RX is an up vote with no percentage, although slower", () => {
    const { rows, headline } = classifySubjects(fran(), "2026-09-11");
    const rx = rows.find((r) => r.subject.status === "RX");
    expect(rx).toMatchObject({ group: "up", verdict: null, moveUpVotes: true, moveUp: { date: "2025-12-08", scaledBefore: 3 } });
    expect(headline.moveUps).toBe(1);
    expect(rows.find((r) => r.subject.status === "SCALED")?.group).toBe("not-recent");
  });

  it("SCL-03 the vote lasts 12 months", () => {
    const later = classifySubjects(fran(), "2027-01-01").rows.find((r) => r.subject.status === "RX");
    expect(later?.moveUp?.date).toBe("2025-12-08");
    expect(later?.moveUpVotes).toBe(false);
  });

  it("SCL-04 only the first RX session after Scaled is a move", () => {
    const grace = [
      subject({ name: "Grace", status: "SCALED", kind: "benchmark", lowerIsBetter: true, sessions: [s("2022-11-21", 225, true), s("2023-10-10", 225, true)] }),
      subject({ name: "Grace", status: "RX", kind: "benchmark", lowerIsBetter: true, sessions: [s("2026-03-31", 291, true), s("2026-07-07", 272, true)] }),
    ];
    expect(findMoveUps(grace).get("grace|RX")).toEqual({ date: "2026-03-31", scaledBefore: 2 });
  });

  it("SCL-06 moving down to Scaled votes nothing", () => {
    const cindy = [
      subject({ name: "Cindy", status: "RX", kind: "benchmark", sessions: [s("2023-05-02", 16, true), s("2025-01-11", 16.015, true)] }),
      subject({ name: "Cindy", status: "SCALED", kind: "benchmark", sessions: [s("2026-04-17", 12.019, true)] }),
    ];
    expect(findMoveUps(cindy).size).toBe(0);
  });

  it("SCL-07 the same day is no move", () => {
    const f = fran("2025-05-19");
    expect(findMoveUps(f).size).toBe(0);
  });

  it("SCL-08 lifts follow the same rule, and an older move casts no vote", () => {
    const bs = [
      subject({ name: "Back Squat", status: "RX", sessions: [s("2023-07-24", 213), s("2023-08-07", 225)] }),
      subject({ name: "Back Squat", status: "SCALED", sessions: [s("2023-07-31", 145)] }),
    ];
    const { rows } = classifySubjects(bs, "2026-09-11");
    expect(rows.find((r) => r.subject.status === "RX")).toMatchObject({ moveUp: { date: "2023-08-07" }, moveUpVotes: false });
  });

  it("REC-02 recent is 365 days or fewer", () => {
    const six = (last: string) => subject({ name: "Deadlift", status: "RX", sessions: [s("2025-01-10", 100), s("2025-02-10", 101), s("2025-03-10", 102), s("2025-04-10", 103), s("2025-05-10", 104), s(last, 105)] });
    expect(classifySubjects([six("2025-09-11")], "2026-09-11").rows[0]?.group).not.toBe("not-recent");
    expect(classifySubjects([six("2025-09-10")], "2026-09-11").rows[0]?.group).toBe("not-recent");
  });

  it("REC-01 and REC-06 are deterministic and ignore future dates", () => {
    const subjects = [subject({ name: "Deadlift", status: "RX", sessions: [s("2025-01-10", 100), s("2025-02-10", 101), s("2025-03-10", 102), s("2025-04-10", 103), s("2025-05-10", 104), s("2025-06-10", 105), s("2027-01-01", 200)] })];
    const a = classifySubjects(subjects, "2026-09-11");
    expect(classifySubjects(subjects, "2026-09-11")).toEqual(a);
    expect(a.rows[0]?.verdict?.n).toBe(6);
  });
});

describe("the headline (A1-HDL)", () => {
  it("HDL-01 labels by counts", () => {
    const cases: [number, number, number, string | null][] = [
      [3, 1, 3, "Improving"], [2, 0, 5, "Steady"], [1, 0, 2, "Improving"], [1, 0, 3, "Steady"], [5, 1, 0, "Improving"],
      [0, 2, 5, "Steady"], [1, 4, 1, "Declining"], [1, 3, 0, "Declining"], [3, 3, 3, "Steady"], [6, 1, 5, "Improving"], [1, 0, 1, null],
    ];
    for (const [up, down, nc, want] of cases) expect(labelOf(up, down, up + down + nc), `${up}/${nc}/${down}`).toBe(want);
  });

  it("HDL-02 and HDL-03 write the counts sentence", () => {
    expect(headlineSentence("Improving", 8, 1, 5)).toBe("Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down).");
    expect(headlineSentence("Improving", 5, 1, 0)).toBe("Improving in 5 of 6 lifts and benchmarks (1 down).");
    expect(headlineSentence("Improving", 4, 0, 0)).toBe("Improving in 4 of 4 lifts and benchmarks.");
    expect(headlineSentence("Declining", 1, 4, 4)).toBe("Declining in 4 of 9 lifts and benchmarks (4 no clear change, 1 up).");
    expect(headlineSentence("Steady", 2, 0, 5)).toBe("Steady across 7 lifts and benchmarks (2 up, 5 no clear change).");
    expect(headlineSentence("Steady", 3, 2, 6)).toBe("Steady across 11 lifts and benchmarks (3 up, 6 no clear change, 2 down).");
  });

  const eligible = (name: string, ...tail: ProgressSession[]) =>
    subject({ name, status: "RX", sessions: [s("2026-01-10", 100), s("2026-02-10", 100), s("2026-03-10", 100), s("2026-04-10", 100), s("2026-05-10", 100), ...tail] });

  it("HDL-07 left-out reasons are exclusive, in order", () => {
    const stale = subject({ name: "Push Jerk", status: "RX", sessions: [s("2024-01-10", 100), s("2024-02-10", 100), s("2024-03-10", 100), s("2024-04-10", 100)] });
    const { headline } = classifySubjects([stale], "2026-09-11");
    expect(headline.leftOut).toEqual({ under6: 1, notRecent: 0, notTested: 0 });
  });

  it("HDL-08 not tested since is left out of the counts", () => {
    const cycle = subject({ name: "Deadlift", status: "RX", sessions: VRD05.slice(0, 9) });
    const { headline, rows } = classifySubjects([cycle], "2025-06-01");
    expect(rows[0]?.group).toBe("not-tested-since");
    expect(headline).toMatchObject({ counted: 0, up: 0, down: 0, leftOut: { notTested: 1 } });
  });

  it("HDL-09 a move up counts as one up vote and as counted", () => {
    const subjects = [
      eligible("Back Squat", s("2026-06-10", 101)),
      ...[
        subject({ name: "Fran", status: "SCALED", kind: "benchmark", lowerIsBetter: true, sessions: [s("2025-05-19", 457, true)] }),
        subject({ name: "Fran", status: "RX", kind: "benchmark", lowerIsBetter: true, sessions: [s("2026-05-01", 553, true)] }),
      ],
    ];
    const { headline } = classifySubjects(subjects, "2026-09-11");
    expect(headline).toMatchObject({ up: 1, moveUps: 1, counted: 2 });
  });

  it("HDL-12 closest skips not-recent subjects and ties go to the more recently logged", () => {
    const stale = subject({ name: "Push Jerk", status: "RX", sessions: [s("2025-01-10", 1), s("2025-02-10", 1), s("2025-03-10", 1), s("2025-04-10", 1), s("2025-08-01", 1)] });
    const older = subject({ name: "Hang Power Clean", status: "RX", sessions: [s("2026-01-10", 1), s("2026-02-10", 1), s("2026-03-10", 1), s("2026-04-10", 1), s("2026-05-10", 1)] });
    const newer = subject({ name: "Overhead Squat", status: "RX", sessions: [s("2026-01-10", 1), s("2026-02-10", 1), s("2026-03-10", 1), s("2026-04-10", 1), s("2026-08-03", 1)] });
    const { headline } = classifySubjects([stale, older, newer], "2026-09-11");
    expect(headline.closest.map((c) => c.subject.name)).toEqual(["Overhead Squat", "Hang Power Clean"]);
    expect(headline.label).toBeNull();
  });
});

describe("the bundled sample, as of 2026-09-11 (A1-HDL-04, A1-HDL-13)", async () => {
  const rows = await loadSampleRows();
  const { subjects, unused } = buildProgressSubjects(rows);
  const { rows: classified, headline } = classifySubjects(subjects, "2026-09-11");

  it("builds the same lift entries as the app's buildLiftSubjects", () => {
    const dated = rows.flatMap((raw) => {
      const date = parseWorkoutDate(raw.date);
      return date.isValid() ? [{ date, raw }] : [];
    });
    const app = buildLiftSubjects(dated, { maxReps: 8 });
    const mine = subjects.filter((x) => x.kind === "lift");
    expect(mine).toHaveLength(app.length);
    for (const c of app) {
      const key = `${c.subject.name.trim().toLowerCase().replace(/s$/, "")}|${c.subject.status}`;
      const found = mine.find((x) => x.key === key);
      expect(found, key).toBeDefined();
      expect((found?.entries ?? []).map((e) => `${e.date}:${e.value.toFixed(6)}`).sort(), key).toEqual(c.entries.map((e) => `${e.date.format("YYYY-MM-DD")}:${e.value.toFixed(6)}`).sort());
    }
  });

  it("finds 45 subjects in groups of 8 up, 1 down, 5 no clear change, 11 fewer than 6 sessions and 20 not recent", () => {
    expect(subjects).toHaveLength(45);
    const count = (g: string): number => classified.filter((r) => r.group === g).length;
    expect({ up: count("up"), down: count("down"), nts: count("not-tested-since"), nc: count("no-clear-change"), few: count("few"), notRecent: count("not-recent") }).toEqual({ up: 8, down: 1, nts: 0, nc: 5, few: 11, notRecent: 20 });
  });

  it("reads Improving in 8 of 14, includes 2 move-ups, leaves out 31 and notes 2 long gaps", () => {
    expect(headline.label).toBe("Improving");
    expect(headlineSentence("Improving", headline.up, headline.down, headline.noClearChange)).toBe("Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down).");
    expect(headline.moveUps).toBe(2);
    expect(headline.leftOut.under6).toBe(31);
    expect(headline.longGaps).toBe(2);
  });

  it("accounts for the 272 of 526 unused weight entries: 210 no readable scheme, 15 outside 1 to 8 reps, 47 no lift named", () => {
    expect(unused.loadRows).toBe(526);
    expect(unused.loadRows - unused.used).toBe(272);
    expect({ noScheme: unused.noScheme, outsideRange: unused.outsideRange, noLiftNamed: unused.noLiftNamed }).toEqual({ noScheme: 210, outsideRange: 15, noLiftNamed: 47 });
  });

  it("reads 89 of 246 lift sessions as max efforts", () => {
    const lifts = subjects.filter((x) => x.kind === "lift");
    expect(lifts.reduce((n, x) => n + x.sessions.length, 0)).toBe(246);
    expect(lifts.reduce((n, x) => n + x.sessions.filter((e) => e.maxEffort).length, 0)).toBe(89);
  });

  it("A1-REC-04: as of 2027-04-30 three subjects are not recent, the move-ups have lapsed and the headline reads 4 up of 9", () => {
    const later = classifySubjects(subjects, "2027-04-30");
    expect(later.headline).toMatchObject({ up: 4, noClearChange: 5, down: 0, moveUps: 0, label: "Improving" });
  });
});
