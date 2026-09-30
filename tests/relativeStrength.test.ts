import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { getRelativeStrength } from "@/lib/analytics/relativeStrength";
import { getBodyCompNoiseBands } from "@/lib/analytics/bodyCompNoise";
import { NO_NOISE_BANDS } from "@/lib/analytics/bodyCompNoise";
import { liftRow, scanRow, workoutRow } from "./fixtures/rows";

const AS_OF = new Date("2026-06-30");

/** MM/DD/YYYY for a day offset from a fixed start. */
const d = (offset: number) => dayjs("2026-01-05").add(offset, "day").format("MM/DD/YYYY");
const iso = (offset: number) => dayjs("2026-01-05").add(offset, "day").format("YYYY-MM-DD");

/** Monthly-ish sessions of `lift` with the given loads. */
function sessions(lift: string, loads: number[], gap = 30) {
  return loads.map((load, i) => liftRow(d(i * gap), lift, load));
}

/** Scans every `gap` days with the given [weight, lean] pairs. */
function scans(pairs: [number, number][], gap = 30) {
  return pairs.map(([w, l], i) =>
    scanRow(iso(i * gap), { "Weight(lb)": String(w), "Soft Lean Mass(lb)": String(l) })
  );
}

const opts = { asOfDate: AS_OF, noiseBands: NO_NOISE_BANDS };

describe("getRelativeStrength — attribution", () => {
  it("calls a gain with steady body mass strength-driven", () => {
    const r = getRelativeStrength(
      sessions("Back Squat", [200, 205, 215, 225, 230]),
      scans([[180, 140], [180, 140], [180, 140], [180, 140], [180, 140]]),
      { asOfDate: AS_OF }
    );
    const lift = r.lifts[0]!;
    expect(r.status).toBe("ok");
    expect(lift.status).toBe("ok");
    expect(lift.attribution).toBe("strength-driven");
    expect(lift.normalizedBy).toBe("lean mass");
    expect(lift.reason).toMatch(/Estimated 1RM up \d+%/);
    expect(lift.reason).toMatch(/lean mass stayed within normal scan variation/);
  });

  it("calls a gain that tracks a rise in lean mass mass-driven", () => {
    // e1RM +10%, lean +10% (140 -> 154): per lean mass flat.
    const r = getRelativeStrength(
      sessions("Back Squat", [200, 205, 210, 215, 220]),
      scans([[180, 140], [182, 143], [185, 147], [188, 151], [190, 154]]),
      opts
    );
    expect(r.lifts[0]!.attribution).toBe("mass-driven");
    expect(r.lifts[0]!.reason).toMatch(/lean mass rose/);
  });

  it("calls a gain that outruns a smaller rise in lean mass mixed", () => {
    // e1RM +20%, lean +5%: per lean mass still +14%.
    const r = getRelativeStrength(
      sessions("Back Squat", [200, 210, 225, 235, 240]),
      scans([[180, 140], [180, 141], [181, 143], [182, 145], [182, 147]]),
      opts
    );
    expect(r.lifts[0]!.attribution).toBe("mixed");
  });

  it("calls a hold flat and a fall declined", () => {
    const s = scans([[180, 140], [180, 140], [180, 140], [180, 140], [180, 140]]);
    expect(getRelativeStrength(sessions("Back Squat", [200, 201, 199, 200, 201]), s, opts).lifts[0]!.attribution).toBe("flat");
    expect(getRelativeStrength(sessions("Back Squat", [230, 225, 215, 205, 200]), s, opts).lifts[0]!.attribution).toBe("declined");
  });

  it("does not attribute a gain to mass when the mass change is inside the noise band", () => {
    // Lean +2 lb (140 -> 142) is inside the default 3 lb band: still strength-driven.
    const inputs = [sessions("Back Squat", [200, 205, 215, 225, 230]), scans([[180, 140], [180, 140], [181, 141], [181, 141], [181, 142]])] as const;
    const withBand = getRelativeStrength(inputs[0], inputs[1], { asOfDate: AS_OF, noiseBands: getBodyCompNoiseBands(inputs[1]) });
    expect(withBand.lifts[0]!.attribution).toBe("strength-driven");
    // Without a band the same +2 lb counts as growth, and per lean mass the gain is still large: mixed.
    const noBand = getRelativeStrength(inputs[0], inputs[1], opts);
    expect(noBand.lifts[0]!.attribution).toBe("mixed");
  });

  it("falls back to bodyweight when the export has no lean mass", () => {
    const noLean = [200, 205, 215, 225, 230].map((_, i) => scanRow(iso(i * 30), { "Weight(lb)": "180" }));
    const r = getRelativeStrength(sessions("Back Squat", [200, 205, 215, 225, 230]), noLean, { asOfDate: AS_OF });
    expect(r.lifts[0]!.normalizedBy).toBe("bodyweight");
    expect(r.lifts[0]!.series.every((p) => p.perLeanMass === null && p.perBodyweight !== null)).toBe(true);
  });
});

