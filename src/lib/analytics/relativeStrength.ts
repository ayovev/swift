import dayjs, { type Dayjs } from "dayjs";
import { getBodyCompNoiseBands, isMeaningfulChange, readingsForMetric, type BodyCompNoiseBands } from "./bodyCompNoise";
import {
  RS_END_SEGMENT_SESSIONS,
  RS_MAX_INTERPOLATION_GAP_DAYS,
  RS_MAX_NEAREST_SCAN_DAYS,
  RS_MAX_REPS,
  RS_MIN_MATCHED_SESSIONS,
  RS_MIN_SCANS_IN_WINDOW,
  RS_MIN_SESSIONS,
  RS_WINDOW_DAYS,
} from "./insightConfig";
import { formatPercent } from "./formatting";
import { buildLiftSubjects, formatGateShortfall, TREND_THRESHOLD } from "./plateauDetector";
import { parseInBodyDate, parseWorkoutDate } from "./scanParsing";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";

/**
 * Separates "got stronger" from "got bigger". For each load-scored lift it
 * builds a per-session estimated 1RM series, divides it by the athlete's
 * body mass at the time (bodyweight, and lean mass where the export has it),
 * and attributes the change over a recent window to strength, to mass, or to
 * both.
 *
 * Reuses the Plateau Detector's lift grouping (`buildLiftSubjects`: same name
 * normalisation, same RX / Scaled split, Load-scored rows only — never WOD
 * scores) and its 1RM estimate (`estimateOneRepMax`), so a lift means the
 * same thing here as on the Plateaus tab. The only difference is the rep
 * cap: Plateaus tracks 1/2/3/5RM schemes, this accepts any scheme up to
 * `RS_MAX_REPS`, since a per-bodyweight trend wants every usable session.
 *
 * Body composition at a session date is the scan on that day, or a linear
 * interpolation between the scans on either side when they are close enough
 * together (`RS_MAX_INTERPOLATION_GAP_DAYS`), or the nearest scan when it is
 * near enough (`RS_MAX_NEAREST_SCAN_DAYS`). Otherwise the session is
 * `unmatched` — a body-comp value is never extrapolated past the scans.
 *
 * The change in body mass across the window is gated by the Phase 1 noise
 * band: a mass change inside normal scan variation is treated as no change,
 * so the summary never attributes a lift change to mass the scale can't
 * actually tell moved.
 *
 * Pure: raw rows in, a value out. Every threshold is in `insightConfig.ts`.
 */

export type BodyMatch = "exact" | "interpolated" | "nearest" | "unmatched";
export type StrengthAttribution = "strength-driven" | "mass-driven" | "mixed" | "flat" | "declined";

export interface RelativeStrengthPoint {
  date: string; // "YYYY-MM-DD"
  e1rm: number;
  perBodyweight: number | null;
  perLeanMass: number | null;
  bodyMatch: BodyMatch;
}

export interface LiftRelativeStrength {
  lift: string;
  rxStatus: "RX" | "SCALED";
  series: RelativeStrengthPoint[];
  /** "insufficient" lifts still carry their series so the raw chart can be drawn. */
  status: "ok" | "insufficient";
  attribution?: StrengthAttribution;
  /** Which normaliser the attribution used. */
  normalizedBy?: "lean mass" | "bodyweight";
  /** One plain sentence: what the attribution rests on, or which gate failed and by how much. */
  reason: string;
}

export interface RelativeStrengthResult {
  status: "ok" | "insufficient";
  /** Set when status is "insufficient". */
  reason?: string;
  lifts: LiftRelativeStrength[];
}

export interface RelativeStrengthOptions {
  asOfDate: Date;
  noiseBands?: BodyCompNoiseBands;
  maxReps?: number;
  windowDays?: number;
  minSessions?: number;
  minMatchedSessions?: number;
  minScansInWindow?: number;
  maxInterpolationGapDays?: number;
  maxNearestScanDays?: number;
  endSegmentSessions?: number;
}

interface Reading {
  date: Dayjs;
  value: number;
}

interface Matched {
  value: number;
  match: Exclude<BodyMatch, "unmatched">;
}

function dayDiff(a: Dayjs, b: Dayjs): number {
  return a.startOf("day").diff(b.startOf("day"), "day");
}

