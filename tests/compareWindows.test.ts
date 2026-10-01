import { describe, expect, it } from "vitest";
import { compareWindows, defaultWindowA, windowAIsContiguous, windowsToExperimentFields } from "@/lib/analytics/compareWindows";
import { NO_NOISE_BANDS } from "@/lib/analytics/bodyCompNoise";
import type { ContextTag } from "@/types/tag";
import { liftRow, scanRow, workoutRow } from "./fixtures/rows";

const A = { start: "2026-01-01", end: "2026-01-31" };
const B = { start: "2026-02-01", end: "2026-02-28" };
const opts = { noiseBands: NO_NOISE_BANDS };

/** MM/DD/YYYY */
const md = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

const lifts = [
  liftRow(md("2026-01-05"), "Back Squat", 200),
  liftRow(md("2026-01-20"), "Back Squat", 210),
  liftRow(md("2026-02-05"), "Back Squat", 220),
  liftRow(md("2026-02-20"), "Back Squat", 230),
];
const scans = [
  scanRow("2026-01-10", { "Weight(lb)": "180", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "25", "Percent Body Fat(%)": "14" }),
  scanRow("2026-02-10", { "Weight(lb)": "181", "Soft Lean Mass(lb)": "142", "Body Fat Mass(lb)": "24", "Percent Body Fat(%)": "13.3" }),
];

describe("defaultWindowA", () => {
  it("is the equal-length window immediately before B", () => {
    expect(defaultWindowA(B)).toEqual({ start: "2026-01-04", end: "2026-01-31" });
    expect(defaultWindowA({ start: "2026-03-10", end: "2026-03-10" })).toEqual({ start: "2026-03-09", end: "2026-03-09" });
  });
});

describe("compareWindows — performance", () => {
  it("compares window means and reports the change", () => {
    const r = compareWindows(lifts, scans, A, B, opts);
    const squat = r.performance.find((p) => p.metric === "Back Squat (RX)")!;
    expect(r.status).toBe("ok");
    expect(squat.comparable).toBe(true);
    expect(squat.before).toBe(205);
    expect(squat.after).toBe(225);
    expect(squat.delta).toBe(20);
    expect(squat.direction).toBe("up");
    expect(squat.observations).toEqual({ before: 2, after: 2 });
  });

  it("gives a thin subject no numbers at all, only the reason", () => {
    const rows = [...lifts, liftRow(md("2026-01-06"), "Deadlift", 300), liftRow(md("2026-02-06"), "Deadlift", 320)];
    const dl = compareWindows(rows, scans, A, B, opts).performance.find((p) => p.metric === "Deadlift (RX)")!;
    expect(dl.comparable).toBe(false);
    expect([dl.before, dl.after, dl.delta, dl.pctChange, dl.direction]).toEqual([null, null, null, null, null]);
    expect(dl.reason).toMatch(/window A needs 1 more logged entry \(has 1, needs 2\)/);
  });

  it("keeps RX and Scaled apart", () => {
    const rows = [...lifts, liftRow(md("2026-01-08"), "Back Squat", 100, { rx_or_scaled: "SCALED" }), liftRow(md("2026-02-08"), "Back Squat", 150, { rx_or_scaled: "SCALED" })];
    const r = compareWindows(rows, scans, A, B, opts);
    expect(r.performance.find((p) => p.metric === "Back Squat (RX)")!.after).toBe(225);
    expect(r.performance.find((p) => p.metric === "Back Squat (SCALED)")!.comparable).toBe(false);
  });

  it("reads a lower time as better for a time-scored benchmark", () => {
    const fran = (iso: string, secs: number) => workoutRow({ date: md(iso), title: "FRAN", score_type: "Time", best_result_raw: String(secs) });
    const rows = [fran("2026-01-05", 300), fran("2026-01-20", 290), fran("2026-02-05", 250), fran("2026-02-20", 240)];
    const p = compareWindows(rows, scans, A, B, opts).performance.find((x) => x.metric === "Fran (RX)")!;
    expect(p.delta).toBeLessThan(0);
    expect(p.direction).toBe("up");
  });

  it("calls a change under the trend threshold flat", () => {
    const rows = [liftRow(md("2026-01-05"), "Back Squat", 200), liftRow(md("2026-01-20"), "Back Squat", 200), liftRow(md("2026-02-05"), "Back Squat", 201), liftRow(md("2026-02-20"), "Back Squat", 201)];
    expect(compareWindows(rows, scans, A, B, opts).performance[0]!.direction).toBe("flat");
  });
});

