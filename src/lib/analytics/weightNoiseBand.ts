import type { Dayjs } from "dayjs";
import {
  MAD_TO_SD,
  NOISE_BAND_FLOOR_FRACTION,
  NOISE_BAND_MULTIPLIER,
  NOISE_DEFAULT_WEIGHT_BAND_LB,
  NOISE_MIN_PAIRS,
  NOISE_MIN_RESIDUALS,
  NOISE_PAIR_MAX_GAP_DAYS,
  NOISE_RESIDUAL_HALF_WINDOW,
  NOISE_RESIDUAL_MAX_SPAN_DAYS,
} from "./insightConfig";
import { parseInBodyDate, parseNumericField } from "./scanParsing";
import type { InBodyRow } from "@/types/inbody";

/**
 * How big does a change in body weight between two readings have to be before it is more
 * than reading-to-reading noise? Weight moves with hydration, meal timing and time of day,
 * so a sentence about it is only as trustworthy as the answer to that question. Only weight
 * is estimated: it is the one body measurement the Insights views state.
 *
 * The band is the magnitude of a change *between two readings* below which the
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
 *   3. `default`: a conservative constant (`NOISE_DEFAULT_WEIGHT_BAND_LB`), labelled as such.
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

export interface WeightNoiseBand {
  status: "ok" | "insufficient";
  /** Magnitude below which a change is treated as noise. 0 when `status` is "insufficient". */
  band: number;
  method: NoiseMethod;
  /** Pairs (paired-scans), residuals (residual) or readings (default) behind the band. */
  sampleSize: number;
  /** Set when `status` is "insufficient", and when a fallback was used, naming why the better method wasn't. */
  reason?: string;
}

export interface NoiseBandOptions {
  pairMaxGapDays?: number;
  minPairs?: number;
  residualHalfWindow?: number;
  residualMaxSpanDays?: number;
  minResiduals?: number;
  multiplier?: number;
  floorFraction?: number;
  defaultBand?: number;
}

interface Reading {
  date: Dayjs;
  value: number;
}

const WEIGHT_FIELD = "Weight(lb)";

function weightReadings(scans: InBodyRow[]): Reading[] {
  const out: Reading[] = [];
  for (const raw of scans) {
    const date = parseInBodyDate(raw.date);
    const value = parseNumericField(raw[WEIGHT_FIELD]);
    if (date.isValid() && value !== null) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.valueOf() - b.date.valueOf());
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

/** The weight noise band for these readings (scans, or the pooled scans and weigh-ins). */
export function getWeightNoiseBand(scans: InBodyRow[], options: NoiseBandOptions = {}): WeightNoiseBand {
  const pairMaxGapDays = options.pairMaxGapDays ?? NOISE_PAIR_MAX_GAP_DAYS;
  const minPairs = options.minPairs ?? NOISE_MIN_PAIRS;
  const halfWindow = options.residualHalfWindow ?? NOISE_RESIDUAL_HALF_WINDOW;
  const maxSpanDays = options.residualMaxSpanDays ?? NOISE_RESIDUAL_MAX_SPAN_DAYS;
  const minResiduals = options.minResiduals ?? NOISE_MIN_RESIDUALS;
  const multiplier = options.multiplier ?? NOISE_BAND_MULTIPLIER;
  const floorFraction = options.floorFraction ?? NOISE_BAND_FLOOR_FRACTION;
  const defaultBand = options.defaultBand ?? NOISE_DEFAULT_WEIGHT_BAND_LB;
  const floor = floorFraction * defaultBand;

  const readings = weightReadings(scans);
  if (readings.length === 0) {
    return {
      status: "insufficient",
      band: 0,
      method: "default",
      sampleSize: 0,
      reason: "none of the readings report a weight",
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
      reason: `only ${diffs.length} of ${minPairs} reading pairs within ${pairMaxGapDays} days, so the band comes from spread around a rolling median`,
    };
  }

  return {
    status: "ok",
    band: defaultBand,
    method: "default",
    sampleSize: readings.length,
    reason:
      `only ${diffs.length} of ${minPairs} reading pairs within ${pairMaxGapDays} days and ` +
      `${resid.length} of ${minResiduals} usable rolling windows, so a standard band is used`,
  };
}