/** `readings` must be sorted ascending by date. */
function matchReading(date: Dayjs, readings: Reading[], maxGap: number, maxNearest: number): Matched | null {
  let prev: Reading | undefined;
  let next: Reading | undefined;
  for (const r of readings) {
    if (dayDiff(r.date, date) <= 0) prev = r;
    else {
      next = r;
      break;
    }
  }
  if (prev && dayDiff(prev.date, date) === 0) return { value: prev.value, match: "exact" };
  if (prev && next) {
    const span = dayDiff(next.date, prev.date);
    if (span <= maxGap) {
      const t = dayDiff(date, prev.date) / span;
      return { value: prev.value + (next.value - prev.value) * t, match: "interpolated" };
    }
  }
  const candidates = [prev, next].filter((r): r is Reading => r !== undefined);
  if (candidates.length === 0) return null;
  const nearest = candidates.reduce((a, b) => (Math.abs(dayDiff(a.date, date)) <= Math.abs(dayDiff(b.date, date)) ? a : b));
  return Math.abs(dayDiff(nearest.date, date)) <= maxNearest ? { value: nearest.value, match: "nearest" } : null;
}

const round = (x: number) => Math.round(x);
const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

function insufficient(base: Omit<LiftRelativeStrength, "status" | "reason">, reason: string): LiftRelativeStrength {
  return { ...base, status: "insufficient", reason };
}

