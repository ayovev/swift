/**
 * Reference implementation of the A1 rules (docs/insights-a1-spec.md), written so the rules can be run against a real export
 * before anything is built in the app. It is a development tool: pure functions, no I/O, no network.
 *
 * It reuses the app's own parsing and estimator (`estimateOneRepMax`, `parseRepMax`, `buildBenchmarkSubjects`) so the
 * normalization cannot drift. It does not reuse `buildLiftSubjects`, because that builder drops the per-entry facts A1 needs
 * (max effort, the reasons a row is unused). `tests/realExportCheck.test.ts` pins that this builder produces the same entries as
 * `buildLiftSubjects` on the bundled sample, so the two stay in step.
 */
import { buildBenchmarkSubjects, estimateOneRepMax } from "@/lib/analytics/plateauDetector";
import { parseRepMax } from "@/lib/analytics/repMax";
import { parseNumericField, parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";

/** Thresholds, all tunable in the spec. */
export const A1 = {
  minPerSide: 3,
  maxWindow: 4,
  changeThreshold: 5,
  recordMargin: 2,
  recentDays: 365,
  maxReps: 8,
} as const;

export type Status = "RX" | "SCALED";
export type State = "up" | "down" | "not-tested-since" | "no-clear-change";

export interface Session {
  date: string; // YYYY-MM-DD
  value: number; // estimated 1RM (lb) for a lift, the raw score for a benchmark
  maxEffort: boolean;
}

export interface Subject {
  /** "back squat|RX" */
  key: string;
  name: string;
  status: Status;
  kind: "lift" | "benchmark";
  lowerIsBetter: boolean;
  /** One per day, ascending. */
  sessions: Session[];
  /** Every entry before the same-day collapse, ascending. */
  entries: Session[];
}

export interface Unused {
  loadRows: number;
  used: number;
  noLiftNamed: number;
  noValue: number;
  noScheme: number;
  outsideRange: number;
  neitherStatus: number;
  badDate: number;
}

export interface Verdict {
  state: State;
  /** Signed so that better is positive, rounded half away from zero to one decimal. */
  change: number;
  n: number;
  window: number;
  previousBest: Session;
  recentBest: Session;
  record: boolean;
  previous: Session[];
  recent: Session[];
}

/** Round half away from zero to `digits` places. */
export function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return (Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5)) / f;
}

export function dayNumber(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
}

const EXPLICIT_RM = /(\d+)\s*-?\s*rm\b/i;
const LADDER = /\d+(?:-\d+){2,}/;
/** A session naming an explicit rep max or a rep ladder (not the "5x3" shorthand). */
export function isMaxEffort(text: string): boolean {
  return EXPLICIT_RM.test(text) || LADDER.test(text);
}

const normalizeLiftName = (s: string): string => s.trim().toLowerCase().replace(/s$/, "");

function better(a: Session, b: Session, lower: boolean): Session {
  if (a.value === b.value) return a;
  return lower ? (a.value < b.value ? a : b) : a.value > b.value ? a : b;
}

