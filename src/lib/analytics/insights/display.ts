/**
 * How a verdict and a facts line are written. Native units first (pounds for a lift, a clock time for a time benchmark, rounds and
 * reps for Rounds + Reps), the percentage second; a time reads "faster" or "slower", never a signed number. RX is unmarked and
 * Scaled is the only qualifier ("Back Squat", "Nancy (Scaled)"): RX is the standard, and a suffix on every row says nothing.
 * Percentages are the already-rounded ones from the verdict.
 */
import { PV_LONG_GAP_DAYS, PV_MIN_SESSIONS_PER_SIDE } from "../insightConfig";
import type { MoveUp, ProgressHeadline } from "./headline";
import type { ProgressSession, ProgressSubject } from "./sessions";
import { REPS_PER_ROUND, parseRoundsReps } from "./sessions";
import { roundHalfAway, type ProgressVerdict } from "./verdict";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MINUS = "−";

const monthOf = (iso: string): string => MONTHS[Number(iso.slice(5, 7)) - 1] as string;
export const monthYear = (iso: string): string => `${monthOf(iso)} ${iso.slice(0, 4)}`;

/** "Aug 2026" inside one month, "Mar to Aug 2026" inside one year, "Mar 2024 to Mar 2025" across years. */
export function monthSpan(a: string, b: string): string {
  if (monthYear(a) === monthYear(b)) return monthYear(a);
  if (a.slice(0, 4) === b.slice(0, 4)) return `${monthOf(a)} to ${monthYear(b)}`;
  return `${monthYear(a)} to ${monthYear(b)}`;
}

/** The name on screen: RX is unmarked, Scaled is the qualifier. */
export function displayName(subject: Pick<ProgressSubject, "name" | "status">): string {
  return subject.status === "SCALED" ? `${subject.name} (Scaled)` : subject.name;
}

/** m:ss under an hour, h:mm:ss from an hour up. */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const signed = (n: number, unit: string): string => `${n >= 0 ? "+" : MINUS}${Math.abs(n)} ${unit}`;
const percent = (change: number): string => `${change >= 0 ? "+" : MINUS}${Math.abs(change).toFixed(1)}%`;

/** A rounds + reps total as "17+20" at `repsPerRound`. */
function roundsReps(total: number, repsPerRound: number): string {
  const rounds = Math.floor(total / repsPerRound);
  const reps = total - rounds * repsPerRound;
  return reps ? `${rounds}+${reps}` : String(rounds);
}

/** A session's value as the athlete reads it: "184 lb", "14:37", "17+20". */
export function formatSession(subject: ProgressSubject, session: ProgressSession): string {
  if (subject.format === "load") return `${Math.round(session.value)} lb`;
  if (subject.format === "time") return formatClock(session.value);
  return session.display ?? String(session.value);
}

/** The number only ("184"), for ranges like "184 to 200 lb". */
function formatBare(subject: ProgressSubject, session: ProgressSession): string {
  return subject.format === "load" ? String(Math.round(session.value)) : formatSession(subject, session);
}

export interface VerdictText {
  windows: string;
  change: string;
  /** "Recent sessions span 26 months (Jan 2024 to Mar 2026)." when the recent window is long, else null. */
  longGap: string | null;
}

/** The words under a verdict: the sessions it compared, and the change in native units then percent. */
export function verdictText(subject: ProgressSubject, v: ProgressVerdict): VerdictText {
  const first = (list: ProgressSession[]): string => (list[0] as ProgressSession).date;
  const last = (list: ProgressSession[]): string => (list[list.length - 1] as ProgressSession).date;
  const windows = `Last ${v.window}: ${monthSpan(first(v.recent), last(v.recent))} · Previous ${v.window}: ${monthSpan(first(v.previous), last(v.previous))}`;
  const a = formatBare(subject, v.previousBest);
  const b = formatBare(subject, v.recentBest);
  let change: string;
  if (subject.format === "load") {
    const diff = Math.round(v.recentBest.value) - Math.round(v.previousBest.value);
    change = diff === 0 ? `no change in the best (${a} and ${b} lb)` : `${signed(diff, "lb")} (${a} to ${b} lb), ${percent(v.change)}`;
  } else if (subject.format === "time") {
    const better = v.change >= 0;
    const diff = Math.abs(Math.round(v.recentBest.value) - Math.round(v.previousBest.value));
    const word = better ? "faster" : "slower";
    change = a === b ? `no change in the best (${a} and ${b})` : `${formatClock(diff)} ${word} (${a} to ${b}), ${Math.abs(v.change).toFixed(1)}% ${word}`;
  } else {
    const perRound = REPS_PER_ROUND[subject.movement];
    if (a === b) change = `no change in the best (${a} and ${b})`;
    else if (perRound) {
      const diff = Math.round(v.recentBest.value - v.previousBest.value);
      change = `${signed(diff, "reps")} (${a} to ${b}), ${percent(v.change)}`;
    } else change = `${a} to ${b}`;
  }
  const months = Math.round(v.recentSpanDays / 30.4375);
  const longGap = v.recentSpanDays > PV_LONG_GAP_DAYS ? `Recent sessions span ${months} months (${monthSpan(first(v.recent), last(v.recent))}).` : null;
  return { windows, change, longGap };
}

