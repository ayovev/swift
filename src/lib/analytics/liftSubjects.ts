import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { NAMED_BENCHMARKS, toTitleCase } from "./buildDashboardData";
import { parseRepMax, repMaxCategory } from "./repMax";
import { parseNumericField } from "./scanParsing";

import type { SugarWodRow } from "@/types/dashboard";

dayjs.extend(customParseFormat);

/**
 * Score direction per named benchmark. `score_type` is unreliable for these
 * (blank for Grace/Nancy in the real export despite both being time-based),
 * so this is a maintained lookup instead. All ten are time-based
 * (lower_better) except Cindy, a 20-minute AMRAP scored rounds+reps
 * (higher_better) — confirmed against the sample export, where
 * `best_result_raw` is encoded as "16.015" (16 rounds, 15 reps): a plain
 * float parse, larger is better.
 */
const BENCHMARK_SCORE_DIRECTION: Record<(typeof NAMED_BENCHMARKS)[number], ScoreDirection> = {
  FRAN: "lower_better",
  GRACE: "lower_better",
  MURPH: "lower_better",
  HELEN: "lower_better",
  DIANE: "lower_better",
  NANCY: "lower_better",
  ANNIE: "lower_better",
  JACKIE: "lower_better",
  KAREN: "lower_better",
  CINDY: "higher_better",
};

/** Which lift or benchmark an entry list is for. */
export interface LiftSubject {
  type: "lift" | "benchmark_wod";
  /** Display name, e.g. "Back Squat", "Grace". */
  name: string;
  status: "RX" | "SCALED";
}

type ScoreDirection = "lower_better" | "higher_better";

export interface DatedValue {
  date: Dayjs;
  value: number;
}

export interface SubjectCandidate {
  subject: LiftSubject;
  entries: DatedValue[];
  scoreDirection: ScoreDirection;
  valueKind: "raw" | "estimated_1rm";
}

/**
 * Estimates a 1-rep max for a Load-scored lift entry, so entries logged
 * under different rep schemes (a 1RM day vs. a 5RM day) become comparable —
 * comparing raw weights directly would misread a rep-scheme change as a
 * performance change. Only the four rep-max schemes SugarWOD athletes
 * actually track (1/2/3/5RM, per `repMaxCategory`) are normalized; a
 * schemeless entry or one with a known-but-untracked rep count (e.g. a 4RM)
 * is excluded entirely rather than guessed. Averages the Epley and Brzycki
 * formulas — neither is demonstrably more accurate in general, and they
 * diverge enough at low rep counts (3-4 percentage points at 2/3/5 reps) to
 * matter against the trend threshold below, so averaging hedges against
 * either formula's specific bias rather than committing to one. A true
 * 1-rep max (reps === 1) needs no estimating and is used as-is.
 */
function estimateLiftValue(raw: SugarWodRow, maxReps?: number): number | null {
  const rawValue = parseNumericField(raw.best_result_raw);
  if (rawValue === null) return null;

  const reps = parseRepMax(`${raw.title ?? ""} ${raw.description ?? ""}`);
  if (reps === null) return null;
  // Default: only the four tracked schemes. `maxReps` (relative strength)
  // widens that to any scheme up to a cap — high-rep estimates are unreliable.
  if (maxReps === undefined ? repMaxCategory(reps) === "other" : reps < 1 || reps > maxReps) return null;
  return estimateOneRepMax(rawValue, reps);
}

/**
 * Average of Epley and Brzycki (see `estimateLiftValue`). Shared by the
 * the progress verdict so every view estimates a lift's 1RM the
 * same way. A single (reps === 1) is used as-is.
 */
export function estimateOneRepMax(load: number, reps: number): number {
  if (reps === 1) return load;
  const epley = load * (1 + reps / 30);
  const brzycki = (load * 36) / (37 - reps);
  return (epley + brzycki) / 2;
}

/** Strips exactly one trailing "s" so "Deadlift"/"Deadlifts" group together. */
function normalizeLiftName(s: string): string {
  return s.trim().toLowerCase().replace(/s$/, "");
}

/** Matches the codebase's existing `titleNorm` convention (exact-equality, not substring). */
function normalizeTitle(s: string): string {
  return (s ?? "").trim().toUpperCase();
}

interface LiftGroup {
  /** Original casing, e.g. "Back Squat", kept for display. */
  displayName: string;
  rows: { date: Dayjs; raw: SugarWodRow }[];
}

/**
 * Groups Load-scored lift entries by normalized name, folding in freeform
 * title matches (e.g. a "FRONT SQUAT" title with no barbell_lift tag) into
 * an already-known lift — never inventing a new lift subject from a title
 * match alone. Splits each lift by rx_or_scaled, since LiftSubject.status
 * applies to lifts the same way it applies to benchmarks.
 *
 * Exported so the progress verdict (`insights/sessions.ts`) and its
 * parity test share one subject-building rule instead of two that could drift.
 */
export function buildLiftSubjects(
  workouts: { date: Dayjs; raw: SugarWodRow }[],
  options: { maxReps?: number } = {}
): SubjectCandidate[] {
  const groups = new Map<string, LiftGroup>();

  for (const w of workouts) {
    if (w.raw.score_type !== "Load") continue;
    const liftRaw = (w.raw.barbell_lift ?? "").trim();
    if (!liftRaw) continue;
    const key = normalizeLiftName(liftRaw);
    const group = groups.get(key);
    if (group) group.rows.push(w);
    else groups.set(key, { displayName: liftRaw, rows: [w] });
  }

  for (const w of workouts) {
    if (w.raw.score_type !== "Load") continue;
    if ((w.raw.barbell_lift ?? "").trim()) continue; // already covered above
    const key = normalizeLiftName(w.raw.title ?? "");
    const group = groups.get(key);
    if (group) group.rows.push(w);
  }

  const candidates: SubjectCandidate[] = [];
  for (const group of groups.values()) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: DatedValue[] = [];
      for (const w of group.rows) {
        if (w.raw.rx_or_scaled !== status) continue;
        const value = estimateLiftValue(w.raw, options.maxReps);
        if (value !== null) entries.push({ date: w.date, value });
      }
      if (entries.length === 0) continue;
      candidates.push({
        subject: { type: "lift", name: group.displayName, status },
        entries,
        scoreDirection: "higher_better",
        valueKind: "estimated_1rm",
      });
    }
  }
  return candidates;
}

/**
 * Matches only an exact-uppercased-title equality against the named
 * benchmark allowlist — deliberately not the substring-based classify engine
 * (`matcher.ts`), since the sample data has "HEAVY GRACE" and "JUMPING
 * NANCY" entries that are materially different, heavier/harder workouts a
 * substring match would wrongly conflate with Grace/Nancy.
 *
 */
export function buildBenchmarkSubjects(workouts: { date: Dayjs; raw: SugarWodRow }[]): SubjectCandidate[] {
  const candidates: SubjectCandidate[] = [];
  for (const name of NAMED_BENCHMARKS) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: DatedValue[] = [];
      for (const w of workouts) {
        if (normalizeTitle(w.raw.title) !== name || w.raw.rx_or_scaled !== status) continue;
        const value = parseNumericField(w.raw.best_result_raw);
        if (value !== null) entries.push({ date: w.date, value });
      }
      if (entries.length === 0) continue;
      candidates.push({
        subject: { type: "benchmark_wod", name: toTitleCase(name), status },
        entries,
        scoreDirection: BENCHMARK_SCORE_DIRECTION[name],
        valueKind: "raw",
      });
    }
  }
  return candidates;
}
