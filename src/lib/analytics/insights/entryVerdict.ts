/**
 * The before and after of one entry the athlete changed. Only an "I changed it" entry has one; something that happened is
 * context and gets none.
 *
 * For each lift or benchmark, **during** is its sessions from the entry's start to its end (to the reference date for an
 * ongoing entry, which reads "so far") and **before** is its sessions dated before the start. `N = min(PV_MAX_WINDOW, during,
 * before)`; the last N sessions of each side are compared and the subject needs `N >= PV_MIN_SESSIONS_PER_SIDE`. The state,
 * the change, the record and the Down versus Not tested since rule are the progress verdict's, unchanged (`judgeWindows`).
 * No separate recency rule: a subject needs 3 sessions inside the entry to qualify. A move up to RX dated inside the entry
 * counts as one Up vote for a subject that has no verdict of its own.
 *
 * The summary reuses the headline label and its counts. Not tested since subjects are left out of the count, as on the front
 * door. Fewer than `PV_HEADLINE_MIN_COUNTED` counted subjects give no label, and then the entry shows what was logged on each
 * side instead (facts lines, no pill or percentage). An entry never changes a verdict anywhere else.
 */
import { PV_MAX_WINDOW, PV_MIN_SESSIONS_PER_SIDE } from "../insightConfig";
import { entryEnd } from "../timeline";
import type { TimelineEntry } from "@/types/timeline";
import { findMoveUps, labelOf, type HeadlineLabel, type MoveUp } from "./headline";
import type { ProgressSession, ProgressSubject } from "./sessions";
import { judgeWindows, type ProgressVerdict } from "./verdict";

export interface EntrySubjectResult {
  subject: ProgressSubject;
  /** Sessions on each side of the entry's start, before the window is cut. */
  during: number;
  before: number;
  /** Null when the subject is short of the gate on either side. */
  verdict: ProgressVerdict | null;
}

export interface EntryMoveUp {
  subject: ProgressSubject;
  moveUp: MoveUp;
}

export interface EntryVerdict {
  label: HeadlineLabel | null;
  up: number;
  down: number;
  noClearChange: number;
  counted: number;
  /** Counted subjects that are move-ups. */
  moveUps: EntryMoveUp[];
  notTested: number;
  /** Subjects with a verdict, in the order they were built. */
  compared: EntrySubjectResult[];
  /** Subjects with a session on each side and no verdict (or too few counted to speak), most sessions during first. */
  facts: EntrySubjectResult[];
  /** The two subjects nearest the gate, for the shortfall sentence. */
  closest: { subject: ProgressSubject; moreDuring: number; moreBefore: number }[];
}

/** The before and after for an entry the athlete changed, as of `asOf`. */
export function entryVerdict(entry: TimelineEntry, subjects: readonly ProgressSubject[], asOf: string): EntryVerdict {
  const end = entryEnd(entry, asOf);
  const results: EntrySubjectResult[] = [];
  const moves = findMoveUps(subjects);

  for (const subject of subjects) {
    const sessions = subject.sessions.filter((s) => s.date <= asOf);
    const before = sessions.filter((s) => s.date < entry.startDate);
    const during = sessions.filter((s) => s.date >= entry.startDate && s.date <= end);
    const n = Math.min(PV_MAX_WINDOW, during.length, before.length);
    let verdict: ProgressVerdict | null = null;
    if (n >= PV_MIN_SESSIONS_PER_SIDE) {
      const recent = during.slice(-n);
      const earlier = sessions.filter((s) => s.date < (recent[0] as ProgressSession).date);
      verdict = { ...judgeWindows(before.slice(-n), recent, earlier, subject.lowerIsBetter, subject.kind), n: before.length + during.length };
    }
    results.push({ subject, during: during.length, before: before.length, verdict });
  }

  let up = 0, down = 0, noClearChange = 0, notTested = 0;
  const compared: EntrySubjectResult[] = [];
  for (const r of results) {
    if (!r.verdict) continue;
    compared.push(r);
    if (r.verdict.state === "not-tested-since") notTested++;
    else if (r.verdict.state === "up") up++;
    else if (r.verdict.state === "down") down++;
    else noClearChange++;
  }

  const moveUps: EntryMoveUp[] = [];
  for (const r of results) {
    const moveUp = moves.get(r.subject.key);
    if (r.verdict || !moveUp) continue;
    if (moveUp.date >= entry.startDate && moveUp.date <= end) {
      moveUps.push({ subject: r.subject, moveUp });
      up++;
    }
  }

  const counted = up + down + noClearChange;
  const label = labelOf(up, down, counted);

  const hasBothSides = (r: EntrySubjectResult): boolean => r.during > 0 && r.before > 0;
  const facts = label
    ? []
    : results
        .filter(hasBothSides)
        .sort((a, b) => b.during - a.during || (a.subject.key < b.subject.key ? -1 : 1));
  const closest = results
    .filter((r) => hasBothSides(r) && !r.verdict)
    .map((r) => ({
      subject: r.subject,
      moreDuring: Math.max(0, PV_MIN_SESSIONS_PER_SIDE - r.during),
      moreBefore: Math.max(0, PV_MIN_SESSIONS_PER_SIDE - r.before),
    }))
    .sort((a, b) => a.moreDuring + a.moreBefore - (b.moreDuring + b.moreBefore) || (a.subject.key < b.subject.key ? -1 : 1))
    .slice(0, 2);

  return { label, up, down, noClearChange, counted, moveUps, notTested, compared, facts, closest };
}
