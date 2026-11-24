import { classifySubjects, type ProgressGroup, type ProgressHeadline, type ProgressRow } from "./headline";
import type { ProgressSubject } from "./sessions";

/**
 * Progress now against Progress as of an earlier date: the comparison behind a report's "Since a chosen date" section
 * (docs/reports.md, R-14). Both sides run the same verdict engine, one with `since` as its reference date and one with `today`, so a
 * verdict "then" is the verdict the app would have shown on that day (tests/asOfDate.test.ts pins that equality over the sample).
 *
 * Pure: the dates are passed in, never read from the clock, and nothing is stored (R-15).
 */
export type SinceState = ProgressGroup | "move-up" | "none";

export interface SinceRow {
  key: string;
  subject: ProgressSubject;
  /** The subject's state on the earlier date. "none" when nothing had been logged on or before it. */
  then: SinceState;
  now: SinceState;
  /** Sessions logged after the earlier date, up to today. */
  sessionsSince: number;
  /** Then and now read differently. */
  changed: boolean;
}

export interface SinceComparison {
  since: string;
  today: string;
  headlineThen: ProgressHeadline;
  headlineNow: ProgressHeadline;
  rows: SinceRow[];
}

/** A move up to RX that still votes stands in for a verdict, so it is its own state. */
export function stateOf(row: ProgressRow | undefined): SinceState {
  if (!row) return "none";
  return row.moveUpVotes ? "move-up" : row.group;
}

/** The words for a state. The verdict words are the ones Progress prints. */
export function sinceStateLabel(state: SinceState): string {
  switch (state) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "not-tested-since":
      return "Not tested since";
    case "no-clear-change":
      return "No clear change";
    case "move-up":
      return "Moved up to RX";
    case "few":
      return "Fewer than 6 sessions";
    case "not-recent":
      return "Not recent";
    case "none":
      return "Not logged yet";
  }
}

/** Rows are the subjects logged by `today`; the order is Progress's own (subject order), and `changed` ones are for the caller to lead with. */
export function compareProgress(subjects: readonly ProgressSubject[], since: string, today: string): SinceComparison {
  const then = classifySubjects(subjects, since);
  const now = classifySubjects(subjects, today);
  const thenByKey = new Map(then.rows.map((r) => [r.subject.key, r]));
  const rows: SinceRow[] = now.rows.map((row) => {
    const before = stateOf(thenByKey.get(row.subject.key));
    const after = stateOf(row);
    return {
      key: row.subject.key,
      subject: row.subject,
      then: before,
      now: after,
      sessionsSince: row.subject.sessions.filter((s) => s.date > since && s.date <= today).length,
      changed: before !== after,
    };
  });
  return { since, today, headlineThen: then.headline, headlineNow: now.headline, rows };
}
