import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import {
  analyzeTimeOfDay,
  describeWithinNoise,
  getBodyCompNoiseBand,
  getBodyCompNoiseBands,
  isMeaningfulChange,
  NO_NOISE_BANDS,
} from "@/lib/analytics/bodyCompNoise";
import { computeBodyCompTrend, isBodyCompDeclining } from "@/lib/analytics/plateauDetector";
import { DEFAULT_NOISE_BAND, NOISE_BAND_FLOOR_FRACTION } from "@/lib/analytics/insightConfig";
import type { InBodyRow } from "@/types/inbody";

function scan(stamp: string, fields: Partial<InBodyRow> = {}): InBodyRow {
  return {
    date: stamp,
    "Weight(lb)": "180",
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
    ...fields,
  };
}

const at = (day: string, hhmmss = "090000") => `${day.replaceAll("-", "")}${hhmmss}`;

/** Weight scans on consecutive days with the given values. */
function daily(values: number[], start = "2026-01-01"): InBodyRow[] {
  return values.map((v, i) =>
    scan(at(dayjs(start).add(i, "day").format("YYYY-MM-DD")), { "Weight(lb)": String(v) })
  );
}

/** Weight scans every `gap` days. */
function every(gap: number, values: number[], start = "2026-01-01"): InBodyRow[] {
  return values.map((v, i) =>
    scan(at(dayjs(start).add(i * gap, "day").format("YYYY-MM-DD")), { "Weight(lb)": String(v) })
  );
}

describe("getBodyCompNoiseBand — paired-scans", () => {
  it("is a multiple of the spread of close-together differences", () => {
    // Differences 1, -2, 3, -1, 2: median 1, absolute deviations 0, 3, 2, 2, 1
    // -> MAD 2, robust sd = 1.4826 * 2, band = 2 * that.
    const band = getBodyCompNoiseBand(daily([180, 181, 179, 182, 181, 183]), "weight");
    expect(band.method).toBe("paired-scans");
    expect(band.status).toBe("ok");
    expect(band.sampleSize).toBe(5);
    expect(band.band).toBeCloseTo(2 * 1.4826 * 2, 5);
    expect(band.reason).toBeUndefined();
  });

  it("ignores pairs further apart than the pair gap", () => {
    // Every scan is 30 days from the next: no pairs, no rolling window worth
    // of scans, so this must fall through to the default.
    const band = getBodyCompNoiseBand(every(30, [180, 184, 180, 184, 180]), "weight");
    expect(band.method).toBe("default");
  });

  it("is not thrown by one outlier scan", () => {
    const clean = getBodyCompNoiseBand(daily([180, 180.5, 180, 180.5, 180, 180.5, 180]), "weight");
    const withOutlier = getBodyCompNoiseBand(daily([180, 180.5, 180, 190, 180, 180.5, 180]), "weight");
    expect(withOutlier.band).toBeCloseTo(clean.band, 5);
  });

  it("floors a suspiciously tight measured band at a fraction of the default", () => {
    const band = getBodyCompNoiseBand(daily([180, 180, 180, 180, 180, 180]), "weight");
    expect(band.method).toBe("paired-scans");
    expect(band.band).toBeCloseTo(NOISE_BAND_FLOOR_FRACTION * DEFAULT_NOISE_BAND.weight, 5);
  });

  it("needs the configured number of pairs", () => {
    const three = getBodyCompNoiseBand(daily([180, 184, 180, 184]), "weight", { minPairs: 4 });
    expect(three.method).not.toBe("paired-scans");
    const enough = getBodyCompNoiseBand(daily([180, 184, 180, 184]), "weight", { minPairs: 3 });
    expect(enough.method).toBe("paired-scans");
  });
});