/** The note under a record: "New best: 111 lb on Dec 10, 2025, 3.7% above the previous best of 107 lb." (a lift). */
export function newBestText(subject: ProgressSubject, v: ProgressVerdict, earlierBest: ProgressSession): string | null {
  if (!v.record) return null;
  const d = v.recentBest.date;
  const day = `${monthOf(d)} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
  const sign = subject.lowerIsBetter ? -1 : 1;
  const pct = roundHalfAway(((v.recentBest.value - earlierBest.value) / earlierBest.value) * sign * 100, 1);
  return `New best: ${formatSession(subject, v.recentBest)} on ${day}, ${pct.toFixed(1)}% above the previous best of ${formatSession(subject, earlierBest)}.`;
}

const sessionsWord = (n: number): string => (n === 1 ? "session" : "sessions");

/** "Needs 1 more session for a verdict." */
export function shortfallText(n: number): string {
  const needs = 2 * PV_MIN_SESSIONS_PER_SIDE - n;
  return `Needs ${needs} more ${sessionsWord(needs)} for a verdict.`;
}

/**
 * The line for a subject below the gate: what was logged and nothing about direction (no verdict word, no percentage, no pill).
 * "Hang Power Clean: 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est. (Mar 2026), +10 lb. Needs 1 more session for a verdict."
 */
export function factsLine(subject: ProgressSubject): string {
  const list = subject.sessions;
  const n = list.length;
  const head = `${displayName(subject)}: ${n} ${sessionsWord(n)}`;
  const latest = list[n - 1] as ProgressSession;
  if (n === 1) return `${head} (${monthYear(latest.date)}). ${shortfallText(n)}`;
  const previous = list[n - 2] as ProgressSession;
  const est = subject.format === "load" ? " est." : "";
  let diff: string;
  if (subject.format === "load") {
    const d = Math.round(latest.value) - Math.round(previous.value);
    diff = d === 0 ? "no change" : signed(d, "lb");
  } else if (subject.format === "time") {
    const d = Math.round(latest.value) - Math.round(previous.value);
    diff = d === 0 ? "no change" : `${formatClock(Math.abs(d))} ${d < 0 ? "faster" : "slower"}`;
  } else {
    const perRound = REPS_PER_ROUND[subject.movement];
    const d = Math.round(latest.value - previous.value);
    diff = !perRound ? "" : d === 0 ? "no change" : signed(d, "reps");
  }
  const body = `Latest ${formatSession(subject, latest)}${est} (${monthYear(latest.date)}), previous ${formatSession(subject, previous)}${est} (${monthYear(previous.date)})`;
  return `${head}. ${body}${diff ? `, ${diff}` : ""}. ${shortfallText(n)}`;
}

/** Used by tests and the view to read a Rounds + Reps display. */
export { parseRoundsReps, roundsReps };

// ── The headline's words ────────────────────────────────────────────────────

const longDate = (iso: string): string => `${monthOf(iso)} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
export { longDate };

/** "Includes 2 that moved up to RX. Left out: 31 with under 6 sessions. 2 compare sessions over 24 months apart. As of Sep 11, 2026." Clauses appear only above zero. */
export function coverageParagraph(h: ProgressHeadline, asOfLog: string): string {
  const parts: string[] = [];
  if (h.moveUps) parts.push(`Includes ${h.moveUps} that moved up to RX.`);
  const left = [
    h.leftOut.under6 ? `${h.leftOut.under6} with under 6 sessions` : "",
    h.leftOut.notRecent ? `${h.leftOut.notRecent} not logged in 12 months` : "",
    h.leftOut.notTested ? `${h.leftOut.notTested} not tested recently` : "",
  ].filter(Boolean);
  if (left.length) parts.push(`Left out: ${left.join(", ")}.`);
  if (h.longGaps) parts.push(`${h.longGaps} compare ${h.longGaps === 1 ? "session" : "sessions"} over 24 months apart.`);
  parts.push(`As of ${longDate(asOfLog)}.`);
  return parts.join(" ");
}

/** "No headline yet: needs 3 lifts or benchmarks with a verdict, has 2. Closest: Back Squat, 1 more session; Clean, 2 more." */
export function noHeadlineText(h: ProgressHeadline): string {
  const closest = h.closest.map((c, i) => (i === 0 ? `${displayName(c.subject)}, ${c.needs} more ${sessionsWord(c.needs)}` : `${displayName(c.subject)}, ${c.needs} more`));
  return `No headline yet: needs 3 lifts or benchmarks with a verdict, has ${h.counted}.${closest.length ? ` Closest: ${closest.join("; ")}.` : ""}`;
}

/** The athlete-facing sentence for a move up to RX. */
export function moveUpText(m: MoveUp): string {
  return `Moved up to RX in ${monthYear(m.date)}, after ${m.scaledBefore} Scaled ${m.scaledBefore === 1 ? "session" : "sessions"}.`;
}

/** "Also logged as RX: 1 session (Dec 2025), 9:13" for a subject with a twin of the other status. Facts only; it counts nothing. */
export function crossReference(twin: ProgressSubject): string {
  const n = twin.sessions.length;
  const first = (twin.sessions[0] as ProgressSession).date;
  const latest = twin.sessions[n - 1] as ProgressSession;
  const value = formatSession(twin, latest);
  const status = twin.status === "SCALED" ? "Scaled" : "RX";
  return `Also logged as ${status}: ${n} ${sessionsWord(n)} (${monthSpan(first, latest.date)}), ${n === 1 ? value : `latest ${value}`}`;
}
