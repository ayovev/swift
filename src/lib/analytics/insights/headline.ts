/**
 * Puts every subject in one group and rolls the counted ones up into the headline.
 *
 * Groups, in the order the front door lists them: up, down, not tested since, no clear change, fewer than 6 sessions, not recent.
 * "Not recent" is decided first: a subject whose latest session is more than `PV_RECENT_DAYS` before the reference date is left out of
 * everything else. The reference date is always passed in (today in the app), never read from the clock, so the same history and date
 * give the same result.
 *
 * **Counted** subjects are those with a verdict that are recent and not `not tested since`, plus recent **move-ups**: an RX session
 * whose most recent earlier session of that movement was Scaled counts as an up vote for `PV_MOVE_UP_VOTE_DAYS`, whatever the load or
 * time (RX is usually the harder workout, so the time often gets worse). The move-up stands in for a verdict only while the RX subject
 * has fewer than 6 sessions; at 6 its normal verdict replaces it. Moving down to Scaled is a neutral fact and votes nothing.
 *
 * Label: net = (up - down) / counted. `Improving` if net is at least +0.25 and at least a third of the counted subjects are up
 * (`4 * (up - down) >= counted` and `3 * up >= counted`), `Declining` is the mirror, otherwise `Steady`; fewer than
 * `PV_HEADLINE_MIN_COUNTED` counted gives no label. One tier for everyone: a two-tier label would impose a minimum number of groups.
 */
import { PV_HEADLINE_MIN_COUNTED, PV_LONG_GAP_DAYS, PV_MIN_SESSIONS_PER_SIDE, PV_MOVE_UP_VOTE_DAYS, PV_RECENT_DAYS } from "../insightConfig";
import type { ProgressSession, ProgressSubject } from "./sessions";
import { dayNumber, progressVerdict, type ProgressVerdict } from "./verdict";

export type ProgressGroup = "up" | "down" | "not-tested-since" | "no-clear-change" | "few" | "not-recent";
export type HeadlineLabel = "Improving" | "Steady" | "Declining";

export interface MoveUp {
  /** The first RX session after a Scaled one. */
  date: string;
  /** Scaled sessions before it. */
  scaledBefore: number;
  /** The last Scaled session before it. */
  scaledDate: string;
}

export interface ProgressRow {
  subject: ProgressSubject;
  group: ProgressGroup;
  verdict: ProgressVerdict | null;
  /** The subject's latest move up to RX, whether or not it still votes. */
  moveUp: MoveUp | null;
  /** The move-up stands in for a verdict and still votes. */
  moveUpVotes: boolean;
  latest: string;
  daysSinceLatest: number;
}

export interface ProgressHeadline {
  label: HeadlineLabel | null;
  up: number;
  down: number;
  noClearChange: number;
  counted: number;
  /** Counted subjects that are move-ups rather than verdicts. */
  moveUps: number;
  /** Exclusive reasons, in order: under 6 sessions, then not logged in 12 months, then not tested since. */
  leftOut: { under6: number; notRecent: number; notTested: number };
  /** Counted subjects whose recent sessions span more than 24 months. */
  longGaps: number;
  /** Recent subjects nearest a verdict, for "No headline yet": fewest more sessions first, ties to the more recently logged. */
  closest: { subject: ProgressSubject; needs: number }[];
}

export function labelOf(up: number, down: number, counted: number): HeadlineLabel | null {
  if (counted < PV_HEADLINE_MIN_COUNTED) return null;
  if (4 * (up - down) >= counted && 3 * up >= counted) return "Improving";
  if (4 * (down - up) >= counted && 3 * down >= counted) return "Declining";
  return "Steady";
}