describe("compareWindows — body composition", () => {
  it("marks a change meaningful only when it exceeds the noise band", () => {
    const r = compareWindows(lifts, scans, A, B, opts);
    // NO_NOISE_BANDS: anything non-zero is meaningful.
    expect(r.bodyComp.find((m) => m.metric === "leanMass")).toMatchObject({ before: 140, after: 142, delta: 2, meaningful: true });
    // Default band for a two-scan history is 3 lb: the same +2 lb is inside it.
    const banded = compareWindows(lifts, scans, A, B);
    const lean = banded.bodyComp.find((m) => m.metric === "leanMass")!;
    expect(lean.delta).toBe(2);
    expect(lean.band).toBe(3);
    expect(lean.meaningful).toBe(false);
  });

  it("uses no numbers and says why when a window has no scan", () => {
    const r = compareWindows(lifts, [scans[0]!], A, B, opts);
    const w = r.bodyComp.find((m) => m.metric === "weight")!;
    expect(w.delta).toBeNull();
    expect(w.before).toBeNull();
    expect(w.meaningful).toBe(false);
    expect(w.reason).toMatch(/window B needs 1 more InBody scan/);
    // Performance still compares, and the missing scans are called out.
    expect(r.status).toBe("ok");
    expect(r.caveats.join(" ")).toMatch(/No body-composition measurement is available in both windows/);
  });

  it("averages several scans in a window", () => {
    const more = [...scans, scanRow("2026-01-25", { "Weight(lb)": "182" })];
    expect(compareWindows(lifts, more, A, B, opts).bodyComp.find((m) => m.metric === "weight")!.before).toBe(181);
  });
});

describe("compareWindows — eligibility and caveats", () => {
  it("is insufficient with a reason, and no partial numbers, when nothing can be compared", () => {
    const r = compareWindows([], [], A, B, opts);
    expect(r.status).toBe("insufficient");
    expect(r.reason).toMatch(/^Nothing to compare: no lift or benchmark was logged in either window/);
    expect(r.performance).toEqual([]);
  });

  it("rejects overlapping, inverted and unparseable windows", () => {
    expect(compareWindows(lifts, scans, A, { start: "2026-01-15", end: "2026-02-15" }, opts).reason).toMatch(/overlap/);
    expect(compareWindows(lifts, scans, { start: "2026-01-31", end: "2026-01-01" }, B, opts).reason).toMatch(/Window A ends before it starts/);
    expect(compareWindows(lifts, scans, A, { start: "", end: "" }, opts).reason).toMatch(/Window B needs a start and an end/);
  });

  it("calls out windows of quite different length", () => {
    const r = compareWindows(lifts, scans, { start: "2026-01-09", end: "2026-01-15" }, B, opts);
    expect(r.caveats.join(" ")).toMatch(/different lengths \(7 and 28 days\)/);
  });

  it("names overlapping tags in the caveats, whatever their type, and changes no number", () => {
    const tags: ContextTag[] = [
      { id: "t1", type: "travel", label: "Lisbon", startDate: "2026-02-10", endDate: "2026-02-14" },
      { id: "t2", type: "cut", startDate: "2026-01-15", endDate: null },
      { id: "t3", type: "injury", startDate: "2025-01-01", endDate: "2025-02-01" },
    ];
    const without = compareWindows(lifts, scans, A, B, opts);
    const withTags = compareWindows(lifts, scans, A, B, { ...opts, tags: tags });
    expect(withTags.performance).toEqual(without.performance);
    expect(withTags.bodyComp).toEqual(without.bodyComp);
    const text = withTags.caveats.join("\n");
    expect(text).toMatch(/Window B overlaps "Lisbon" \(travel/);
    expect(text).toMatch(/Window A overlaps cut period/);
    expect(text).toMatch(/Window B overlaps cut period/);
    expect(text).not.toMatch(/injury/);
  });

  it("gives an identical result with no tags and with an empty tag list", () => {
    expect(compareWindows(lifts, scans, A, B, { ...opts, tags: [] })).toEqual(compareWindows(lifts, scans, A, B, opts));
  });
});

describe("windowsToExperimentFields", () => {
  it("maps window B onto date and endDate, and window A's start onto baselineStart", () => {
    expect(windowsToExperimentFields(defaultWindowA(B), B)).toEqual({
      date: "2026-02-01",
      endDate: "2026-02-28",
      baselineStart: "2026-01-04",
    });
  });

  it("knows whether the saved experiment reproduces window A exactly", () => {
    expect(windowAIsContiguous(defaultWindowA(B), B)).toBe(true);
    expect(windowAIsContiguous({ start: "2026-01-01", end: "2026-01-20" }, B)).toBe(false);
  });
});
