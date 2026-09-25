import { describe, expect, it } from "vitest";
import { getExperimentInsight } from "@/lib/analytics/experimentInsight";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
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

function liftRow(date: string, lift: string, value: number): SugarWodRow {
  return row({
    date,
    title: lift.toUpperCase(),
    description: "1RM",
    barbell_lift: lift,
    score_type: "Load",
    best_result_raw: String(value),
  });
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

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return { id: "exp-1", date: "2024-06-01", label: "Test experiment", ...overrides };
}

const AS_OF = new Date("2027-01-01");

describe("getExperimentInsight — eligibility gate, subject side", () => {
  it("names 'before' as the thin side when every subject only has data after the start date", () => {
    const workouts = [
      liftRow("07/01/2024", "Snatch", 100),
      liftRow("07/05/2024", "Clean", 150),
      liftRow("07/10/2024", "Jerk", 120),
    ];
    const result = getExperimentInsight(experiment(), workouts, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 3 more lifts/WODs with logged data before this date (has 0, needs 3)");
    expect(result.performanceSummary).toEqual({
      improvingCount: 0,
      decliningCount: 0,
      flatCount: 0,
      classifiedCount: 0,
    });
    expect(result.bodyCompSummary).toEqual({ leanMassDelta: null, fatMassDelta: null, bodyFatPctDelta: null });
  });

  it("names 'after' as the thin side when every subject only has data before the start date", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("01/10/2024", "Jerk", 120),
    ];
    const result = getExperimentInsight(experiment(), workouts, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 3 more lifts/WODs with logged data after this date (has 0, needs 3)");
  });

  it("defaults a tie between the two sides to naming 'after' as thin", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 110),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("07/05/2024", "Clean", 160),
    ];
    const result = getExperimentInsight(experiment(), workouts, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more lift/WOD with logged data after this date (has 2, needs 3)");
  });

  it("a subject only logged on one side never counts toward the classified total", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 110),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("07/05/2024", "Clean", 160),
      liftRow("01/10/2024", "Jerk", 120), // before-only: doesn't help clear the gate
    ];
    const result = getExperimentInsight(experiment(), workouts, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more lift/WOD with logged data after this date (has 2, needs 3)");
  });
});

const threeSubjectsBothSides = [
  liftRow("01/01/2024", "Snatch", 100),
  liftRow("07/01/2024", "Snatch", 100),
  liftRow("01/05/2024", "Clean", 150),
  liftRow("07/05/2024", "Clean", 150),
  liftRow("01/10/2024", "Jerk", 120),
  liftRow("07/10/2024", "Jerk", 120),
];

describe("getExperimentInsight — eligibility gate, InBody scan side", () => {
  it("names 'before' as the thin side with fewer than 2 InBody scans before the start date", () => {
    const inbodyScans = [inbodyRow({ date: "20240301000000" }), inbodyRow({ date: "20240701000000" })];
    const result = getExperimentInsight(experiment(), threeSubjectsBothSides, inbodyScans, AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more InBody scan before this date (has 1, needs 2)");
  });

  it("names 'after' as the thin side with fewer than 2 InBody scans after the start date", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
      inbodyRow({ date: "20240701000000" }),
    ];
    const result = getExperimentInsight(experiment(), threeSubjectsBothSides, inbodyScans, AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more InBody scan after this date (has 1, needs 2)");
  });

  it("clears the gate with exactly 2 InBody scans on each side", () => {
    const inbodyScans = [
      inbodyRow({ date: "20240201000000" }),
      inbodyRow({ date: "20240301000000" }),
      inbodyRow({ date: "20240701000000" }),
      inbodyRow({ date: "20240801000000" }),
    ];
    const result = getExperimentInsight(experiment(), threeSubjectsBothSides, inbodyScans, AS_OF);
    expect(result.classification).not.toBe("insufficient_data");
  });
});

