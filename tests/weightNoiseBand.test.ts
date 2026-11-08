import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { getWeightNoiseBand } from "@/lib/analytics/weightNoiseBand";
import { NOISE_BAND_FLOOR_FRACTION, NOISE_DEFAULT_WEIGHT_BAND_LB } from "@/lib/analytics/insightConfig";
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

describe("getWeightNoiseBand — paired-scans", () => {
  it("is a multiple of the spread of close-together differences", () => {
    // Differences 1, -2, 3, -1, 2: median 1, absolute deviations 0, 3, 2, 2, 1
    // -> MAD 2, robust sd = 1.4826 * 2, band = 2 * that.
    const band = getWeightNoiseBand(daily([180, 181, 179, 182, 181, 183]));
    expect(band.method).toBe("paired-scans");
    expect(band.status).toBe("ok");
    expect(band.sampleSize).toBe(5);
    expect(band.band).toBeCloseTo(2 * 1.4826 * 2, 5);
    expect(band.reason).toBeUndefined();
  });

  it("ignores pairs further apart than the pair gap", () => {
    // Every scan is 30 days from the next: no pairs, no rolling window worth
    // of scans, so this must fall through to the default.
    const band = getWeightNoiseBand(every(30, [180, 184, 180, 184, 180]));
    expect(band.method).toBe("default");
  });

  it("is not thrown by one outlier scan", () => {
    const clean = getWeightNoiseBand(daily([180, 180.5, 180, 180.5, 180, 180.5, 180]));
    const withOutlier = getWeightNoiseBand(daily([180, 180.5, 180, 190, 180, 180.5, 180]));
    expect(withOutlier.band).toBeCloseTo(clean.band, 5);
  });

  it("floors a suspiciously tight measured band at a fraction of the default", () => {
    const band = getWeightNoiseBand(daily([180, 180, 180, 180, 180, 180]));
    expect(band.method).toBe("paired-scans");
    expect(band.band).toBeCloseTo(NOISE_BAND_FLOOR_FRACTION * NOISE_DEFAULT_WEIGHT_BAND_LB, 5);
  });

  it("needs the configured number of pairs", () => {
    const three = getWeightNoiseBand(daily([180, 184, 180, 184]), { minPairs: 4 });
    expect(three.method).not.toBe("paired-scans");
    const enough = getWeightNoiseBand(daily([180, 184, 180, 184]), { minPairs: 3 });
    expect(enough.method).toBe("paired-scans");
  });
});

describe("getWeightNoiseBand — residual", () => {
  it("is used when scans are spaced out but there are enough of them, and says why paired was skipped", () => {
    // Every 14 days: no pair within 7 days. Alternating +-2 around 180.
    const values = [180, 182, 178, 182, 178, 182, 178, 182, 178, 182];
    const band = getWeightNoiseBand(every(14, values));
    expect(band.method).toBe("residual");
    expect(band.sampleSize).toBe(6);
    expect(band.band).toBeGreaterThan(NOISE_BAND_FLOOR_FRACTION * NOISE_DEFAULT_WEIGHT_BAND_LB);
    expect(band.reason).toMatch(/rolling median/);
  });

  it("does not read a steady trend as noise", () => {
    // Perfectly linear +1 lb per 14 days: the symmetric window cancels it, so
    // the measured spread is 0 and only the floor remains.
    const values = Array.from({ length: 10 }, (_, i) => 170 + i);
    const band = getWeightNoiseBand(every(14, values));
    expect(band.method).toBe("residual");
    expect(band.band).toBeCloseTo(NOISE_BAND_FLOOR_FRACTION * NOISE_DEFAULT_WEIGHT_BAND_LB, 5);
  });

  it("skips windows that span too many days", () => {
    // Every 40 days, so a five-scan window spans 160 days > 84.
    const values = [180, 182, 178, 182, 178, 182, 178, 182, 178, 182];
    expect(getWeightNoiseBand(every(40, values)).method).toBe("default");
  });
});

describe("getWeightNoiseBand — default and insufficient", () => {
  it("falls back to the labelled default with a reason", () => {
    const band = getWeightNoiseBand(every(90, [180, 181, 182]));
    expect(band).toMatchObject({ status: "ok", method: "default", band: NOISE_DEFAULT_WEIGHT_BAND_LB, sampleSize: 3 });
    expect(band.reason).toMatch(/standard band/);
  });

  it("is insufficient, never a guess, when no reading reports a weight", () => {
    const band = getWeightNoiseBand(daily([180, 181, 182]).map((r) => ({ ...r, "Weight(lb)": "-" })));
    expect(band.status).toBe("insufficient");
    expect(band.sampleSize).toBe(0);
    expect(band.reason).toMatch(/none of the readings/);
  });

  it("is insufficient for an empty history", () => {
    expect(getWeightNoiseBand([]).status).toBe("insufficient");
  });

  it("honours a default override", () => {
    const band = getWeightNoiseBand(every(90, [180, 181]), { defaultBand: 9 });
    expect(band.band).toBe(9);
  });

  it("treats '-' cells as missing, not zero", () => {
    const scans = [
      scan(at("2026-01-01"), { "Weight(lb)": "180" }),
      scan(at("2026-01-02"), { "Weight(lb)": "-" }),
      scan(at("2026-01-03"), { "Weight(lb)": "181" }),
    ];
    expect(getWeightNoiseBand(scans).sampleSize).toBe(2);
  });
});
