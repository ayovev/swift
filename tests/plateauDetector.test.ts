import { describe, expect, it } from "vitest";
import { getPlateauInsights } from "@/lib/analytics/plateauDetector";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { PlateauInsight } from "@/types/plateau";
import { loadSampleRows } from "./fixtures/sampleRows";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";

function row(overrides: Partial<SugarWodRow> & { date: string; title: string }): SugarWodRow {
  return {
    description: "",
    best_result_raw: "",
    best_result_display: "",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
    ...overrides,
  };
}

function inbodyRow(overrides: Partial<InBodyRow> & { date: string }): InBodyRow {
  return {
    "Weight(lb)": "-",
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
    ...overrides,
  };
}

/** Past the last date in both the real sample export and the InBody fixture. */
const AS_OF = new Date("2027-01-01");

function find(insights: PlateauInsight[], name: string, status: "RX" | "SCALED") {
  return insights.find((i) => i.subject.name === name && i.subject.status === status);
}

describe("getPlateauInsights — real sample data", () => {
  it("splits Grace into separate RX/SCALED subjects, neither merged nor conflated with a heavier variant", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);

    const rx = find(insights, "Grace", "RX");
    const scaled = find(insights, "Grace", "SCALED");
    expect(rx).toBeDefined();
    expect(scaled).toBeDefined();

    // Verified against the real export: SCALED = 11/21/2022, 10/10/2023 (both
    // 225s/"3:45"); RX = 03/31/2026 (291s), 07/07/2026 (272s, PR) — 2 entries
    // per status, below the 3-entry eligibility minimum. If "HEAVY GRACE"
    // (12/09/2024) were wrongly folded in via substring matching, one status
    // would have 3 entries and clear the gate instead.
    expect(rx!.classification).toBe("insufficient_data");
    expect(scaled!.classification).toBe("insufficient_data");
    expect(rx!.performanceTrend.recentPoints).toHaveLength(2);
    expect(scaled!.performanceTrend.recentPoints).toHaveLength(2);
  });

  it("excludes non-Grace/Nancy variant titles from the allowlist match", async () => {
    const workouts = await loadSampleRows();
    const insights = getPlateauInsights(workouts, [], AS_OF);
    const benchmarkNames = insights.filter((i) => i.subject.type === "benchmark_wod");
    // "HEAVY GRACE" and "JUMPING NANCY" are real titles in the sample export
    // that must never surface as their own benchmark subject (only the
    // allowlist's exact names do) nor inflate Grace/Nancy's counts (see above).
    expect(benchmarkNames.some((i) => i.subject.name === "Heavy Grace")).toBe(false);
    expect(benchmarkNames.some((i) => i.subject.name === "Jumping Nancy")).toBe(false);
  });

  it("correctly reads the real Back Squat 1RM-vs-5RM comparison as flat, not a decline", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const backSquat = find(insights, "Back Squat", "RX");
    expect(backSquat).toBeDefined();

    // Verified end-to-end against the real export + synthetic InBody
    // fixture, normalizing to an estimated 1RM (tracked schemes only —
    // 1/2/3/5RM — averaging Epley and Brzycki): of 35 real RX entries, 25
    // have a tracked scheme. windowSize=3: recentWindow (12/13/2024 3RM,
    // 01/12/2026 1RM, 08/02/2026 5RM) averages ~219.68 vs previousWindow
    // (03/04/2024 1RM, 08/13/2024 5RM, 10/15/2024 1RM) averaging ~217.81 —
    // only +0.86%, well inside the 3% threshold. Naively comparing raw
    // weights (215 lb 1RM vs 185 lb 5RM) reads as a -4.8% "decline"; that
    // was an artifact of mixing rep schemes, not a real trend. Over this
    // window the fixture's body comp is steadily improving (SMM 85.0 → 88.5
    // lb, Fat Mass 26.0 → 20.1 lb), so even the "flat" reading isn't a body
    // comp story — this is the single most important regression here: the
    // detector must not misread a rep-scheme change as a performance change.
    expect(backSquat!.performanceTrend.direction).toBe("flat");
    expect(backSquat!.windowStart).toBe("2024-03-04");
    expect(backSquat!.windowEnd).toBe("2026-08-02");
    expect(backSquat!.bodyCompTrend?.leanMassDelta).toBeCloseTo(3.5, 5);
    expect(backSquat!.bodyCompTrend?.fatMassDelta).toBeCloseTo(-5.9, 5);
    expect(backSquat!.classification).toBe("plateaued_other");
    expect(backSquat!.confidence).toBe("high");
  });

  it("classifies Diane's real improvement as improving", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const diane = find(insights, "Diane", "RX");
    expect(diane).toBeDefined();

    // Verified: 4 RX entries (12/02/2024:652s, 04/08/2025:625s,
    // 08/04/2025:653s, 01/14/2026:517s). Recent-2 avg (653, 517) = 585 vs
    // previous-2 avg (652, 625) = 638.5 — a lower time is better, so this is
    // a ~+8.4% performance improvement, clearing the 3% threshold.
    expect(diane!.performanceTrend.direction).toBe("up");
    expect(diane!.classification).toBe("improving");
  });

  it("classifies Nancy's real bounce as plateaued_other with a down trend", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const nancy = find(insights, "Nancy", "SCALED");
    expect(nancy).toBeDefined();

    // All 7 Nancy entries are SCALED (0 RX) — confirms status splitting
    // doesn't require both statuses to be present. Recent-3 avg
    // (04/28/2025, 09/22/2025, 04/13/2026) = 910.67s vs previous-3 avg
    // (04/05/2023, 06/26/2023, 11/12/2024) = 857s — genuinely slower by this
    // windowing, ~+6.3% raw time, i.e. a real "down" direction. Body comp
    // over that window is improving (lean up, fat down), so plateaued_other.
    expect(nancy!.performanceTrend.direction).toBe("down");
    expect(nancy!.classification).toBe("plateaued_other");
    expect(nancy!.confidence).toBe("medium");
  });

  it("excludes non-benchmark titles that merely repeat often from ever becoming a subject", async () => {
    const workouts = await loadSampleRows();
    const insights = getPlateauInsights(workouts, [], AS_OF);
    // "DAILY LAZY MACROS POINTS" and "10:00 AMRAP" each repeat 7 times in the
    // real export but are not named CrossFit benchmarks — a "3+ repeats"
    // heuristic would wrongly capture them; the allowlist must not.
    const names = insights.map((i) => i.subject.name);
    expect(names).not.toContain("Daily Lazy Macros Points");
    expect(names).not.toContain("10:00 Amrap");
  });
});