/** One session per day: the best value; it is a max effort if any entry that day was. */
function collapse(entries: Session[], lower: boolean): Session[] {
  const byDay = new Map<string, Session>();
  for (const e of entries) {
    const have = byDay.get(e.date);
    const chosen = have ? better(have, e, lower) : e;
    byDay.set(e.date, { ...chosen, maxEffort: (have?.maxEffort ?? false) || e.maxEffort });
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function buildSubjects(rows: readonly SugarWodRow[]): { subjects: Subject[]; unused: Unused } {
  const unused: Unused = { loadRows: 0, used: 0, noLiftNamed: 0, noValue: 0, noScheme: 0, outsideRange: 0, neitherStatus: 0, badDate: 0 };
  const dated = rows.flatMap((raw) => {
    const d = parseWorkoutDate(raw.date);
    if (!d.isValid()) {
      if (raw.score_type === "Load") unused.badDate++;
      return [];
    }
    return [{ date: d, raw }];
  });

  // Lifts: group by the normalized barbell_lift, then fold in title matches of an already-known lift.
  const groups = new Map<string, { displayName: string; rows: SugarWodRow[] }>();
  const groupOf = new Map<SugarWodRow, string>();
  for (const w of dated) {
    if (w.raw.score_type !== "Load") continue;
    const lift = (w.raw.barbell_lift ?? "").trim();
    if (!lift) continue;
    const key = normalizeLiftName(lift);
    const g = groups.get(key);
    if (g) g.rows.push(w.raw);
    else groups.set(key, { displayName: lift, rows: [w.raw] });
    groupOf.set(w.raw, key);
  }
  for (const w of dated) {
    if (w.raw.score_type !== "Load" || (w.raw.barbell_lift ?? "").trim()) continue;
    const key = normalizeLiftName(w.raw.title ?? "");
    const g = groups.get(key);
    if (g) { g.rows.push(w.raw); groupOf.set(w.raw, key); }
  }

  // Unused weight entries, one reason each, in the order the spec reports them: no readable scheme, outside 1 to 8, no lift named.
  for (const w of dated) {
    if (w.raw.score_type !== "Load") continue;
    unused.loadRows++;
    const reps = parseRepMax(`${w.raw.title ?? ""} ${w.raw.description ?? ""}`);
    if (parseNumericField(w.raw.best_result_raw) === null) unused.noValue++;
    else if (reps === null) unused.noScheme++;
    else if (reps < 1 || reps > A1.maxReps) unused.outsideRange++;
    else if (!groupOf.has(w.raw)) unused.noLiftNamed++;
    else if (w.raw.rx_or_scaled !== "RX" && w.raw.rx_or_scaled !== "SCALED") unused.neitherStatus++;
    else unused.used++;
  }
  unused.loadRows += unused.badDate;

  const subjects: Subject[] = [];
  for (const g of groups.values()) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: Session[] = [];
      for (const raw of g.rows) {
        if (raw.rx_or_scaled !== status) continue;
        const value = parseNumericField(raw.best_result_raw);
        const text = `${raw.title ?? ""} ${raw.description ?? ""}`;
        const reps = parseRepMax(text);
        if (value === null || reps === null || reps < 1 || reps > A1.maxReps) continue;
        entries.push({ date: parseWorkoutDate(raw.date).format("YYYY-MM-DD"), value: estimateOneRepMax(value, reps), maxEffort: isMaxEffort(text) });
      }
      if (entries.length === 0) continue;
      entries.sort((a, b) => (a.date < b.date ? -1 : 1));
      subjects.push({ key: `${normalizeLiftName(g.displayName)}|${status}`, name: g.displayName, status, kind: "lift", lowerIsBetter: false, sessions: collapse(entries, false), entries });
    }
  }

  // Benchmarks: the app's own builder (exact title match against the named list).
  for (const c of buildBenchmarkSubjects(dated)) {
    const lower = c.scoreDirection === "lower_better";
    const entries = c.entries.map((e) => ({ date: e.date.format("YYYY-MM-DD"), value: e.value, maxEffort: true })).sort((a, b) => (a.date < b.date ? -1 : 1));
    subjects.push({ key: `${c.subject.name.toLowerCase()}|${c.subject.status}`, name: c.subject.name, status: c.subject.status, kind: "benchmark", lowerIsBetter: lower, sessions: collapse(entries, lower), entries });
  }
  return { subjects, unused };
}

export function bestOf(sessions: readonly Session[], lower: boolean): Session {
  let best = sessions[0] as Session;
  for (const s of sessions) if (lower ? s.value < best.value : s.value > best.value) best = s;
  return best;
}

/** Judges two windows. `earlier` is every session before the recent window (for the record rule). */
export function judge(previous: readonly Session[], recent: readonly Session[], earlier: readonly Session[], lower: boolean, kind: "lift" | "benchmark"): Verdict {
  const previousBest = bestOf(previous, lower);
  const recentBest = bestOf(recent, lower);
  const sign = lower ? -1 : 1;
  const change = round(((recentBest.value - previousBest.value) / previousBest.value) * sign * 100, 1);
  const beforeRecent = bestOf(earlier, lower);
  const record = round(((recentBest.value - beforeRecent.value) / beforeRecent.value) * sign * 100, 1) >= A1.recordMargin;
  let state: State;
  if (change >= A1.changeThreshold || record) state = "up";
  else if (change <= -A1.changeThreshold) state = kind === "benchmark" || recent.some((s) => s.maxEffort) ? "down" : "not-tested-since";
  else state = "no-clear-change";
  return { state, change, n: previous.length + recent.length, window: recent.length, previousBest, recentBest, record, previous: [...previous], recent: [...recent] };
}

/** The A1 verdict, or null with fewer than 6 sessions. */
export function verdictOf(sessions: readonly Session[], lower: boolean, kind: "lift" | "benchmark"): Verdict | null {
  const n = sessions.length;
  if (n < 2 * A1.minPerSide) return null;
  const window = Math.min(A1.maxWindow, Math.floor(n / 2));
  const v = judge(sessions.slice(n - 2 * window, n - window), sessions.slice(n - window), sessions.slice(0, n - window), lower, kind);
  return { ...v, n };
}

