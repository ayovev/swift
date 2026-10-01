import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { customCycle, findFocusLifts, getCycleReport, getCycles } from "@/lib/analytics/cycleReport";
import { NO_NOISE_BANDS } from "@/lib/analytics/bodyCompNoise";
import type { ContextTag } from "@/types/tag";
import { liftRow, scanRow, workoutRow } from "./fixtures/rows";

const AS_OF = new Date("2026-09-01");
const md = (iso: string) => dayjs(iso).format("MM/DD/YYYY");
const day = (offset: number) => dayjs("2026-03-01").add(offset, "day").format("YYYY-MM-DD");

/** Six weekly squat sessions, and one weekly deadlift, across Mar 1 - Apr 12. */
const squat = [200, 205, 212, 218, 224, 230].map((v, i) => liftRow(md(day(i * 7)), "Back Squat", v));
const dead = [300, 305, 310].map((v, i) => liftRow(md(day(i * 14)), "Deadlift", v));
const filler = [2, 9, 16].map((o) => workoutRow({ date: md(day(o)), title: "FRAN", score_type: "Time", best_result_raw: "300" }));
const workouts = [...squat, ...dead, ...filler];

const scans = [
  scanRow(day(1), { "Weight(lb)": "190", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "30", "Percent Body Fat(%)": "15.8" }),
  scanRow(day(20), { "Weight(lb)": "187", "Soft Lean Mass(lb)": "140.2", "Body Fat Mass(lb)": "27", "Percent Body Fat(%)": "14.4" }),
  scanRow(day(40), { "Weight(lb)": "184", "Soft Lean Mass(lb)": "140.5", "Body Fat Mass(lb)": "24", "Percent Body Fat(%)": "13" }),
];

const cutTag: ContextTag = { id: "cut", type: "cut", label: "Spring cut", startDate: day(0), endDate: day(42) };
const cycle = getCycles(workouts, [cutTag], { asOfDate: AS_OF })[0]!;

describe("getCycles", () => {
  it("makes a user cycle from each bulk, cut, maintain or other tag, oldest first", () => {
    const tags: ContextTag[] = [
      { id: "b", type: "bulk", label: "Bulk", startDate: "2026-06-01", endDate: "2026-07-01" },
      cutTag,
      { id: "i", type: "injury", startDate: day(10), endDate: day(20) },
      { id: "t", type: "travel", startDate: day(10), endDate: day(20) },
    ];
    const cycles = getCycles(workouts, tags, { asOfDate: AS_OF });
    expect(cycles.map((c) => c.label)).toEqual(["Spring cut", "Bulk"]);
    expect(cycles.every((c) => c.source === "user")).toBe(true);
    expect(cycles[0]).toMatchObject({ start: day(0), end: day(42), tagId: "cut" });
  });

  it("makes a cycle from every kind of period in something you changed, and none from something that happened", () => {
    const at = (id: string, type: ContextTag["type"], offset: number): ContextTag => ({
      id,
      type,
      label: id,
      startDate: day(offset),
      endDate: day(offset + 20),
    });
    const kinds = ["experiment", "nutrition", "cut", "bulk", "maintain", "programming", "cycle", "deload", "recovery", "other"] as const;
    const changed = kinds.map((type, i) => at(type, type, i * 30));
    const cycles = getCycles(workouts, [...changed, at("hurt", "injury", 400), at("away", "travel", 450)], { asOfDate: AS_OF });
    expect(cycles.map((c) => c.label)).toEqual([...kinds]);
  });

  it("runs an open-ended tag to the as-of date and skips one that would end before it starts", () => {
    const open: ContextTag = { id: "o", type: "maintain", startDate: "2026-08-01", endDate: null };
    const bad: ContextTag = { id: "x", type: "cut", startDate: "2026-08-10", endDate: "2026-08-01" };
    const cycles = getCycles(workouts, [open, bad], { asOfDate: AS_OF });
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.end).toBe("2026-09-01");
    expect(cycles[0]!.label).toBe("maintain");
  });

  it("returns nothing with no tags", () => {
    expect(getCycles(workouts, [], { asOfDate: AS_OF })).toEqual([]);
  });
});

describe("findFocusLifts", () => {
  it("names the lifts with the largest shares of lift sessions, biggest first", () => {
    expect(findFocusLifts(workouts, day(0), day(42))).toEqual(["Back Squat", "Deadlift"]);
  });
  it("drops lifts under the minimum share and returns [] with no lifts", () => {
    const many = [...squat, ...squat, liftRow(md(day(1)), "Snatch", 100)];
    expect(findFocusLifts(many, day(0), day(42))).toEqual(["Back Squat"]);
    expect(findFocusLifts(filler, day(0), day(42))).toEqual([]);
  });
});

