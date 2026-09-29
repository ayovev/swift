import type { Dayjs } from "dayjs";
import {
  BODY_COMP_METRICS,
  DEFAULT_NOISE_BAND,
  MAD_TO_SD,
  NOISE_BAND_FLOOR_FRACTION,
  NOISE_BAND_MULTIPLIER,
  NOISE_MIN_PAIRS,
  NOISE_MIN_RESIDUALS,
  NOISE_PAIR_MAX_GAP_DAYS,
  NOISE_RESIDUAL_HALF_WINDOW,
  NOISE_RESIDUAL_MAX_SPAN_DAYS,
  TIME_OF_DAY_MIN_PER_SIDE,
  TIME_OF_DAY_SPLIT_HOUR,
  type BodyCompMetric,
} from "./insightConfig";
import { parseInBodyDate, parseNumericField } from "./scanParsing";
import type { InBodyRow } from "@/types/inbody";

/**
 * How big does a change between two InBody scans have to be before it is more
 * than scan-to-scan noise? InBody readings move with hydration, meal timing
 * and time of day, so every body-composition claim is only as trustworthy as
 * the answer to that question.
 *
 * The band is the magnitude of a change *between two scans* below which the
 * change is treated as noise. It is estimated from the athlete's own history
 * where the history allows, on a ladder — first method with enough data wins:
 *
 *   1. `paired-scans`: scans taken within `NOISE_PAIR_MAX_GAP_DAYS` of each
 *      other are the same body measured twice; the spread of their
 *      differences is the noise in a two-scan difference directly.
 *   2. `residual`: each scan against the median of its neighbours (itself
 *      excluded, symmetric window, so a steady trend cancels). A residual is
 *      the noise in ONE scan, so it is scaled by √2 to be comparable to a
 *      two-scan difference. Real curvature in the history inflates it, which
 *      errs toward calling less "meaningful" — the safe direction.
 *   3. `default`: a conservative per-metric constant, labelled as such.
 *
 * Spread is a robust one (median absolute deviation), not a standard
 * deviation: one scan taken after a big meal would otherwise widen the band
 * for the athlete's whole history. Whatever a method measures is floored at
 * a fraction of the default (`NOISE_BAND_FLOOR_FRACTION`) so a handful of
 * scans that happen to agree cannot produce a near-zero band.
 *
 * Pure: raw scans in, a value out. No athlete identity, no state.
 */

export type NoiseMethod = "paired-scans" | "residual" | "default";

export interface BodyCompNoiseBand {
  status: "ok" | "insufficient";
  /** Magnitude below which a change is treated as noise. 0 when `status` is "insufficient". */
  band: number;
  method: NoiseMethod;
  /** Pairs (paired-scans), residuals (residual) or readings (default) behind the band. */
  sampleSize: number;
  /** Set when `status` is "insufficient", and when a fallback was used, naming why the better method wasn't. */
  reason?: string;
}

export type BodyCompNoiseBands = Record<BodyCompMetric, BodyCompNoiseBand>;

export interface NoiseBandOptions {
  pairMaxGapDays?: number;
  minPairs?: number;
  residualHalfWindow?: number;
  residualMaxSpanDays?: number;
  minResiduals?: number;
  multiplier?: number;
  floorFraction?: number;
  defaultBand?: Partial<Record<BodyCompMetric, number>>;
}

interface Reading {
  date: Dayjs;
  value: number;
}

const WEIGHT_FIELD = "Weight(lb)";
const FAT_MASS_FIELD = "Body Fat Mass(lb)";
const BODY_FAT_PCT_FIELD = "Percent Body Fat(%)";
const SOFT_LEAN_FIELD = "Soft Lean Mass(lb)";
const SMM_FIELD = "Skeletal Muscle Mass(lb)";

type ScalarField = typeof WEIGHT_FIELD | typeof FAT_MASS_FIELD | typeof BODY_FAT_PCT_FIELD | typeof SOFT_LEAN_FIELD | typeof SMM_FIELD;

function readingsFor(scans: InBodyRow[], field: ScalarField): Reading[] {
  const out: Reading[] = [];
  for (const raw of scans) {
    const date = parseInBodyDate(raw.date);
    const value = parseNumericField(raw[field]);
    if (date.isValid() && value !== null) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.valueOf() - b.date.valueOf());
}

/**
 * Lean mass is Soft Lean Mass where the export carries it, else Skeletal
 * Muscle Mass — the same preference `computeBodyCompTrend` applies to a pair
 * of scans. Picked per *series* here (whichever field has more readings,
 * Soft Lean on a tie) so the band's units match the deltas it will judge.
 */