export interface MoveUp {
  name: string;
  date: string;
  scaledBefore: number;
}

/** RX sessions whose most recent earlier session of the same name was Scaled. Same-day mixes make no move. */
export function findMoveUps(subjects: readonly Subject[]): Map<string, MoveUp> {
  const byName = new Map<string, Subject[]>();
  for (const s of subjects) byName.set(`${s.kind}:${s.name.toLowerCase()}`, [...(byName.get(`${s.kind}:${s.name.toLowerCase()}`) ?? []), s]);
  const out = new Map<string, MoveUp>();
  for (const group of byName.values()) {
    const rx = group.find((g) => g.status === "RX");
    const sc = group.find((g) => g.status === "SCALED");
    if (!rx || !sc) continue;
    let latest: MoveUp | null = null;
    for (const r of rx.sessions) {
      const earlier = [...rx.sessions.filter((x) => x.date < r.date).map((x) => ({ ...x, st: "RX" })), ...sc.sessions.filter((x) => x.date < r.date).map((x) => ({ ...x, st: "SC" }))].sort((a, b) => (a.date < b.date ? -1 : 1));
      const prev = earlier[earlier.length - 1];
      if (!prev || prev.st !== "SC") continue;
      if (sc.sessions.some((x) => x.date === r.date)) continue;
      latest = { name: rx.name, date: r.date, scaledBefore: sc.sessions.filter((x) => x.date < r.date).length };
    }
    if (latest) out.set(rx.key, latest);
  }
  return out;
}

export type Group = "up" | "down" | "not-tested-since" | "no-clear-change" | "few" | "not-recent";

export interface Row {
  subject: Subject;
  group: Group;
  verdict: Verdict | null;
  moveUp: MoveUp | null;
  latest: string;
  daysSinceLatest: number;
}

export interface Headline {
  label: "Improving" | "Steady" | "Declining" | null;
  up: number;
  down: number;
  noClearChange: number;
  counted: number;
  moveUps: number;
  leftOut: { under6: number; notRecent: number; notTested: number };
  sentence: string;
}

export function labelOf(up: number, down: number, counted: number): "Improving" | "Steady" | "Declining" | null {
  if (counted < 3) return null;
  if (4 * (up - down) >= counted && 3 * up >= counted) return "Improving";
  if (4 * (down - up) >= counted && 3 * down >= counted) return "Declining";
  return "Steady";
}

export function classify(subjects: readonly Subject[], asOf: string): { rows: Row[]; headline: Headline } {
  const moves = findMoveUps(subjects);
  const rows: Row[] = [];
  let up = 0, down = 0, nc = 0, moveUps = 0, under6 = 0, notRecent = 0, notTested = 0;
  for (const subject of subjects) {
    const latest = (subject.sessions[subject.sessions.length - 1] as Session).date;
    const days = dayNumber(asOf) - dayNumber(latest);
    const recent = days <= A1.recentDays;
    const verdict = verdictOf(subject.sessions, subject.lowerIsBetter, subject.kind);
    const move = moves.get(subject.key) ?? null;
    const moveVotes = !verdict && !!move && recent && dayNumber(asOf) - dayNumber(move.date) <= A1.recentDays;
    const group: Group = !recent ? "not-recent" : verdict ? verdict.state : moveVotes ? "up" : "few";
    rows.push({ subject, group, verdict, moveUp: move, latest, daysSinceLatest: days });
    // Left out, in the spec's exclusive order: under 6 sessions, then not logged in 12 months, then not tested since.
    if (!verdict) {
      if (moveVotes) { up++; moveUps++; } else under6++;
    } else if (!recent) notRecent++;
    else if (verdict.state === "not-tested-since") notTested++;
    else if (verdict.state === "up") up++;
    else if (verdict.state === "down") down++;
    else nc++;
  }
  const counted = up + down + nc;
  const label = labelOf(up, down, counted);
  const other = label === "Declining" ? up : down;
  const parts: string[] = [];
  if (nc) parts.push(`${nc} no clear change`);
  if (other) parts.push(`${other} ${label === "Declining" ? "up" : "down"}`);
  const sentence = label === null ? "No headline yet"
    : label === "Steady" ? `Steady across ${counted} lifts and benchmarks (${[up ? `${up} up` : "", nc ? `${nc} no clear change` : "", down ? `${down} down` : ""].filter(Boolean).join(", ")}).`
    : `${label} in ${label === "Declining" ? down : up} of ${counted} lifts and benchmarks${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  return { rows, headline: { label, up, down, noClearChange: nc, counted, moveUps, leftOut: { under6, notRecent, notTested }, sentence } };
}

/** Deterministic PRNG for the shuffle baseline. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