describe("getBodyCompNoiseBand — residual", () => {
  it("is used when scans are spaced out but there are enough of them, and says why paired was skipped", () => {
    // Every 14 days: no pair within 7 days. Alternating +-2 around 180.
    const values = [180, 182, 178, 182, 178, 182, 178, 182, 178, 182];
    const band = getBodyCompNoiseBand(every(14, values), "weight");
    expect(band.method).toBe("residual");
    expect(band.sampleSize).toBe(6);
    expect(band.band).toBeGreaterThan(NOISE_BAND_FLOOR_FRACTION * DEFAULT_NOISE_BAND.weight);
    expect(band.reason).toMatch(/rolling median/);
  });

  it("does not read a steady trend as noise", () => {
    // Perfectly linear +1 lb per 14 days: the symmetric window cancels it, so
    // the measured spread is 0 and only the floor remains.
    const values = Array.from({ length: 10 }, (_, i) => 170 + i);
    const band = getBodyCompNoiseBand(every(14, values), "weight");
    expect(band.method).toBe("residual");
    expect(band.band).toBeCloseTo(NOISE_BAND_FLOOR_FRACTION * DEFAULT_NOISE_BAND.weight, 5);
  });

  it("skips windows that span too many days", () => {
    // Every 40 days, so a five-scan window spans 160 days > 84.
    const values = [180, 182, 178, 182, 178, 182, 178, 182, 178, 182];
    expect(getBodyCompNoiseBand(every(40, values), "weight").method).toBe("default");
  });
});

describe("getBodyCompNoiseBand — default and insufficient", () => {
  it("falls back to the labelled per-metric default with a reason", () => {
    const band = getBodyCompNoiseBand(every(90, [180, 181, 182]), "weight");
    expect(band).toMatchObject({ status: "ok", method: "default", band: DEFAULT_NOISE_BAND.weight, sampleSize: 3 });
    expect(band.reason).toMatch(/standard band/);
  });

  it("is insufficient, never a guess, when no scan reports the metric", () => {
    const band = getBodyCompNoiseBand(daily([180, 181, 182]), "fatMass");
    expect(band.status).toBe("insufficient");
    expect(band.sampleSize).toBe(0);
    expect(band.reason).toMatch(/none of the scans/);
  });

  it("is insufficient for an empty history", () => {
    expect(getBodyCompNoiseBand([], "weight").status).toBe("insufficient");
  });

  it("honours a default override", () => {
    const band = getBodyCompNoiseBand(every(90, [180, 181]), "weight", { defaultBand: { weight: 9 } });
    expect(band.band).toBe(9);
  });

  it("treats '-' cells as missing, not zero", () => {
    const scans = [
      scan(at("2026-01-01"), { "Body Fat Mass(lb)": "20" }),
      scan(at("2026-01-02")), // "-"
      scan(at("2026-01-03"), { "Body Fat Mass(lb)": "20.5" }),
    ];
    expect(getBodyCompNoiseBand(scans, "fatMass").sampleSize).toBe(2);
  });
});

describe("lean mass field choice", () => {
  it("uses Soft Lean Mass when the export carries it, else Skeletal Muscle Mass", () => {
    const soft = Array.from({ length: 6 }, (_, i) =>
      scan(at(dayjs("2026-01-01").add(i, "day").format("YYYY-MM-DD")), {
        "Soft Lean Mass(lb)": String([140, 141, 139, 142, 141, 143][i]),
        "Skeletal Muscle Mass(lb)": "80",
      })
    );
    const softBand = getBodyCompNoiseBand(soft, "leanMass").band;
    expect(softBand).toBeCloseTo(2 * 1.4826 * 2, 5);

    const smmOnly = soft.map((s) => ({ ...s, "Soft Lean Mass(lb)": "-", "Skeletal Muscle Mass(lb)": "80" }));
    expect(getBodyCompNoiseBand(smmOnly, "leanMass").band).toBeCloseTo(
      NOISE_BAND_FLOOR_FRACTION * DEFAULT_NOISE_BAND.leanMass,
      5
    );
  });
});

describe("isMeaningfulChange", () => {
  it("requires the magnitude to exceed the band, in either direction", () => {
    expect(isMeaningfulChange(2, 3)).toBe(false);
    expect(isMeaningfulChange(-2, 3)).toBe(false);
    expect(isMeaningfulChange(3, 3)).toBe(false);
    expect(isMeaningfulChange(3.1, 3)).toBe(true);
    expect(isMeaningfulChange(-3.1, 3)).toBe(true);
  });
});