function leanReadings(scans: InBodyRow[]): Reading[] {
  const soft = readingsFor(scans, SOFT_LEAN_FIELD);
  const smm = readingsFor(scans, SMM_FIELD);
  return soft.length >= smm.length ? soft : smm;
}

export function readingsForMetric(scans: InBodyRow[], metric: BodyCompMetric): Reading[] {
  switch (metric) {
    case "weight":
      return readingsFor(scans, WEIGHT_FIELD);
    case "fatMass":
      return readingsFor(scans, FAT_MASS_FIELD);
    case "bodyFatPct":
      return readingsFor(scans, BODY_FAT_PCT_FIELD);
    case "leanMass":
      return leanReadings(scans);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Robust standard-deviation estimate: 1.4826 × median absolute deviation from the median. */
function robustSd(values: number[]): number {
  const m = median(values);
  return MAD_TO_SD * median(values.map((v) => Math.abs(v - m)));
}

/** Differences between consecutive readings no more than `maxGapDays` apart (whole calendar days). */
function pairedDifferences(readings: Reading[], maxGapDays: number): number[] {
  const diffs: number[] = [];
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1]!;
    const b = readings[i]!;
    if (b.date.startOf("day").diff(a.date.startOf("day"), "day") <= maxGapDays) diffs.push(b.value - a.value);
  }
  return diffs;
}

/** Each interior reading minus the median of its symmetric neighbours, for windows short enough in calendar time. */
function residuals(readings: Reading[], halfWindow: number, maxSpanDays: number): number[] {
  const out: number[] = [];
  for (let i = halfWindow; i < readings.length - halfWindow; i++) {
    const first = readings[i - halfWindow]!;
    const last = readings[i + halfWindow]!;
    if (last.date.startOf("day").diff(first.date.startOf("day"), "day") > maxSpanDays) continue;
    const neighbours: number[] = [];
    for (let k = i - halfWindow; k <= i + halfWindow; k++) if (k !== i) neighbours.push(readings[k]!.value);
    out.push(readings[i]!.value - median(neighbours));
  }
  return out;
}

export function getBodyCompNoiseBand(
  scans: InBodyRow[],
  metric: BodyCompMetric,
  options: NoiseBandOptions = {}
): BodyCompNoiseBand {
  const pairMaxGapDays = options.pairMaxGapDays ?? NOISE_PAIR_MAX_GAP_DAYS;
  const minPairs = options.minPairs ?? NOISE_MIN_PAIRS;
  const halfWindow = options.residualHalfWindow ?? NOISE_RESIDUAL_HALF_WINDOW;
  const maxSpanDays = options.residualMaxSpanDays ?? NOISE_RESIDUAL_MAX_SPAN_DAYS;
  const minResiduals = options.minResiduals ?? NOISE_MIN_RESIDUALS;
  const multiplier = options.multiplier ?? NOISE_BAND_MULTIPLIER;
  const floorFraction = options.floorFraction ?? NOISE_BAND_FLOOR_FRACTION;
  const defaultBand = options.defaultBand?.[metric] ?? DEFAULT_NOISE_BAND[metric];
  const floor = floorFraction * defaultBand;

  const readings = readingsForMetric(scans, metric);
  if (readings.length === 0) {
    return {
      status: "insufficient",
      band: 0,
      method: "default",
      sampleSize: 0,
      reason: "none of the scans report this measurement",
    };
  }

  const diffs = pairedDifferences(readings, pairMaxGapDays);
  if (diffs.length >= minPairs) {
    return {
      status: "ok",
      band: Math.max(floor, multiplier * robustSd(diffs)),
      method: "paired-scans",
      sampleSize: diffs.length,
    };
  }

  const resid = residuals(readings, halfWindow, maxSpanDays);
  if (resid.length >= minResiduals) {
    return {
      status: "ok",
      band: Math.max(floor, multiplier * Math.SQRT2 * robustSd(resid)),
      method: "residual",
      sampleSize: resid.length,
      reason: `only ${diffs.length} of ${minPairs} scan pairs within ${pairMaxGapDays} days, so the band comes from spread around a rolling median`,
    };
  }

  return {
    status: "ok",
    band: defaultBand,
    method: "default",
    sampleSize: readings.length,
    reason:
      `only ${diffs.length} of ${minPairs} scan pairs within ${pairMaxGapDays} days and ` +
      `${resid.length} of ${minResiduals} usable rolling windows, so a standard band is used`,
  };
}

