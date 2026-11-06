/** The checks A1-MAN-01 and A1-MAN-02 ask for, and the ones the later decisions added. Pure functions over `Subject[]`. */
import { PV_MAX_WINDOW, PV_MIN_SESSIONS_PER_SIDE } from "@/lib/analytics/insightConfig";
import type { ProgressRow as Row } from "@/lib/analytics/insights/headline";
import type { ProgressSession as Session, ProgressSubject as Subject } from "@/lib/analytics/insights/sessions";
import { dayNumber, judgeWindows, progressVerdict as verdictOf, type ProgressVerdict as Verdict, type VerdictState as State } from "@/lib/analytics/insights/verdict";

/** Deterministic PRNG for the shuffle baseline. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Count { total: number; up: number; down: number; nts: number; nc: number }

const bump = (c: Count, s: State): void => {
  c.total++;
  if (s === "up") c.up++;
  else if (s === "down") c.down++;
  else if (s === "not-tested-since") c.nts++;
  else c.nc++;
};

/** How often the verdict changes when one more session is added, over every prefix of at least 6 sessions. */
export function stability(subjects: readonly Subject[]): { pairs: number; flips: number; subjects: number } {
  let pairs = 0, flips = 0, counted = 0;
  for (const s of subjects) {
    const n = s.sessions.length;
    if (n < 2 * PV_MIN_SESSIONS_PER_SIDE + 1) continue;
    counted++;
    for (let k = 2 * PV_MIN_SESSIONS_PER_SIDE; k < n; k++) {
      const a = verdictOf(s.sessions.slice(0, k), s.lowerIsBetter, s.kind);
      const b = verdictOf(s.sessions.slice(0, k + 1), s.lowerIsBetter, s.kind);
      if (!a || !b) continue;
      pairs++;
      if (a.state !== b.state) flips++;
    }
  }
  return { pairs, flips, subjects: counted };
}

/**
 * The verdict rule on the athlete's own values in random order. If shuffled history says `up` about as often as the real
 * history does, `up` is not telling real changes from noise for this athlete.
 */
export function shuffleBaseline(subjects: readonly Subject[], runs = 200, seed = 20260911): { actual: Count; shuffled: Count; subjects: number } {
  const rand = mulberry32(seed);
  const actual: Count = { total: 0, up: 0, down: 0, nts: 0, nc: 0 };
  const shuffled: Count = { total: 0, up: 0, down: 0, nts: 0, nc: 0 };
  let used = 0;
  for (const s of subjects) {
    const v = verdictOf(s.sessions, s.lowerIsBetter, s.kind);
    if (!v) continue;
    used++;
    bump(actual, v.state);
    const dates = s.sessions.map((x) => x.date);
    for (let r = 0; r < runs; r++) {
      const order = s.sessions.map((x) => ({ value: x.value, maxEffort: x.maxEffort }));
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = order[i] as { value: number; maxEffort: boolean };
        order[i] = order[j] as { value: number; maxEffort: boolean };
        order[j] = t;
      }
      const sessions: Session[] = order.map((o, i) => ({ date: dates[i] as string, ...o }));
      const sv = verdictOf(sessions, s.lowerIsBetter, s.kind);
      if (sv) bump(shuffled, sv.state);
    }
  }
  return { actual, shuffled, subjects: used };
}

export interface MergeResult { liftsWithBoth: number; becomeEligible: number; changed: number; details: { name: string; rx: State | "few"; merged: State | "few" }[] }

/** What would change if RX and Scaled of one lift were one subject. */
export function mergeCheck(subjects: readonly Subject[]): MergeResult {
  const lifts = subjects.filter((s) => s.kind === "lift");
  const names = new Set(lifts.map((s) => s.name.toLowerCase()));
  const out: MergeResult = { liftsWithBoth: 0, becomeEligible: 0, changed: 0, details: [] };
  for (const name of names) {
    const rx = lifts.find((s) => s.name.toLowerCase() === name && s.status === "RX");
    const sc = lifts.find((s) => s.name.toLowerCase() === name && s.status === "SCALED");
    if (!rx || !sc) continue;
    out.liftsWithBoth++;
    const byDay = new Map<string, Session>();
    for (const e of [...rx.sessions, ...sc.sessions]) {
      const have = byDay.get(e.date);
      byDay.set(e.date, !have || e.value > have.value ? e : have);
    }
    const merged = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const a = verdictOf(rx.sessions, false, "lift");
    const b = verdictOf(merged, false, "lift");
    if (!a && b) out.becomeEligible++;
    const as = a ? a.state : "few";
    const bs = b ? b.state : "few";
    if (as !== bs) out.changed++;
    out.details.push({ name: rx.name, rx: as, merged: bs });
  }
  return out;
}

