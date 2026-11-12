/**
 * Sessions and subjects for the progress verdict (verdict.ts, headline.ts).
 *
 * A **subject** is one lift or one named benchmark, with RX and Scaled kept separate. A **session** is one subject on one calendar day;
 * several entries the same day collapse to the best. A lift's value is its estimated 1RM (the average of Epley and Brzycki, a single
 * used as-is, via `estimateOneRepMax`); a benchmark's value is its raw score, with its direction. Any rep scheme from 1 to `PV_MAX_REPS`
 * counts, where the old rule allowed only 1, 2, 3 and 5.
 *
 * Lifts are grouped here and not with `buildLiftSubjects`, because A1 needs per-entry facts that builder drops (whether a session names
 * an explicit rep max or a ladder, and the reason each Load row went unused). `tests/progressVerdict.test.ts` pins that both produce
 * the same entries on the bundled sample, so the grouping rules cannot drift. Benchmarks come from `buildBenchmarkSubjects` unchanged.
 *
 * SugarWOD's own PR flag is deliberately not read: 22% of the sample's lift sessions carry it, because it flags a best at any new title
 * or rep scheme, so as an "up" signal it turned 11 of 12 subjects up.
 */
import { buildBenchmarkSubjects, estimateOneRepMax } from "../liftSubjects";
import { PV_MAX_REPS } from "../insightConfig";
import { parseRepMax } from "../repMax";
import { REPS_PER_ROUND, parseRoundsReps } from "./roundsReps";
import { parseNumericField, parseWorkoutDate } from "../scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";

export type SubjectStatus = "RX" | "SCALED";

export interface ProgressSession {
  /** YYYY-MM-DD */
  date: string;
  /** Estimated 1RM (lb) for a lift, the raw score for a benchmark. */
  value: number;
  /** The workout's title or description names an explicit rep max ("3RM") or a rep ladder. A benchmark is always one. */
  maxEffort: boolean;
  /** SugarWOD's own display of the score ("14:37", "17+20"), for a benchmark. */
  display?: string;
  /**
   * For a lift, the set the estimate was made from (`value` is its estimated 1RM): so the words can say "from 225 × 5" and never
   * leave an estimate reading as a load that was lifted.
   */
  logged?: { load: number; reps: number };
}

export interface ProgressSubject {
  /** "back squat|RX" */
  key: string;
  /** The movement without its status, lowercased: "back squat". RX and Scaled of one movement share it. */
  movement: string;
  /** Display name without the status, "Back Squat". */
  name: string;
  status: SubjectStatus;
  kind: "lift" | "benchmark";
  /** How a value is shown: pounds, a clock time, or rounds and reps. */
  format: "load" | "time" | "rounds-reps";
  lowerIsBetter: boolean;
  /** One per day, ascending. */
  sessions: ProgressSession[];
  /** Every usable entry before the same-day collapse, ascending. */
  entries: ProgressSession[];
}

/** Why Load rows went unused, one reason each, in the order the spec reports them. */
export interface UnusedLoadRows {
  loadRows: number;
  used: number;
  noValue: number;
  noScheme: number;
  outsideRange: number;
  noLiftNamed: number;
  neitherStatus: number;
}

export { REPS_PER_ROUND, parseRoundsReps };

function roundsRepsTotal(display: string, repsPerRound: number): number | null {
  const rr = parseRoundsReps(display);
  return rr ? rr.rounds * repsPerRound + rr.reps : null;
}

const EXPLICIT_RM = /(\d+)\s*-?\s*rm\b/i;
const LADDER = /\d+(?:-\d+){2,}/;

/** A session whose text names an explicit rep max or a rep ladder (not the "5x3" shorthand `parseRepMax` also reads). */
export function isMaxEffort(text: string): boolean {
  return EXPLICIT_RM.test(text) || LADDER.test(text);
}

const normalizeLiftName = (s: string): string => s.trim().toLowerCase().replace(/s$/, "");

function better(a: ProgressSession, b: ProgressSession, lower: boolean): ProgressSession {
  if (a.value === b.value) return a;
  return lower ? (a.value < b.value ? a : b) : a.value > b.value ? a : b;
}

