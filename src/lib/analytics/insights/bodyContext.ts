/**
 * The body-context lines under a verdict row. They state what body weight did between the two sessions that set the verdict's two
 * bests, and how that compares with the lift. They never say why a lift changed, and they never change a verdict, a count or a label.
 *
 * Body weight at a date: that day's reading, else a straight line between the readings either side if they are no further apart than
 * `PV_BODY_INTERPOLATION_GAP_DAYS`, else the nearest reading within `PV_BODY_NEAREST_READING_DAYS`, else none; never extrapolated. A change
 * smaller than the noise band (`weightNoiseBand.ts`, a 3 lb default) is "within normal scan variation".
 *
 * The sentence relating body weight to a load-scored lift (never a benchmark, a move up to RX or a not-tested-since lift), when body
 * weight moved past the band:
 *   same way, share = |body weight % / lift %|: under 25% "A little", 25% to 75% "About half", over 75% under 100% "Most";
 *   100% or more: "Body weight rose at least as much as the lift (+3.0% vs +1.4%)." (or fell), because dividing by a small lift change
 *   gives a share that swings with the next session;
 *   the other way: "Body weight fell 4 lb while the lift rose: relative to body weight, +11.2%."
 */
import { PV_BODY_INTERPOLATION_GAP_DAYS, PV_BODY_NEAREST_READING_DAYS } from "../insightConfig";
import { monthYear } from "./display";
import type { ProgressSubject } from "./sessions";
import type { InBodyRow } from "@/types/inbody";
import { dayNumber, roundHalfAway, type ProgressVerdict } from "./verdict";

export interface BodyReading {
  /** YYYY-MM-DD */
  date: string;
  weightLb: number;
  /** Lean and fat mass, when the scan reports them. */
  leanLb?: number;
  fatLb?: number;
}

type Field = "weightLb" | "leanLb" | "fatLb";

/** A reading's value at a date by the rule above, or null. */
export function valueAt(date: string, readings: readonly BodyReading[], field: Field): number | null {
  const d = dayNumber(date);
  const series = readings.filter((r) => typeof r[field] === "number").sort((a, b) => (a.date < b.date ? -1 : 1));
  const exact = series.find((r) => r.date === date);
  if (exact) return exact[field] as number;
  const before = [...series].reverse().find((r) => dayNumber(r.date) < d);
  const after = series.find((r) => dayNumber(r.date) > d);
  if (before && after && dayNumber(after.date) - dayNumber(before.date) <= PV_BODY_INTERPOLATION_GAP_DAYS) {
    const f = (d - dayNumber(before.date)) / (dayNumber(after.date) - dayNumber(before.date));
    return (before[field] as number) + ((after[field] as number) - (before[field] as number)) * f;
  }
  let nearest: BodyReading | null = null;
  for (const r of series) if (!nearest || Math.abs(dayNumber(r.date) - d) < Math.abs(dayNumber(nearest.date) - d)) nearest = r;
  return nearest && Math.abs(dayNumber(nearest.date) - d) <= PV_BODY_NEAREST_READING_DAYS ? (nearest[field] as number) : null;
}

const MINUS = "−";
/** One decimal, a trailing ".0" dropped: 177, 181.6. */
const lb = (x: number): string => String(Number(x.toFixed(1)));
const signedLb = (x: number): string => `${x >= 0 ? "+" : MINUS}${lb(Math.abs(x))} lb`;
const signedPct = (x: number): string => `${x >= 0 ? "+" : MINUS}${Math.abs(x).toFixed(1)}%`;

export interface BodyContextLines {
  first: string;
  /** The sentence relating body weight to the lift, or null. */
  relation: string | null;
}

export interface BodyContextInput {
  subject: ProgressSubject;
  state: ProgressVerdict["state"] | "move-up";
  /** The verdict's change, in percent, or null for a move-up. */
  change: number | null;
  /** The two dates: the previous best and the recent best (a move-up: the last Scaled and the first RX session). */
  from: string;
  to: string;
  /** The recent and previous bests, for the relative figure. */
  bests: { previous: number; recent: number } | null;
}

/** The lines for one row, or null when there are no readings at all (no line and no placeholder). */
export function bodyContextLines(input: BodyContextInput, readings: readonly BodyReading[], bandLb: number): BodyContextLines | null {
  if (readings.length === 0) return null;
  const a = valueAt(input.from, readings, "weightLb");
  const b = valueAt(input.to, readings, "weightLb");
  if (a === null || b === null) {
    return { first: `No body weight within ${PV_BODY_NEAREST_READING_DAYS} days of ${monthYear(a === null ? input.from : input.to)}.`, relation: null };
  }
  const delta = b - a;
  if (Math.abs(delta) <= bandLb) return { first: `Body weight ${lb(a)} to ${lb(b)} lb, within normal scan variation.`, relation: null };

  const lean = [valueAt(input.from, readings, "leanLb"), valueAt(input.to, readings, "leanLb")];
  const fat = [valueAt(input.from, readings, "fatLb"), valueAt(input.to, readings, "fatLb")];
  const first =
    lean[0] !== null && lean[1] !== null && fat[0] !== null && fat[1] !== null
      ? `Body weight ${signedLb(delta)}: lean ${signedLb((lean[1] as number) - (lean[0] as number))}, fat ${signedLb((fat[1] as number) - (fat[0] as number))}.`
      : `Body weight ${lb(a)} to ${lb(b)} lb (${signedLb(delta)}) over the same span.`;

  let relation: string | null = null;
  const liftRelated = input.subject.kind === "lift" && input.state !== "not-tested-since" && input.state !== "move-up" && input.change !== null && input.change !== 0 && input.bests;
  if (liftRelated && input.change !== null && input.bests) {
    const massPct = roundHalfAway((delta / a) * 100, 1);
    const liftPct = input.change;
    if (massPct * liftPct > 0) {
      const share = (massPct / liftPct) * 100;
      if (share >= 100) relation = `Body weight ${delta > 0 ? "rose" : "fell"} at least as much as the lift (${signedPct(massPct)} vs ${signedPct(liftPct)}).`;
      else if (share > 75) relation = "Most of this change is body weight.";
      else if (share >= 25) relation = "About half of this change is body weight.";
      else relation = "A little of this change is body weight.";
    } else {
      const relative = roundHalfAway(((input.bests.recent / b) / (input.bests.previous / a) - 1) * 100, 1);
      relation = `Body weight ${delta > 0 ? "rose" : "fell"} ${Math.round(Math.abs(delta))} lb while the lift ${liftPct > 0 ? "rose" : "fell"}: relative to body weight, ${signedPct(relative)}.`;
    }
  }
  return { first, relation };
}

/** A reading as a scan row carrying only a weight, so the noise-band methods that read scans can be run over a pooled series. */
export function inbodyRowFromReading(r: BodyReading): InBodyRow {
  return {
    date: `${r.date.replaceAll("-", "")}120000`,
    "Weight(lb)": String(r.weightLb),
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
  };
}