describe("getExperimentInsight — classification table", () => {
  const stableScans = [
    inbodyRow({ date: "20240201000000" }),
    inbodyRow({ date: "20240501000000" }),
    inbodyRow({ date: "20240701000000" }),
    inbodyRow({ date: "20240901000000" }),
  ];

  it("majority up + body comp not declining -> improved", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 115),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("07/05/2024", "Clean", 170),
      liftRow("01/10/2024", "Jerk", 120),
      liftRow("07/10/2024", "Jerk", 135),
    ];
    const result = getExperimentInsight(experiment(), workouts, stableScans, AS_OF);
    expect(result.classification).toBe("improved");
    expect(result.performanceSummary).toEqual({
      improvingCount: 3,
      decliningCount: 0,
      flatCount: 0,
      classifiedCount: 3,
    });
  });

  it("majority down + body comp not improving -> declined", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 115),
      liftRow("07/01/2024", "Snatch", 100),
      liftRow("01/05/2024", "Clean", 170),
      liftRow("07/05/2024", "Clean", 150),
      liftRow("01/10/2024", "Jerk", 135),
      liftRow("07/10/2024", "Jerk", 120),
    ];
    const result = getExperimentInsight(experiment(), workouts, stableScans, AS_OF);
    expect(result.classification).toBe("declined");
  });

  it("majority flat + body comp stable -> no_change", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 101),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("07/05/2024", "Clean", 152),
      liftRow("01/10/2024", "Jerk", 120),
      liftRow("07/10/2024", "Jerk", 121),
    ];
    const result = getExperimentInsight(experiment(), workouts, stableScans, AS_OF);
    expect(result.classification).toBe("no_change");
  });

  it("performance and body comp disagree (up + declining) -> mixed", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 115),
      liftRow("01/05/2024", "Clean", 150),
      liftRow("07/05/2024", "Clean", 170),
      liftRow("01/10/2024", "Jerk", 120),
      liftRow("07/10/2024", "Jerk", 135),
    ];
    // The nearest scans straddling the start date show lean down + fat up
    // (declining); an earlier/later pair, further from the boundary, show
    // the opposite — only the nearest pair on each side may drive the read.
    const inbodyScans = [
      inbodyRow({ date: "20240101000000", "Skeletal Muscle Mass(lb)": "100", "Body Fat Mass(lb)": "20" }),
      inbodyRow({ date: "20240525000000", "Skeletal Muscle Mass(lb)": "90", "Body Fat Mass(lb)": "25" }),
      inbodyRow({ date: "20240605000000", "Skeletal Muscle Mass(lb)": "80", "Body Fat Mass(lb)": "30" }),
      inbodyRow({ date: "20240901000000", "Skeletal Muscle Mass(lb)": "95", "Body Fat Mass(lb)": "18" }),
    ];
    const result = getExperimentInsight(experiment(), workouts, inbodyScans, AS_OF);
    expect(result.bodyCompSummary.leanMassDelta).toBe(-10);
    expect(result.bodyCompSummary.fatMassDelta).toBe(5);
    expect(result.classification).toBe("mixed");
  });

  it("no strict majority among up/down/flat -> mixed, regardless of body comp", () => {
    const workouts = [
      liftRow("01/01/2024", "Snatch", 100),
      liftRow("07/01/2024", "Snatch", 115), // up
      liftRow("01/05/2024", "Clean", 100),
      liftRow("07/05/2024", "Clean", 85), // down
      liftRow("01/10/2024", "Jerk", 100),
      liftRow("07/10/2024", "Jerk", 102), // flat
    ];
    const result = getExperimentInsight(experiment(), workouts, stableScans, AS_OF);
    expect(result.performanceSummary).toEqual({
      improvingCount: 1,
      decliningCount: 1,
      flatCount: 1,
      classifiedCount: 3,
    });
    expect(result.classification).toBe("mixed");
  });
});

describe("getExperimentInsight — real sample data", () => {
  it("doesn't throw and returns a valid classification against the real SugarWOD export + synthetic InBody fixture", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const result = getExperimentInsight(experiment({ date: "2024-06-01" }), workouts, inbodyScans, AS_OF);
    expect(["improved", "declined", "no_change", "mixed", "insufficient_data"]).toContain(result.classification);
  });
});