describe("getPlateauInsights — grouping and normalization", () => {
  it("merges 'Deadlift' and 'Deadlifts' into one subject", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "DEADLIFT", description: "1RM", barbell_lift: "Deadlift", score_type: "Load", best_result_raw: "225" }),
      row({ date: "02/01/2024", title: "DEADLIFTS", description: "1RM", barbell_lift: "Deadlifts", score_type: "Load", best_result_raw: "235" }),
      row({ date: "03/01/2024", title: "DEADLIFT", description: "1RM", barbell_lift: "Deadlift", score_type: "Load", best_result_raw: "245" }),
    ];
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const deadliftSubjects = insights.filter((i) => i.subject.type === "lift" && i.subject.name.toLowerCase().startsWith("deadlift"));

    // Exactly one merged subject, not two split ones — a split would leave
    // each half below the 3-entry eligibility minimum.
    expect(deadliftSubjects).toHaveLength(1);
    expect(deadliftSubjects[0]!.classification).not.toBe("insufficient_data");
  });

  it("folds a freeform title match into an already-known barbell_lift-tagged lift", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "FRONT SQUAT", description: "1RM", barbell_lift: "Front Squat", score_type: "Load", best_result_raw: "165" }),
      // The freeform-title-match branch keys off the raw title text, so the
      // rep-scheme marker must live in the description here, not the title.
      row({ date: "02/01/2024", title: "Front Squat", description: "1RM", barbell_lift: "", score_type: "Load", best_result_raw: "175" }),
      row({ date: "03/01/2024", title: "FRONT SQUAT", description: "1RM", barbell_lift: "Front Squat", score_type: "Load", best_result_raw: "185" }),
    ];
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const frontSquat = insights.filter((i) => i.subject.type === "lift" && i.subject.name === "Front Squat");
    expect(frontSquat).toHaveLength(1);
    expect(frontSquat[0]!.classification).not.toBe("insufficient_data");
  });

  it("never invents a new lift subject from a title match with no tagged barbell_lift anywhere", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "ALL SQUATS", barbell_lift: "", score_type: "Load", best_result_raw: "165" }),
      row({ date: "02/01/2024", title: "ALL SQUATS", barbell_lift: "", score_type: "Load", best_result_raw: "175" }),
      row({ date: "03/01/2024", title: "ALL SQUATS", barbell_lift: "", score_type: "Load", best_result_raw: "185" }),
    ];
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights).toHaveLength(0);
  });
});

