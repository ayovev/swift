import { describe, expect, it } from "vitest";
import { getPhaseAlignment } from "@/lib/analytics/phaseAlignment";
import { getPlateauInsights } from "@/lib/analytics/plateauDetector";
import type { InBodyRow } from "@/types/inbody";
import type { PlateauClassification, PlateauInsight } from "@/types/plateau";
import { loadSampleRows } from "./fixtures/sampleRows";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";

function insight(
  classification: PlateauClassification,
  windowStart: string,
  windowEnd: string
): PlateauInsight {
  return {
    subject: { type: "lift", name: `Test ${windowStart}`, status: "RX" },
    classification,
    windowStart,
    windowEnd,
    performanceTrend: { direction: "flat", recentPoints: [], valueKind: "raw" },
    confidence: "low",
  };
}

function scan(
  date: string,
  overrides: Partial<InBodyRow> = {}
): InBodyRow {
  return {
    date,
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

const AS_OF = new Date("2027-01-01");

describe("getPhaseAlignment — eligibility gate", () => {
  it("returns insufficient_data with fewer than 3 classified subjects, naming the shortfall", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("plateaued_other", "2024-01-10", "2024-02-01"),
      insight("insufficient_data", "2024-01-05", "2024-01-05"),
    ];
    const result = getPhaseAlignment(plateauInsights, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more classified lift/WOD (has 2, needs 3)");
    expect(result.performanceSummary).toEqual({ improvingCount: 1, plateauedCount: 1, classifiedCount: 2 });
    // Window is still computed from the 2 classified subjects even though the gate failed.
    expect(result.bodyCompSummary.windowStart).toBe("2024-01-01");
    expect(result.bodyCompSummary.windowEnd).toBe("2024-02-01");
    expect(result.bodyCompSummary.leanMassDelta).toBeNull();
    expect(result.bodyCompSummary.fatMassDelta).toBeNull();
    expect(result.bodyCompSummary.bodyFatPctDelta).toBeNull();
  });

  it("reports an empty window when zero subjects are classified", () => {
    const plateauInsights = [insight("insufficient_data", "2024-01-01", "2024-01-05")];
    const result = getPhaseAlignment(plateauInsights, [], AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 3 more classified lifts/WODs (has 0, needs 3)");
    expect(result.bodyCompSummary.windowStart).toBe("");
    expect(result.bodyCompSummary.windowEnd).toBe("");
  });

  it("returns insufficient_data with 3+ classified subjects but fewer than 2 InBody scans in the union window", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("plateaued_other", "2024-01-10", "2024-02-01"),
      insight("plateaued_body_comp", "2024-01-05", "2024-01-20"),
    ];
    const inbodyScans = [scan("20240110000000")];
    const result = getPhaseAlignment(plateauInsights, inbodyScans, AS_OF);
    expect(result.classification).toBe("insufficient_data");
    expect(result.reason).toBe("needs 1 more InBody scan in this window (has 1, needs 2)");
    // The window is real (computed from the 3 classified subjects) even though the scan gate failed.
    expect(result.bodyCompSummary.windowStart).toBe("2024-01-01");
    expect(result.bodyCompSummary.windowEnd).toBe("2024-02-01");
    expect(result.bodyCompSummary.leanMassDelta).toBeNull();
  });
});

describe("getPhaseAlignment — classification table", () => {
  const notDecliningScans = [
    scan("20240101000000", { "Soft Lean Mass(lb)": "150", "Body Fat Mass(lb)": "20" }),
    scan("20240201000000", { "Soft Lean Mass(lb)": "155", "Body Fat Mass(lb)": "18" }),
  ];
  const decliningScans = [
    scan("20240101000000", { "Soft Lean Mass(lb)": "150", "Body Fat Mass(lb)": "20" }),
    scan("20240201000000", { "Soft Lean Mass(lb)": "145", "Body Fat Mass(lb)": "24" }),
  ];

  it("trending up + body comp not declining -> aligned", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("improving", "2024-01-10", "2024-02-01"),
      insight("plateaued_other", "2024-01-05", "2024-01-20"),
    ];
    const result = getPhaseAlignment(plateauInsights, notDecliningScans, AS_OF);
    expect(result.classification).toBe("aligned");
  });

  it("trending down/mixed + body comp declining -> aligned (consistent cut/decline story)", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("plateaued_other", "2024-01-10", "2024-02-01"),
      insight("plateaued_body_comp", "2024-01-05", "2024-01-20"),
    ];
    const result = getPhaseAlignment(plateauInsights, decliningScans, AS_OF);
    expect(result.classification).toBe("aligned");
  });

  it("trending up + body comp declining -> tension", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("improving", "2024-01-10", "2024-02-01"),
      insight("plateaued_other", "2024-01-05", "2024-01-20"),
    ];
    const result = getPhaseAlignment(plateauInsights, decliningScans, AS_OF);
    expect(result.classification).toBe("tension");
  });

  it("trending down/mixed + body comp not declining -> tension", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("plateaued_other", "2024-01-10", "2024-02-01"),
      insight("plateaued_body_comp", "2024-01-05", "2024-01-20"),
    ];
    const result = getPhaseAlignment(plateauInsights, notDecliningScans, AS_OF);
    expect(result.classification).toBe("tension");
  });

  it("a tied improving/plateaued count resolves to the 'not trending up' side, same as trending down", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("improving", "2024-01-05", "2024-01-18"),
      insight("plateaued_other", "2024-01-10", "2024-02-01"),
      insight("plateaued_body_comp", "2024-01-08", "2024-01-25"),
    ];
    const result = getPhaseAlignment(plateauInsights, notDecliningScans, AS_OF);
    expect(result.performanceSummary.improvingCount).toBe(2);
    expect(result.performanceSummary.plateauedCount).toBe(2);
    // Not-declining body comp + "not trending up" (tie) -> tension, exactly like a real decline would be.
    expect(result.classification).toBe("tension");
  });

  it("treats a missing field on the compared scans as no data, not zero, and doesn't call that 'declining'", () => {
    const plateauInsights = [
      insight("improving", "2024-01-01", "2024-01-15"),
      insight("improving", "2024-01-10", "2024-02-01"),
      insight("plateaued_other", "2024-01-05", "2024-01-20"),
    ];
    const inbodyScans = [
      scan("20240101000000", { "Body Fat Mass(lb)": "20" }), // Soft Lean Mass and SMM both "-"
      scan("20240201000000", { "Body Fat Mass(lb)": "18" }),
    ];
    const result = getPhaseAlignment(plateauInsights, inbodyScans, AS_OF);
    expect(result.bodyCompSummary.leanMassDelta).toBeNull();
    expect(result.bodyCompSummary.fatMassDelta).toBe(-2);
    expect(result.classification).toBe("aligned"); // trending up + not declining (null lean is never "bad")
  });
});

describe("getPhaseAlignment — real sample data", () => {
  it("doesn't throw and returns a valid classification against the real SugarWOD export + synthetic InBody fixture", async () => {
    const workouts = await loadSampleRows();
    const inbodyScans = await loadSampleInBodyRows();
    const plateauInsights = getPlateauInsights(workouts, inbodyScans, AS_OF);
    const result = getPhaseAlignment(plateauInsights, inbodyScans, AS_OF);
    expect(["aligned", "tension", "insufficient_data"]).toContain(result.classification);
  });
});