describe("getRelativeStrength — series and body matching", () => {
  it("normalises lift name variants into one lift and keeps RX / Scaled apart", () => {
    const rows = [
      liftRow(d(0), "Back Squat", 200),
      liftRow(d(30), "Back Squats", 205),
      liftRow(d(60), "back squat", 210),
      liftRow(d(90), "Back Squat", 215),
      liftRow(d(120), "Back Squat", 150, { rx_or_scaled: "SCALED" }),
    ];
    const r = getRelativeStrength(rows, scans([[180, 140], [180, 140], [180, 140], [180, 140], [180, 140]]), opts);
    const rx = r.lifts.find((l) => l.rxStatus === "RX")!;
    const scaled = r.lifts.find((l) => l.rxStatus === "SCALED")!;
    expect(r.lifts).toHaveLength(2);
    expect(rx.series).toHaveLength(4);
    expect(scaled.series).toHaveLength(1);
  });

  it("never uses WOD scores, only Load-scored lifts", () => {
    const rows = [
      ...sessions("Back Squat", [200, 205, 210, 215]),
      workoutRow({ date: d(10), title: "FRAN", score_type: "Time", best_result_raw: "225" }),
    ];
    const r = getRelativeStrength(rows, scans([[180, 140], [180, 140], [180, 140], [180, 140]]), opts);
    expect(r.lifts.map((l) => l.lift)).toEqual(["Back Squat"]);
  });

  it("estimates from a stated rep scheme up to the cap, and skips higher or unstated ones", () => {
    const rows = [
      liftRow(d(0), "Deadlift", 300, { description: "Deadlift 5RM" }),
      liftRow(d(30), "Deadlift", 300, { description: "Deadlift 12RM" }),
      liftRow(d(60), "Deadlift", 300, { description: "Deadlift" }),
    ];
    const r = getRelativeStrength(rows, [], { asOfDate: AS_OF });
    expect(r.lifts[0]!.series).toHaveLength(1);
    // 5RM at 300 estimates above 300.
    expect(r.lifts[0]!.series[0]!.e1rm).toBeGreaterThan(330);
  });

  it("takes the best estimate when a lift is logged twice on one day", () => {
    const rows = [liftRow(d(0), "Back Squat", 200), liftRow(d(0), "Back Squat", 210)];
    const r = getRelativeStrength(rows, [], { asOfDate: AS_OF });
    expect(r.lifts[0]!.series).toHaveLength(1);
    expect(r.lifts[0]!.series[0]!.e1rm).toBe(210);
  });

  it("uses the scan on the day exactly", () => {
    const r = getRelativeStrength(
      sessions("Back Squat", [200]),
      [scanRow(iso(0), { "Weight(lb)": "200", "Soft Lean Mass(lb)": "100" })],
      { asOfDate: AS_OF }
    );
    const p = r.lifts[0]!.series[0]!;
    expect(p.bodyMatch).toBe("exact");
    expect(p.perBodyweight).toBe(1);
    expect(p.perLeanMass).toBe(2);
  });

  it("interpolates between scans that are close enough together", () => {
    const r = getRelativeStrength(
      [liftRow(d(15), "Back Squat", 200)],
      [
        scanRow(iso(0), { "Weight(lb)": "200", "Soft Lean Mass(lb)": "100" }),
        scanRow(iso(30), { "Weight(lb)": "190", "Soft Lean Mass(lb)": "104" }),
      ],
      { asOfDate: AS_OF }
    );
    const p = r.lifts[0]!.series[0]!;
    expect(p.bodyMatch).toBe("interpolated");
    expect(p.perBodyweight).toBeCloseTo(200 / 195, 6);
    expect(p.perLeanMass).toBeCloseTo(200 / 102, 6);
  });

  it("does not interpolate across a gap larger than the limit; uses a near scan or leaves it unmatched", () => {
    const wide = [
      scanRow(iso(0), { "Weight(lb)": "200", "Soft Lean Mass(lb)": "100" }),
      scanRow(iso(120), { "Weight(lb)": "180", "Soft Lean Mass(lb)": "110" }),
    ];
    // 60 days in: 60 from each scan, gap 120 > 45, nearest is 60 > 21 -> unmatched.
    const far = getRelativeStrength([liftRow(d(60), "Back Squat", 200)], wide, { asOfDate: AS_OF }).lifts[0]!.series[0]!;
    expect(far.bodyMatch).toBe("unmatched");
    expect(far.perBodyweight).toBeNull();
    expect(far.perLeanMass).toBeNull();
    // 10 days in: nearest scan is 10 days away -> nearest, not interpolated.
    const near = getRelativeStrength([liftRow(d(10), "Back Squat", 200)], wide, { asOfDate: AS_OF }).lifts[0]!.series[0]!;
    expect(near.bodyMatch).toBe("nearest");
    expect(near.perBodyweight).toBe(1);
  });

  it("never extrapolates past the first or last scan", () => {
    const one = [scanRow(iso(0), { "Weight(lb)": "200", "Soft Lean Mass(lb)": "100" })];
    const p = getRelativeStrength([liftRow(d(150), "Back Squat", 200)], one, { asOfDate: AS_OF }).lifts[0]!.series[0]!;
    expect(p.bodyMatch).toBe("unmatched");
  });
});