/** One session per day: the best value, and a max effort if any entry that day was. */
function collapse(entries: ProgressSession[], lower: boolean): ProgressSession[] {
  const byDay = new Map<string, ProgressSession>();
  for (const e of entries) {
    const have = byDay.get(e.date);
    const chosen = have ? better(have, e, lower) : e;
    byDay.set(e.date, { ...chosen, maxEffort: (have?.maxEffort ?? false) || e.maxEffort });
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function buildProgressSubjects(rows: readonly SugarWodRow[]): { subjects: ProgressSubject[]; unused: UnusedLoadRows } {
  const unused: UnusedLoadRows = { loadRows: 0, used: 0, noValue: 0, noScheme: 0, outsideRange: 0, noLiftNamed: 0, neitherStatus: 0 };
  const dated = rows.flatMap((raw) => {
    const date = parseWorkoutDate(raw.date);
    return date.isValid() ? [{ date, raw }] : [];
  });

  // Group by the normalized barbell_lift, then fold in title matches of an already-known lift (never inventing a lift from a title alone).
  const groups = new Map<string, { displayName: string; rows: SugarWodRow[] }>();
  const grouped = new Set<SugarWodRow>();
  for (const w of dated) {
    if (w.raw.score_type !== "Load") continue;
    const lift = (w.raw.barbell_lift ?? "").trim();
    if (!lift) continue;
    const key = normalizeLiftName(lift);
    const group = groups.get(key);
    if (group) group.rows.push(w.raw);
    else groups.set(key, { displayName: lift, rows: [w.raw] });
    grouped.add(w.raw);
  }
  for (const w of dated) {
    if (w.raw.score_type !== "Load" || (w.raw.barbell_lift ?? "").trim()) continue;
    const group = groups.get(normalizeLiftName(w.raw.title ?? ""));
    if (group) {
      group.rows.push(w.raw);
      grouped.add(w.raw);
    }
  }

  for (const w of dated) {
    if (w.raw.score_type !== "Load") continue;
    unused.loadRows++;
    const reps = parseRepMax(`${w.raw.title ?? ""} ${w.raw.description ?? ""}`);
    if (parseNumericField(w.raw.best_result_raw) === null) unused.noValue++;
    else if (reps === null) unused.noScheme++;
    else if (reps < 1 || reps > PV_MAX_REPS) unused.outsideRange++;
    else if (!grouped.has(w.raw)) unused.noLiftNamed++;
    else if (w.raw.rx_or_scaled !== "RX" && w.raw.rx_or_scaled !== "SCALED") unused.neitherStatus++;
    else unused.used++;
  }

  const subjects: ProgressSubject[] = [];
  for (const group of groups.values()) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: ProgressSession[] = [];
      for (const raw of group.rows) {
        if (raw.rx_or_scaled !== status) continue;
        const value = parseNumericField(raw.best_result_raw);
        const text = `${raw.title ?? ""} ${raw.description ?? ""}`;
        const reps = parseRepMax(text);
        if (value === null || reps === null || reps < 1 || reps > PV_MAX_REPS) continue;
        entries.push({ date: parseWorkoutDate(raw.date).format("YYYY-MM-DD"), value: estimateOneRepMax(value, reps), maxEffort: isMaxEffort(text), logged: { load: value, reps } });
      }
      if (entries.length === 0) continue;
      entries.sort((a, b) => (a.date < b.date ? -1 : 1));
      const movement = normalizeLiftName(group.displayName);
      subjects.push({ key: `${movement}|${status}`, movement, name: group.displayName, status, kind: "lift", format: "load", lowerIsBetter: false, sessions: collapse(entries, false), entries });
    }
  }

  for (const candidate of buildBenchmarkSubjects(dated)) {
    const lower = candidate.scoreDirection === "lower_better";
    const movement = candidate.subject.name.toLowerCase();
    const repsPerRound = lower ? null : (REPS_PER_ROUND[movement] ?? null);
    const displays = new Map<string, string>();
    for (const w of dated) {
      if (w.raw.title.trim().toUpperCase() === movement.toUpperCase() && w.raw.rx_or_scaled === candidate.subject.status) {
        displays.set(`${w.date.format("YYYY-MM-DD")}|${parseNumericField(w.raw.best_result_raw)}`, w.raw.best_result_display);
      }
    }
    const entries = candidate.entries
      .map((e) => {
        const date = e.date.format("YYYY-MM-DD");
        const display = displays.get(`${date}|${e.value}`);
        // Rounds + Reps are read from the display ("17+20"), never from the raw float, whose encoding varies; with a known number of
        // reps per round the value is the total reps so a verdict compares like with like.
        const total = repsPerRound && display ? roundsRepsTotal(display, repsPerRound) : null;
        return { date, value: total ?? e.value, maxEffort: true, ...(display ? { display } : {}) };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const format = lower ? "time" : "rounds-reps";
    subjects.push({ key: `${movement}|${candidate.subject.status}`, movement, name: candidate.subject.name, status: candidate.subject.status, kind: "benchmark", format, lowerIsBetter: lower, sessions: collapse(entries, lower), entries });
  }
  return { subjects, unused };
}