describe("getPlateauInsights — rep-scheme normalization", () => {
  it("doesn't read a 1RM-vs-3RM comparison as a decline (the user's own example)", () => {
    // Mirrors the exact scenario that prompted this: a 200 lb 1RM followed
    // later by a 180 lb 3RM isn't a decline — normalized, 180 @ 3RM is
    // ~194 lb, close to 200. A third entry just clears the 3-entry minimum.
    const workouts = [
      row({ date: "02/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "195" }),
      row({ date: "04/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "200" }),
      row({ date: "06/01/2024", title: "SQUAT", description: "3x3", barbell_lift: "Squat", score_type: "Load", best_result_raw: "180" }),
    ];
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights[0]!.performanceTrend.direction).toBe("flat");
  });

  it("excludes an entry with an untracked rep count (e.g. a 4RM) the same way as a schemeless one", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "200" }),
      row({ date: "02/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "205" }),
      row({ date: "03/01/2024", title: "SQUAT", description: "4RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "210" }),
    ];
    const insights = getPlateauInsights(workouts, [], AS_OF);
    // Only the two tracked (1RM) entries count — below the 3-entry minimum,
    // so this stays insufficient_data and the 4RM entry never appears.
    expect(insights[0]!.classification).toBe("insufficient_data");
    expect(insights[0]!.performanceTrend.recentPoints.map((p) => p.value)).toEqual([200, 205]);
  });

  it("uses the raw value unmodified for a true 1-rep max, no formula applied", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "190" }),
      row({ date: "02/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "200" }),
      row({ date: "03/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "210" }),
    ];
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights[0]!.performanceTrend.recentPoints[0]!.value).toBe(210);
  });

  it("averages the Epley and Brzycki formulas for a tracked non-1RM entry", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "210" }),
      row({ date: "02/01/2024", title: "SQUAT", description: "1RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "210" }),
      row({ date: "03/01/2024", title: "SQUAT", description: "5RM", barbell_lift: "Squat", score_type: "Load", best_result_raw: "200" }),
    ];
    const insights = getPlateauInsights(workouts, [], AS_OF);
    // Epley: 200*(1+5/30) = 233.33; Brzycki: 200*36/32 = 225; average = 229.17.
    expect(insights[0]!.performanceTrend.recentPoints[0]!.value).toBeCloseTo(229.17, 1);
  });
});