describe("getRelativeStrength — eligibility", () => {
  const fullScans = scans([[180, 140], [180, 140], [180, 140], [180, 140], [180, 140]]);

  it("lists a lift with too few sessions as insufficient, with the shortfall, and still returns its series", () => {
    const r = getRelativeStrength(
      [...sessions("Back Squat", [200, 205, 215, 225, 230]), ...sessions("Deadlift", [300, 310])],
      fullScans,
      { asOfDate: AS_OF }
    );
    const dl = r.lifts.find((l) => l.lift === "Deadlift")!;
    expect(r.status).toBe("ok");
    expect(dl.status).toBe("insufficient");
    expect(dl.attribution).toBeUndefined();
    expect(dl.reason).toMatch(/needs 2 more logged sessions in the last 365 days \(has 2, needs 4\)/);
    expect(dl.series).toHaveLength(2);
  });

  it("counts only sessions inside the look-back window", () => {
    const old = [0, 1, 2, 3].map((i) => liftRow(dayjs("2024-01-01").add(i * 30, "day").format("MM/DD/YYYY"), "Back Squat", 200 + i));
    const r = getRelativeStrength(old, fullScans, { asOfDate: AS_OF });
    expect(r.lifts[0]!.status).toBe("insufficient");
    expect(r.lifts[0]!.reason).toMatch(/has 0, needs 4/);
  });

  it("is insufficient with a reason when scans are missing entirely", () => {
    const r = getRelativeStrength(sessions("Back Squat", [200, 205, 215, 225, 230]), [], { asOfDate: AS_OF });
    expect(r.status).toBe("insufficient");
    expect(r.reason).toMatch(/no InBody scans/);
    expect(r.lifts[0]!.reason).toMatch(/InBody scans in this lift.s window/);
  });

  it("reports sparse scans as insufficient rather than guessing", () => {
    const sparse = [scanRow(iso(0), { "Weight(lb)": "180", "Soft Lean Mass(lb)": "140" })];
    const r = getRelativeStrength(sessions("Back Squat", [200, 205, 215, 225, 230]), sparse, { asOfDate: AS_OF });
    expect(r.lifts[0]!.status).toBe("insufficient");
    expect(r.lifts[0]!.reason).toMatch(/needs 1 more InBody scan in this lift's window/);
  });

  it("is insufficient when there is no lift to look at", () => {
    const r = getRelativeStrength([workoutRow({ date: d(0), title: "FRAN" })], fullScans, { asOfDate: AS_OF });
    expect(r).toMatchObject({ status: "insufficient", lifts: [] });
    expect(r.reason).toBeTruthy();
  });

  it("ignores sessions after asOfDate", () => {
    const r = getRelativeStrength(sessions("Back Squat", [200, 205, 215, 225, 230]), fullScans, { asOfDate: new Date("2026-02-01") });
    expect(r.lifts[0]!.series.every((p) => p.date <= "2026-02-01")).toBe(true);
  });
});
