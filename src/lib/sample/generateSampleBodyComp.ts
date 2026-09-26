import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { clamp, randInt, rngFor } from "./rng";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";

dayjs.extend(customParseFormat);

/**
 * Generates a plausible InBody scan history to pair with the SugarWOD demo
 * data from `extendSample.ts`, entirely in memory at sample-load time (see
 * `App.tsx`'s `run()`, the only caller). Nothing here is fetched, written to
 * disk, or based on a real person's body-composition history — see
 * `tests/fixtures/sampleInBodyRows.ts`'s own header comment for why no real
 * InBody export is bundled the way the SugarWOD one is. This exists so a
 * first-time visitor sees the Body Comp, Plateau Detector, Alignment and
 * Experiments tabs actually populated, not stuck on their empty states.
 *
 * Scans land roughly every two weeks (with jitter, so the cadence doesn't
 * look robotic) from shortly after the athlete's first logged workout
 * through today, always including a scan pinned to today — same reasoning
 * `extendSampleRows` documents for forcing a workout session on the current
 * day: a demo whose most recent data point is visibly stale defeats the
 * point. Generation is deterministic per scan date, not per "now", so
 * reloading demo mode the same day never reshuffles already-placed scans.
 *
 * The trend across the whole span is a deliberate three-phase story —
 * improve, then a mid-span plateau/regression, then improve again, ending
 * better than the start — rather than a straight line. A straight-line
 * improvement would mean `isBodyCompDeclining()` (see plateauDetector.ts)
 * is never true anywhere in the generated history, so the Plateau Detector
 * could only ever show `improving`/`plateaued_other`, never
 * `plateaued_body_comp`. The dip in the middle is what makes all three
 * plateau classifications reachable.
 *
 * Fields are derived from each other rather than independently randomized
 * so the export reads as internally consistent: body fat mass is computed
 * from weight and body-fat percentage, not rolled separately.
 */

const CADENCE_DAYS = 14;
const JITTER_DAYS = 3;

/** Assumed for BMI only — cosmetic, not read by any eligibility gate. */
const ASSUMED_HEIGHT_INCHES = 70;

function parseWorkoutDate(row: SugarWodRow): Dayjs {
  return dayjs((row.date ?? "").trim(), "MM/DD/YYYY", true);
}

function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

/**
 * 0 at the start of the span, rising to 0.55 by 40% through it, dipping back
 * to 0.35 by 60% through (the deliberate regression window), then rising to
 * 1.0 by the end — see the module header comment for why the dip matters.
 */
function trendFraction(t: number): number {
  if (t <= 0.4) return (t / 0.4) * 0.55;
  if (t <= 0.6) return 0.55 - ((t - 0.4) / 0.2) * 0.2;
  return 0.35 + ((t - 0.6) / 0.4) * 0.65;
}

function lerp(start: number, end: number, fraction: number): number {
  return start + (end - start) * fraction;
}

function buildScan(date: Dayjs, firstDate: Dayjs, spanDays: number): InBodyRow {
  const dateKey = date.format("YYYY-MM-DD");
  const t = spanDays > 0 ? clamp(date.diff(firstDate, "day") / spanDays, 0, 1) : 1;
  const trend = trendFraction(t);

  const noise = (purpose: string, amplitude: number) =>
    (rngFor(dateKey, purpose)() - 0.5) * 2 * amplitude;

  const weight = clamp(lerp(198, 182, trend) + noise("weight", 1.5), 120, 320);
  const bodyFatPct = clamp(lerp(24, 15, trend) + noise("bf-pct", 0.6), 6, 40);
  const skeletalMuscleMass = clamp(lerp(74, 82, trend) + noise("smm", 0.8), 40, 140);
  const softLeanMass = clamp(lerp(128, 140, trend) + noise("slm", 1), 60, 220);
  const bodyFatMass = clamp((weight * bodyFatPct) / 100, 0, weight);
  const bmi = clamp((703 * weight) / (ASSUMED_HEIGHT_INCHES * ASSUMED_HEIGHT_INCHES), 12, 45);
  const inbodyScore = Math.round(clamp(lerp(70, 92, trend) + noise("score", 3), 50, 99));

  return {
    date: `${date.format("YYYYMMDD")}090000`,
    "Weight(lb)": fmt(weight, 1),
    "Skeletal Muscle Mass(lb)": fmt(skeletalMuscleMass, 1),
    "Soft Lean Mass(lb)": fmt(softLeanMass, 1),
    "Body Fat Mass(lb)": fmt(bodyFatMass, 1),
    "Percent Body Fat(%)": fmt(bodyFatPct, 1),
    "BMI(kg/m²)": fmt(bmi, 1),
    "InBody Score": String(inbodyScore),
  };
}

/**
 * Returns [] when `workoutRows` has no valid date (defensively, mirroring
 * `extendSampleRows`'s own empty-input guard) — there's nothing to anchor a
 * scan history to.
 */
export function generateSampleBodyComp(
  workoutRows: readonly SugarWodRow[],
  today: Dayjs = dayjs()
): InBodyRow[] {
  const dates = workoutRows.map(parseWorkoutDate).filter((d) => d.isValid());
  if (dates.length === 0) return [];

  const firstDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b)).startOf("day");
  const todayStart = today.startOf("day");
  const spanDays = Math.max(1, todayStart.diff(firstDate, "day"));

  const scans: InBodyRow[] = [];
  let lastScanDate: Dayjs | null = null;
  let offset = CADENCE_DAYS;
  while (offset <= spanDays) {
    const tickDate = firstDate.add(offset, "day");
    const jitterRng = rngFor(tickDate.format("YYYY-MM-DD"), "inbody-jitter");
    const jitteredOffset = clamp(offset + randInt(jitterRng, -JITTER_DAYS, JITTER_DAYS), 1, spanDays);
    const scanDate = firstDate.add(jitteredOffset, "day");
    scans.push(buildScan(scanDate, firstDate, spanDays));
    lastScanDate = scanDate;
    offset += CADENCE_DAYS;
  }

  // A demo whose most recent scan trails today by weeks reads as stale —
  // same reasoning extendSampleRows documents for forcing a workout session
  // on today itself.
  if (!lastScanDate || !lastScanDate.isSame(todayStart, "day")) {
    scans.push(buildScan(todayStart, firstDate, spanDays));
  }

  return scans;
}