describe("getPlateauInsights — eligibility gate", () => {
  it("returns insufficient_data with fewer than 3 same-status entries, even with plenty of InBody scans", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "95" }),
      row({ date: "02/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "100" }),
    ];
    const inbodyScans = [
      inbodyRow({ date: "20240101000000" }),
      inbodyRow({ date: "20240115000000" }),
      inbodyRow({ date: "20240201000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.classification).toBe("insufficient_data");
  });

  it("returns insufficient_data with 3+ entries but fewer than 2 InBody scans in the comparison window", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "90" }),
      row({ date: "02/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "95" }),
      row({ date: "03/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "100" }),
    ];
    const inbodyScans = [inbodyRow({ date: "20240301000000" })];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.classification).toBe("insufficient_data");
  });

  it("clears the gate with exactly 3 entries and exactly 2 InBody scans in the window", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "90" }),
      row({ date: "02/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "95" }),
      row({ date: "03/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "100" }),
    ];
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.classification).not.toBe("insufficient_data");
    expect(insights[0]!.confidence).toBe("low");
  });
});

describe("getPlateauInsights — session-count windowing", () => {
  function liftRows(values: number[]): SugarWodRow[] {
    return values.map((value, i) =>
      row({
        date: `${String(i + 1).padStart(2, "0")}/01/2024`,
        title: "TEST LIFT",
        description: "1RM",
        barbell_lift: "Test Lift",
        score_type: "Load",
        best_result_raw: String(value),
      })
    );
  }

  it("uses windowSize=2 (recent-2 vs previous-2) for 4 entries", () => {
    const workouts = liftRows([100, 110, 120, 130]);
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights[0]!.performanceTrend.recentPoints.map((p) => p.value)).toEqual([120, 130]);
  });

  it("caps windowSize at 3 (recent-3 vs previous-3) for 6 entries", () => {
    const workouts = liftRows([100, 110, 120, 130, 140, 150]);
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights[0]!.performanceTrend.recentPoints.map((p) => p.value)).toEqual([130, 140, 150]);
    expect(insights[0]!.windowStart).toBe("2024-01-01");
  });

  it("still caps windowSize at 3 (not 4) for 9 entries, ignoring the oldest 3", () => {
    const workouts = liftRows([100, 110, 120, 130, 140, 150, 160, 170, 180]);
    const insights = getPlateauInsights(workouts, [], AS_OF);
    expect(insights[0]!.performanceTrend.recentPoints.map((p) => p.value)).toEqual([160, 170, 180]);
    // windowStart is the 4th entry (index 3), not the 1st.
    expect(insights[0]!.windowStart).toBe("2024-04-01");
  });
});