export function getRelativeStrength(
  workouts: SugarWodRow[],
  scans: InBodyRow[],
  options: RelativeStrengthOptions
): RelativeStrengthResult {
  const asOf = dayjs(options.asOfDate);
  const windowDays = options.windowDays ?? RS_WINDOW_DAYS;
  const minSessions = options.minSessions ?? RS_MIN_SESSIONS;
  const minMatched = options.minMatchedSessions ?? RS_MIN_MATCHED_SESSIONS;
  const minScans = options.minScansInWindow ?? RS_MIN_SCANS_IN_WINDOW;
  const maxGap = options.maxInterpolationGapDays ?? RS_MAX_INTERPOLATION_GAP_DAYS;
  const maxNearest = options.maxNearestScanDays ?? RS_MAX_NEAREST_SCAN_DAYS;
  const endSegment = options.endSegmentSessions ?? RS_END_SEGMENT_SESSIONS;

  const parsedWorkouts = workouts
    .map((raw) => ({ raw, date: parseWorkoutDate(raw.date) }))
    .filter((w) => w.date.isValid() && !w.date.isAfter(asOf, "day"));
  const usableScans = scans.filter((raw) => {
    const d = parseInBodyDate(raw.date);
    return d.isValid() && !d.isAfter(asOf, "day");
  });

  const candidates = buildLiftSubjects(parsedWorkouts, { maxReps: options.maxReps ?? RS_MAX_REPS });
  if (candidates.length === 0) {
    return { status: "insufficient", reason: "no lift with a logged load and a stated rep scheme", lifts: [] };
  }

  const bands = options.noiseBands ?? getBodyCompNoiseBands(usableScans);
  const weightReadings = readingsForMetric(usableScans, "weight");
  const leanReadings = readingsForMetric(usableScans, "leanMass");
  const windowStart = asOf.subtract(windowDays, "day");

  const lifts: LiftRelativeStrength[] = candidates.map((candidate) => {
    // One point per date: the best estimate that day.
    const bestByDate = new Map<string, { date: Dayjs; value: number }>();
    for (const e of candidate.entries) {
      const key = e.date.format("YYYY-MM-DD");
      const cur = bestByDate.get(key);
      if (!cur || e.value > cur.value) bestByDate.set(key, { date: e.date, value: e.value });
    }
    const sessions = [...bestByDate.values()].sort((a, b) => a.date.valueOf() - b.date.valueOf());

    const series: RelativeStrengthPoint[] = sessions.map((s) => {
      const w = matchReading(s.date, weightReadings, maxGap, maxNearest);
      const l = matchReading(s.date, leanReadings, maxGap, maxNearest);
      return {
        date: s.date.format("YYYY-MM-DD"),
        e1rm: s.value,
        perBodyweight: w ? s.value / w.value : null,
        perLeanMass: l ? s.value / l.value : null,
        bodyMatch: w?.match ?? l?.match ?? "unmatched",
      };
    });

    const base = { lift: candidate.subject.name, rxStatus: candidate.subject.status as "RX" | "SCALED", series };

    const inWindow = series.filter((p) => !dayjs(p.date).isBefore(windowStart, "day"));
    if (inWindow.length < minSessions) {
      return insufficient(
        base,
        formatGateShortfall(
          inWindow.length,
          minSessions,
          `logged session in the last ${windowDays} days`,
          `logged sessions in the last ${windowDays} days`
        )
      );
    }

    const first = dayjs(inWindow[0]!.date);
    const last = dayjs(inWindow[inWindow.length - 1]!.date);
    const scansInWindow = usableScans.filter((s) => {
      const d = parseInBodyDate(s.date);
      return !d.isBefore(first, "day") && !d.isAfter(last, "day");
    }).length;
    if (scansInWindow < minScans) {
      return insufficient(
        base,
        formatGateShortfall(scansInWindow, minScans, "InBody scan in this lift's window", "InBody scans in this lift's window")
      );
    }

    // Prefer lean mass; use bodyweight when too few sessions have a lean match.
    const withLean = inWindow.filter((p) => p.perLeanMass !== null);
    const withWeight = inWindow.filter((p) => p.perBodyweight !== null);
    const useLean = withLean.length >= minMatched;
    const matched = useLean ? withLean : withWeight;
    if (matched.length < minMatched) {
      return insufficient(
        base,
        formatGateShortfall(
          matched.length,
          minMatched,
          "session with a matching InBody reading",
          "sessions with a matching InBody reading"
        )
      );
    }

    const normalizedBy = useLean ? "lean mass" : "bodyweight";
    const norm = (p: RelativeStrengthPoint) => (useLean ? p.perLeanMass! : p.perBodyweight!);
    // Body mass at each session, recovered from e1rm / (e1rm per mass).
    const mass = (p: RelativeStrengthPoint) => p.e1rm / norm(p);

    const k = Math.max(1, Math.min(endSegment, Math.floor(matched.length / 2)));
    const startSeg = matched.slice(0, k);
    const endSeg = matched.slice(-k);
    const rawStart = mean(startSeg.map((p) => p.e1rm));
    const rawEnd = mean(endSeg.map((p) => p.e1rm));
    const normStart = mean(startSeg.map(norm));
    const normEnd = mean(endSeg.map(norm));
    const massStart = mean(startSeg.map(mass));
    const massEnd = mean(endSeg.map(mass));

    const rawChange = (rawEnd - rawStart) / rawStart;
    const normChange = (normEnd - normStart) / normStart;
    const massDelta = massEnd - massStart;
    const band = (useLean ? bands.leanMass : bands.weight).band;
    const massMoved = isMeaningfulChange(massDelta, band);

    const massLabel = useLean ? "Lean mass" : "Bodyweight";
    const rawText = `${round(rawStart)} to ${round(rawEnd)}`;
    let attribution: StrengthAttribution;
    let reason: string;
    if (rawChange >= TREND_THRESHOLD) {
      const massUp = massMoved && massDelta > 0;
      if (!massUp) {
        attribution = "strength-driven";
        reason = massMoved
          ? `Estimated 1RM up ${formatPercent(rawChange)} (${rawText}) while ${massLabel.toLowerCase()} fell ${round1(Math.abs(massDelta))} lb.`
          : `Estimated 1RM up ${formatPercent(rawChange)} (${rawText}) while ${massLabel.toLowerCase()} stayed within normal scan variation.`;
      } else if (normChange >= TREND_THRESHOLD) {
        attribution = "mixed";
        reason = `Estimated 1RM up ${formatPercent(rawChange)} (${rawText}); per ${normalizedBy === "lean mass" ? "lb of lean mass" : "lb of bodyweight"} it is up ${formatPercent(normChange)}, and ${massLabel.toLowerCase()} rose ${round1(massDelta)} lb.`;
      } else {
        attribution = "mass-driven";
        reason = `Estimated 1RM up ${formatPercent(rawChange)} (${rawText}), but ${massLabel.toLowerCase()} rose ${round1(massDelta)} lb; per ${normalizedBy === "lean mass" ? "lb of lean mass" : "lb of bodyweight"} the change is ${normChange >= 0 ? "up" : "down"} ${formatPercent(normChange)}.`;
      }
    } else if (rawChange <= -TREND_THRESHOLD) {
      attribution = "declined";
      reason = `Estimated 1RM down ${formatPercent(rawChange)} (${rawText}).`;
    } else {
      attribution = "flat";
      reason = `Estimated 1RM within ${formatPercent(TREND_THRESHOLD)} (${rawText}).`;
    }

    return { ...base, status: "ok" as const, attribution, normalizedBy, reason };
  });

  const ok = lifts.filter((l) => l.status === "ok").length;
  if (ok === 0) {
    return {
      status: "insufficient",
      reason:
        usableScans.length === 0
          ? "no InBody scans to normalise against"
          : "no lift has enough sessions and matching scans in the last year yet",
      lifts,
    };
  }
  return { status: "ok", lifts };
}