export interface EntrySpec { name: string; start: string; end: string | null }
export interface EntryResult {
  spec: EntrySpec;
  eligible: number;
  up: number; down: number; nts: number; nc: number;
  factsOnly: number;
  closest: { name: string; need: number }[];
}

/** The entry's own before and after (docs/insights-timeline.md): the last N sessions during against the last N before the start. */
export function entryCheck(subjects: readonly Subject[], spec: EntrySpec, asOf: string): EntryResult {
  const end = spec.end ?? asOf;
  const res: EntryResult = { spec, eligible: 0, up: 0, down: 0, nts: 0, nc: 0, factsOnly: 0, closest: [] };
  const near: { name: string; need: number; last: string }[] = [];
  for (const s of subjects) {
    const during = s.sessions.filter((x) => x.date >= spec.start && x.date <= end);
    const before = s.sessions.filter((x) => x.date < spec.start);
    const N = Math.min(PV_MAX_WINDOW, during.length, before.length);
    if (N >= PV_MIN_SESSIONS_PER_SIDE) {
      const v = judgeWindows(before.slice(-N), during.slice(-N), s.sessions.filter((x) => x.date < (during.slice(-N)[0] as Session).date), s.lowerIsBetter, s.kind);
      res.eligible++;
      if (v.state === "up") res.up++; else if (v.state === "down") res.down++; else if (v.state === "not-tested-since") res.nts++; else res.nc++;
    } else if (during.length >= 1 && before.length >= 1) {
      res.factsOnly++;
      near.push({ name: s.name, need: Math.max(0, PV_MIN_SESSIONS_PER_SIDE - during.length), last: (during[during.length - 1] as Session).date });
    }
  }
  res.closest = near.sort((a, b) => a.need - b.need || (a.last < b.last ? 1 : -1)).slice(0, 2).map(({ name, need }) => ({ name, need }));
  return res;
}

export interface Scan { date: string; weightLb: number }

/** Body weight at a date by the recorded rule: that day, else a straight line between readings at most 45 days apart, else the nearest reading within 21 days. */
export function weightAt(date: string, scans: readonly Scan[]): number | null {
  const d = dayNumber(date);
  const exact = scans.find((s) => s.date === date);
  if (exact) return exact.weightLb;
  const before = [...scans].filter((s) => dayNumber(s.date) < d).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  const after = [...scans].filter((s) => dayNumber(s.date) > d).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (before && after && dayNumber(after.date) - dayNumber(before.date) <= 45) {
    const f = (d - dayNumber(before.date)) / (dayNumber(after.date) - dayNumber(before.date));
    return before.weightLb + (after.weightLb - before.weightLb) * f;
  }
  let nearest: Scan | null = null;
  for (const s of scans) if (!nearest || Math.abs(dayNumber(s.date) - d) < Math.abs(dayNumber(nearest.date) - d)) nearest = s;
  return nearest && Math.abs(dayNumber(nearest.date) - d) <= 21 ? nearest.weightLb : null;
}

export interface BodyCoverage { rows: number; bothReadings: number; oneOrNone: number; movedPastBand: number; scans: number; medianGapDays: number | null }

/** How many verdict rows could show a body-context line, using the default 3 lb weight band. */
export function bodyCoverage(rows: readonly Row[], scans: readonly Scan[], bandLb = 3): BodyCoverage {
  const out: BodyCoverage = { rows: 0, bothReadings: 0, oneOrNone: 0, movedPastBand: 0, scans: scans.length, medianGapDays: null };
  const sorted = [...scans].sort((a, b) => (a.date < b.date ? -1 : 1));
  const gaps = sorted.slice(1).map((s, i) => dayNumber(s.date) - dayNumber((sorted[i] as Scan).date)).sort((a, b) => a - b);
  if (gaps.length) out.medianGapDays = gaps[Math.floor(gaps.length / 2)] as number;
  for (const r of rows) {
    const v: Verdict | null = r.verdict;
    if (!v || r.group === "not-recent" || r.group === "few") continue;
    out.rows++;
    const a = weightAt(v.previousBest.date, scans);
    const b = weightAt(v.recentBest.date, scans);
    if (a === null || b === null) { out.oneOrNone++; continue; }
    out.bothReadings++;
    if (Math.abs(b - a) > bandLb) out.movedPastBand++;
  }
  return out;
}

export function sessionCountBands(subjects: readonly Subject[]): { one: number; twoToFive: number; sixPlus: number } {
  return {
    one: subjects.filter((s) => s.sessions.length === 1).length,
    twoToFive: subjects.filter((s) => s.sessions.length >= 2 && s.sessions.length <= 5).length,
    sixPlus: subjects.filter((s) => s.sessions.length >= 6).length,
  };
}