export function getBodyCompNoiseBands(scans: InBodyRow[], options: NoiseBandOptions = {}): BodyCompNoiseBands {
  const entries = BODY_COMP_METRICS.map((m) => [m, getBodyCompNoiseBand(scans, m, options)] as const);
  return Object.fromEntries(entries) as BodyCompNoiseBands;
}

/** Bands of zero: every non-zero delta is meaningful. Reproduces the pre-noise-band sign-only behaviour exactly. */
export const NO_NOISE_BANDS: BodyCompNoiseBands = Object.fromEntries(
  BODY_COMP_METRICS.map((m) => [m, { status: "ok", band: 0, method: "default", sampleSize: 0 } satisfies BodyCompNoiseBand])
) as BodyCompNoiseBands;

/** A change is meaningful only when its magnitude exceeds the band. */
export function isMeaningfulChange(delta: number, band: number): boolean {
  return Math.abs(delta) > band;
}

export interface TimeOfDayFinding {
  status: "ok" | "insufficient";
  morningCount: number;
  afternoonCount: number;
  /** Mean of afternoon-and-later readings minus mean of morning readings; 0 when insufficient. */
  meanDifference: number;
  /** meanDifference relative to the metric's band, so it reads on the same scale as everything else. */
  differenceInBands: number | null;
  reason?: string;
}

/**
 * DIAGNOSTIC ONLY. Do morning scans read systematically differently from
 * afternoon ones? Reported for the maintainer to review; nothing in the
 * insights adjusts for it. Compares raw group means, so a trend that happens
 * to line up with a change in scan habits will show up here too — read it as
 * a prompt to look, not a measurement.
 */
export function analyzeTimeOfDay(
  scans: InBodyRow[],
  metric: BodyCompMetric,
  options: NoiseBandOptions & { splitHour?: number; minPerSide?: number } = {}
): TimeOfDayFinding {
  const splitHour = options.splitHour ?? TIME_OF_DAY_SPLIT_HOUR;
  const minPerSide = options.minPerSide ?? TIME_OF_DAY_MIN_PER_SIDE;
  const readings = readingsForMetric(scans, metric);
  const morning = readings.filter((r) => r.date.hour() < splitHour).map((r) => r.value);
  const afternoon = readings.filter((r) => r.date.hour() >= splitHour).map((r) => r.value);

  if (morning.length < minPerSide || afternoon.length < minPerSide) {
    return {
      status: "insufficient",
      morningCount: morning.length,
      afternoonCount: afternoon.length,
      meanDifference: 0,
      differenceInBands: null,
      reason: `needs ${minPerSide} scans before and after ${splitHour}:00 (has ${morning.length} and ${afternoon.length})`,
    };
  }

  const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const meanDifference = avg(afternoon) - avg(morning);
  const { band } = getBodyCompNoiseBand(scans, metric, options);
  return {
    status: "ok",
    morningCount: morning.length,
    afternoonCount: afternoon.length,
    meanDifference,
    differenceInBands: band > 0 ? meanDifference / band : null,
  };
}

const WITHIN_NOISE_LABEL = { leanMass: "lean mass", fatMass: "fat mass", bodyFatPct: "body fat" } as const;

/**
 * The plain-language line for a trend whose changes sit inside the noise
 * band, or null when none do (including a trend computed without bands).
 * Says what is within normal variation and stops — it never names a direction
 * for a change it just said isn't one.
 */
export function describeWithinNoise(trend: {
  withinNoise?: { leanMass: boolean; fatMass: boolean; bodyFatPct: boolean };
  leanMassDelta: number | null;
  fatMassDelta: number | null;
  bodyFatPctDelta: number | null;
}): string | null {
  const w = trend.withinNoise;
  if (!w) return null;
  const measured = [
    ["leanMass", trend.leanMassDelta],
    ["fatMass", trend.fatMassDelta],
    ["bodyFatPct", trend.bodyFatPctDelta],
  ] as const;
  const present = measured.filter(([, delta]) => delta !== null).map(([k]) => k);
  const within = present.filter((k) => w[k]);
  if (within.length === 0) return null;
  const names = within.map((k) => WITHIN_NOISE_LABEL[k]);
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const verb = within.length === 1 ? "change is" : "changes are";
  const cap = list.charAt(0).toUpperCase() + list.slice(1);
  return `${cap} ${verb} within normal scan variation.`;
}