/** "Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down)." A part of zero is dropped. */
export function headlineSentence(label: HeadlineLabel, up: number, down: number, noClearChange: number): string {
  const counted = up + down + noClearChange;
  if (label === "Steady") {
    const parts = [up ? `${up} up` : "", noClearChange ? `${noClearChange} no clear change` : "", down ? `${down} down` : ""].filter(Boolean);
    return `Steady across ${counted} lifts and benchmarks (${parts.join(", ")}).`;
  }
  const lead = label === "Declining" ? down : up;
  const other = label === "Declining" ? up : down;
  const parts = [noClearChange ? `${noClearChange} no clear change` : "", other ? `${other} ${label === "Declining" ? "up" : "down"}` : ""].filter(Boolean);
  return `${label} in ${lead} of ${counted} lifts and benchmarks${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}

/** The latest move up to RX of each RX subject that also has a Scaled twin. A same-day Scaled and RX session makes no move. */
export function findMoveUps(subjects: readonly ProgressSubject[]): Map<string, MoveUp> {
  const out = new Map<string, MoveUp>();
  for (const rx of subjects) {
    if (rx.status !== "RX") continue;
    const scaled = subjects.find((s) => s.status === "SCALED" && s.kind === rx.kind && s.movement === rx.movement);
    if (!scaled) continue;
    let latest: MoveUp | null = null;
    for (const session of rx.sessions) {
      if (scaled.sessions.some((s) => s.date === session.date)) continue;
      const earlier: { date: string; scaled: boolean }[] = [
        ...rx.sessions.filter((s) => s.date < session.date).map((s) => ({ date: s.date, scaled: false })),
        ...scaled.sessions.filter((s) => s.date < session.date).map((s) => ({ date: s.date, scaled: true })),
      ].sort((a, b) => (a.date < b.date ? -1 : 1));
      const previous = earlier[earlier.length - 1];
      if (!previous?.scaled) continue;
      const before = scaled.sessions.filter((s) => s.date < session.date);
      latest = { date: session.date, scaledBefore: before.length, scaledDate: (before[before.length - 1] as ProgressSession).date };
    }
    if (latest) out.set(rx.key, latest);
  }
  return out;
}

export function classifySubjects(subjects: readonly ProgressSubject[], asOf: string): { rows: ProgressRow[]; headline: ProgressHeadline } {
  const moves = findMoveUps(subjects);
  const rows: ProgressRow[] = [];
  let up = 0, down = 0, noClearChange = 0, moveUps = 0, under6 = 0, notRecent = 0, notTested = 0, longGaps = 0;
  for (const subject of subjects) {
    // Sessions dated after the reference date are ignored.
    const sessions = subject.sessions.filter((s) => s.date <= asOf);
    if (sessions.length === 0) continue;
    const latest = (sessions[sessions.length - 1] as ProgressSession).date;
    const daysSinceLatest = dayNumber(asOf) - dayNumber(latest);
    const recent = daysSinceLatest <= PV_RECENT_DAYS;
    const verdict = progressVerdict(sessions, subject.lowerIsBetter, subject.kind);
    const moveUp = moves.get(subject.key) ?? null;
    const moveUpVotes = !verdict && !!moveUp && recent && dayNumber(asOf) - dayNumber(moveUp.date) <= PV_MOVE_UP_VOTE_DAYS;
    const group: ProgressGroup = !recent ? "not-recent" : verdict ? verdict.state : moveUpVotes ? "up" : "few";
    rows.push({ subject, group, verdict, moveUp, moveUpVotes, latest, daysSinceLatest });
    if (!verdict) {
      if (moveUpVotes) { up++; moveUps++; } else under6++;
    } else if (!recent) notRecent++;
    else if (verdict.state === "not-tested-since") notTested++;
    else {
      if (verdict.state === "up") up++;
      else if (verdict.state === "down") down++;
      else noClearChange++;
      if (verdict.recentSpanDays > PV_LONG_GAP_DAYS) longGaps++;
    }
  }
  const closest = rows
    .filter((r) => r.group === "few")
    .map((r) => ({ subject: r.subject, needs: 2 * PV_MIN_SESSIONS_PER_SIDE - r.subject.sessions.length, latest: r.latest }))
    .sort((a, b) => a.needs - b.needs || (a.latest < b.latest ? 1 : -1))
    .slice(0, 2)
    .map(({ subject, needs }) => ({ subject, needs }));
  const counted = up + down + noClearChange;
  return { rows, headline: { label: labelOf(up, down, counted), up, down, noClearChange, counted, moveUps, leftOut: { under6, notRecent, notTested }, longGaps, closest } };
}