describe("bands feeding computeBodyCompTrend", () => {
  const start = scan(at("2026-01-01"), { "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "25", "Percent Body Fat(%)": "15" });
  const end = scan(at("2026-02-01"), { "Soft Lean Mass(lb)": "138", "Body Fat Mass(lb)": "27", "Percent Body Fat(%)": "15.5" });

  it("flags deltas inside the band and leaves the delta values alone", () => {
    const trend = computeBodyCompTrend(start, end, getBodyCompNoiseBands([start, end]));
    expect(trend.leanMassDelta).toBe(-2);
    expect(trend.fatMassDelta).toBe(2);
    expect(trend.withinNoise).toEqual({ leanMass: true, fatMass: true, bodyFatPct: true });
    expect(isBodyCompDeclining(trend)).toBe(false);
  });

  it("with no bands, keeps the sign-only behaviour and sets no flags", () => {
    const trend = computeBodyCompTrend(start, end);
    expect(trend.withinNoise).toBeUndefined();
    expect(isBodyCompDeclining(trend)).toBe(true);
  });

  it("NO_NOISE_BANDS reproduces the sign-only result", () => {
    const trend = computeBodyCompTrend(start, end, NO_NOISE_BANDS);
    expect(trend.withinNoise).toEqual({ leanMass: false, fatMass: false, bodyFatPct: false });
    expect(isBodyCompDeclining(trend)).toBe(true);
  });

  it("does not flag a missing delta as within noise", () => {
    const noFat = { ...end, "Body Fat Mass(lb)": "-" };
    const trend = computeBodyCompTrend(start, noFat, getBodyCompNoiseBands([start, noFat]));
    expect(trend.fatMassDelta).toBeNull();
    expect(trend.withinNoise?.fatMass).toBe(false);
  });
});

describe("describeWithinNoise", () => {
  const base = { leanMassDelta: 1, fatMassDelta: -1, bodyFatPctDelta: 0.2 };
  it("is null without bands or when nothing is within noise", () => {
    expect(describeWithinNoise(base)).toBeNull();
    expect(describeWithinNoise({ ...base, withinNoise: { leanMass: false, fatMass: false, bodyFatPct: false } })).toBeNull();
  });
  it("names what is within normal scan variation, plainly", () => {
    expect(describeWithinNoise({ ...base, withinNoise: { leanMass: true, fatMass: false, bodyFatPct: false } })).toBe(
      "Lean mass change is within normal scan variation."
    );
    expect(describeWithinNoise({ ...base, withinNoise: { leanMass: true, fatMass: true, bodyFatPct: true } })).toBe(
      "Lean mass, fat mass and body fat changes are within normal scan variation."
    );
  });
  it("ignores measurements with no delta", () => {
    expect(
      describeWithinNoise({ leanMassDelta: null, fatMassDelta: 1, bodyFatPctDelta: null, withinNoise: { leanMass: false, fatMass: true, bodyFatPct: false } })
    ).toBe("Fat mass change is within normal scan variation.");
  });
});

describe("analyzeTimeOfDay (diagnostic only)", () => {
  it("reports insufficient when either side is thin", () => {
    const r = analyzeTimeOfDay(daily([180, 181, 182]), "weight");
    expect(r.status).toBe("insufficient");
    expect(r.reason).toMatch(/needs 5 scans/);
  });

  it("reports the afternoon-minus-morning mean and its size in bands", () => {
    const scans: InBodyRow[] = [];
    for (let i = 0; i < 6; i++) {
      const d = dayjs("2026-01-01").add(i * 2, "day").format("YYYY-MM-DD");
      scans.push(scan(at(d, "070000"), { "Weight(lb)": "180" }));
      scans.push(scan(at(d, "170000"), { "Weight(lb)": "182" }));
    }
    const r = analyzeTimeOfDay(scans, "weight");
    expect(r.status).toBe("ok");
    expect(r.morningCount).toBe(6);
    expect(r.afternoonCount).toBe(6);
    expect(r.meanDifference).toBeCloseTo(2, 5);
    expect(r.differenceInBands).not.toBeNull();
  });
});