describe("getPlateauInsights — confidence tiering", () => {
  it("is low at exactly the gate minimums (3 entries, 2 scans)", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "90" }),
      row({ date: "02/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "95" }),
      row({ date: "03/01/2024", title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: "100" }),
    ];
    const inbodyScans = [inbodyRow({ date: "20240201000000" }), inbodyRow({ date: "20240301000000" })];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.confidence).toBe("low");
  });

  it("is medium at 6 entries and 3 scans in window", () => {
    const workouts = ["01", "02", "03", "04", "05", "06"].map((m, i) =>
      row({ date: `${m}/01/2024`, title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: String(90 + i) })
    );
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
      inbodyRow({ date: "20240401000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.confidence).toBe("medium");
  });

  it("is high at 9+ entries and 4+ scans in window", () => {
    const workouts = ["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((m, i) =>
      row({ date: `${m}/01/2024`, title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: String(90 + i) })
    );
    const inbodyScans = [
      inbodyRow({ date: "20240401000000" }),
      inbodyRow({ date: "20240501000000" }),
      inbodyRow({ date: "20240601000000" }),
      inbodyRow({ date: "20240701000000" }),
      inbodyRow({ date: "20240801000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.confidence).toBe("high");
  });

  it("is low when entries clear high but scans don't (weakest of the two tiers wins)", () => {
    const workouts = ["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((m, i) =>
      row({ date: `${m}/01/2024`, title: "SNATCH", description: "1RM", barbell_lift: "Snatch", score_type: "Load", best_result_raw: String(90 + i) })
    );
    const inbodyScans = [inbodyRow({ date: "20240401000000" }), inbodyRow({ date: "20240501000000" })];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    expect(insights[0]!.confidence).toBe("low");
  });
});

describe("getPlateauInsights — body composition signal combination", () => {
  const decliningLift: SugarWodRow[] = [
    row({ date: "01/01/2024", title: "OHS", description: "1RM", barbell_lift: "Overhead Squat", score_type: "Load", best_result_raw: "100" }),
    row({ date: "02/01/2024", title: "OHS", description: "1RM", barbell_lift: "Overhead Squat", score_type: "Load", best_result_raw: "100" }),
    row({ date: "03/01/2024", title: "OHS", description: "1RM", barbell_lift: "Overhead Squat", score_type: "Load", best_result_raw: "80" }),
  ];

  it("classifies plateaued_body_comp only when lean is down AND fat is up", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000", "Skeletal Muscle Mass(lb)": "90", "Body Fat Mass(lb)": "25" }),
      inbodyRow({ date: "20240301000000", "Skeletal Muscle Mass(lb)": "85", "Body Fat Mass(lb)": "28" }),
    ];
    const insights = getPlateauInsights(decliningLift, inbodyScans, AS_OF);
    expect(insights[0]!.performanceTrend.direction).toBe("down");
    expect(insights[0]!.classification).toBe("plateaued_body_comp");
  });

  it("defaults to plateaued_other on an ambiguous mixed signal (lean down AND fat down)", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000", "Skeletal Muscle Mass(lb)": "90", "Body Fat Mass(lb)": "25" }),
      inbodyRow({ date: "20240301000000", "Skeletal Muscle Mass(lb)": "85", "Body Fat Mass(lb)": "20" }),
    ];
    const insights = getPlateauInsights(decliningLift, inbodyScans, AS_OF);
    expect(insights[0]!.classification).toBe("plateaued_other");
  });

  it("treats a missing field as no data, never coercing it into a decision", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000", "Skeletal Muscle Mass(lb)": "-", "Soft Lean Mass(lb)": "-", "Body Fat Mass(lb)": "25" }),
      inbodyRow({ date: "20240301000000", "Skeletal Muscle Mass(lb)": "85", "Soft Lean Mass(lb)": "-", "Body Fat Mass(lb)": "28" }),
    ];
    const insights = getPlateauInsights(decliningLift, inbodyScans, AS_OF);
    expect(insights[0]!.bodyCompTrend?.leanMassDelta).toBeNull();
    // No lean signal at all means the "lean down AND fat up" story can't be
    // confirmed — falls through to plateaued_other, not a crash or a false
    // plateaued_body_comp.
    expect(insights[0]!.classification).toBe("plateaued_other");
  });

  it("prefers Soft Lean Mass over Skeletal Muscle Mass when both boundary scans report it", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000", "Skeletal Muscle Mass(lb)": "90", "Soft Lean Mass(lb)": "60" }),
      inbodyRow({ date: "20240301000000", "Skeletal Muscle Mass(lb)": "95", "Soft Lean Mass(lb)": "55" }),
    ];
    const insights = getPlateauInsights(decliningLift, inbodyScans, AS_OF);
    // Soft Lean Mass went down (60 -> 55) even though SMM went up (90 -> 95);
    // the Soft Lean Mass delta must win.
    expect(insights[0]!.bodyCompTrend?.leanMassDelta).toBe(-5);
  });
});

describe("getPlateauInsights — benchmark score direction", () => {
  it("treats Cindy as higher-is-better (rounds+reps), unlike the time-based benchmarks", () => {
    const workouts = [
      row({ date: "01/01/2024", title: "Cindy", best_result_raw: "12.0" }),
      row({ date: "02/01/2024", title: "Cindy", best_result_raw: "14.0" }),
      row({ date: "03/01/2024", title: "Cindy", best_result_raw: "16.0" }),
    ];
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
    ];
    const insights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const cindy = find(insights, "Cindy", "RX");
    expect(cindy!.performanceTrend.direction).toBe("up");
    expect(cindy!.classification).toBe("improving");
  });
});