describe("getCycleReport", () => {
  it("reports volume, lift changes from relative strength, and body-comp changes gated by the noise band", () => {
    const r = getCycleReport(cycle, workouts, scans);
    expect(r.status).toBe("ok");
    expect(r.days).toBe(43);
    expect(r.sessionsPerWeek).toBeCloseTo(12 / (43 / 7), 5);
    const bs = r.e1rmChanges.find((c) => c.lift === "Back Squat")!;
    expect(bs).toMatchObject({ focus: true, sessions: 6, startE1rm: 200, endE1rm: 230 });
    expect(bs.pctChange).toBeCloseTo(0.15, 5);
    // The attribution is Phase 2's, not recomputed here.
    expect(bs.attribution).toBe("strength-driven");
    const fat = r.bodyCompChanges.find((c) => c.metric === "fatMass")!;
    expect(fat).toMatchObject({ start: 30, end: 24, delta: -6, meaningful: true });
  });

  it("with zero-width bands, treats a small lean gain as growth and attributes part of the lift to it", () => {
    const r = getCycleReport(cycle, workouts, scans, { noiseBands: NO_NOISE_BANDS });
    expect(r.e1rmChanges.find((c) => c.lift === "Back Squat")!.attribution).toBe("mixed");
  });

  it("marks a body change inside the noise band as within normal scan variation, and does not call it a change", () => {
    const r = getCycleReport(cycle, workouts, scans);
    const lean = r.bodyCompChanges.find((c) => c.metric === "leanMass")!;
    expect(lean.delta).toBeCloseTo(0.5, 5);
    expect(lean.meaningful).toBe(false);
    expect(r.summary).toMatch(/Lean mass change is within normal scan variation/);
    expect(r.summary).toMatch(/Fat mass down 6\.0 lb/);
    expect(r.summary).not.toMatch(/Lean mass (up|down)/);
  });

  it("writes a summary that describes and does not judge", () => {
    const r = getCycleReport(cycle, workouts, scans);
    expect(r.summary).toMatch(/^Spring cut, Mar 1, 2026 to Apr 12, 2026 \(43 days\): 2\.0 logged workouts a week\./);
    expect(r.summary).toMatch(/Back Squat estimated 1RM rose 15% \(200 to 230\), not explained by body mass/);
    expect(r.summary).not.toMatch(/!|great|good|bad|well done|crush/i);
  });

  it("still reports lifts, and says why body comp is missing, when the cycle has too few scans", () => {
    const r = getCycleReport(cycle, workouts, [scans[0]!]);
    expect(r.status).toBe("ok");
    expect(r.bodyCompChanges).toEqual([]);
    expect(r.bodyCompReason).toMatch(/needs 1 more InBody scan inside this cycle \(has 1, needs 2\)/);
    expect(r.summary).toMatch(/No body composition change to report: needs 1 more InBody scan/);
    expect(r.e1rmChanges.length).toBeGreaterThan(0);
  });

  it("omits lifts with too few sessions in the cycle", () => {
    const r = getCycleReport(cycle, workouts, scans);
    expect(r.e1rmChanges.every((c) => c.sessions >= 3)).toBe(true);
    const twoLifts = getCycleReport(cycle, [...squat, ...filler, ...dead.slice(0, 2)], scans);
    expect(twoLifts.e1rmChanges.map((c) => c.lift)).toEqual(["Back Squat"]);
  });

  it("is insufficient, with the reason, for a cycle that is too short, inverted, empty or undated", () => {
    expect(getCycleReport(customCycle(workouts, day(0), day(6)), workouts, scans).reason).toBe("needs 7 more days in this cycle (has 7, needs 14)".replace("needs 7 more days", "needs 7 more days"));
    expect(getCycleReport(customCycle(workouts, day(10), day(0)), workouts, scans).reason).toMatch(/ends before it starts/);
    expect(getCycleReport(customCycle(workouts, "", ""), workouts, scans).reason).toMatch(/needs a start and an end/);
    expect(getCycleReport(customCycle(workouts, "2020-01-01", "2020-03-01"), workouts, scans).reason).toMatch(/No workouts were logged/);
    expect(getCycleReport(customCycle(workouts, day(0), day(6)), workouts, scans).e1rmChanges).toEqual([]);
  });

  it("names an injury or travel tag inside the cycle, and changes nothing else", () => {
    const tags: ContextTag[] = [
      { id: "i", type: "injury", label: "Wrist", startDate: day(10), endDate: day(20) },
      { id: "t", type: "travel", label: "Lisbon", startDate: "2025-01-01", endDate: "2025-01-05" },
      cutTag,
    ];
    const plain = getCycleReport(cycle, workouts, scans);
    const tagged = getCycleReport(cycle, workouts, scans, { tags });
    const { tagNotes, ...rest } = tagged;
    expect(rest).toEqual(plain);
    expect(tagNotes).toHaveLength(1);
    expect(tagNotes![0]).toMatch(/overlaps "Wrist" \(injury/);
    expect(plain.tagNotes).toBeUndefined();
  });

  it("works for a custom range with no tag", () => {
    const r = getCycleReport(customCycle(workouts, day(0), day(42)), workouts, scans);
    expect(r.status).toBe("ok");
    expect(r.cycle.label).toBe("Custom range");
    expect(r.cycle.focusLifts).toEqual(["Back Squat", "Deadlift"]);
  });
});
