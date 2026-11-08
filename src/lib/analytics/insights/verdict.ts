/**
 * The progress verdict for one subject: "is this lift or benchmark moving?". Session-based, never a calendar lookback, because real
 * logging is too sparse for one.
 *
 * With `n` sessions in date order, the most recent `N = min(PV_MAX_WINDOW, floor(n / 2))` are **recent** and the `N` before them are
 * **previous**. The verdict compares the **best** of each window (a lighter session mid-cycle does not matter) as a percentage signed so
 * that better is positive for a lift and a benchmark alike:
 *
 *   up                  change >= +5%, or the recent best is a record, or the subject moved up to RX (headline.ts)
 *   down                change <= -5% and the recent window holds a max effort (a benchmark is always a scored effort)
 *   not tested since    change <= -5% with no max effort in the recent window: the mid-cycle case, never called a decline (lifts only)
 *   no clear change     otherwise
 *
 * A **record** is the recent best at least `PV_RECORD_MARGIN_PCT` above the best of every session before the recent window. It compares
 * with the whole history, not only the previous window, which may sit in a trough, so a slow steady climb counts once it has cleared the
 * old best. There is no same-rep-scheme exception to the margin: the estimator's error is not the only noise in a max effort.
 *
 * Percentages are rounded half away from zero to one decimal before they meet a threshold. A subject needs 3 sessions each side (6);
 * below that it gets no verdict, and the view shows a facts line instead of a weaker claim.
 */
import { PV_CHANGE_THRESHOLD_PCT, PV_MAX_WINDOW, PV_MIN_SESSIONS_PER_SIDE, PV_RECORD_MARGIN_PCT } from "../insightConfig";
import type { ProgressSession } from "./sessions";

export type VerdictState = "up" | "down" | "not-tested-since" | "no-clear-change";

export interface ProgressVerdict {
  state: VerdictState;
  /** Signed so better is positive, rounded half away from zero to one decimal, in percent. */
  change: number;
  /** Sessions the subject has. */
  n: number;
  /** Sessions on each side. */
  window: number;
  previous: ProgressSession[];
  recent: ProgressSession[];
  previousBest: ProgressSession;
  recentBest: ProgressSession;
  /** The recent best is at least the record margin above everything before the recent window. */
  record: boolean;
  /** Days from the first to the last recent session. */
  recentSpanDays: number;
}

/** Round half away from zero to `digits` places. */
export function roundHalfAway(x: number, digits = 1): number {
  const f = 10 ** digits;
  return (Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5)) / f;
}

export function dayNumber(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
}

/** The best session (first on a tie, so the earliest date). */
export function bestSession(sessions: readonly ProgressSession[], lowerIsBetter: boolean): ProgressSession {
  let best = sessions[0] as ProgressSession;
  for (const s of sessions) if (lowerIsBetter ? s.value < best.value : s.value > best.value) best = s;
  return best;
}

/** Judges two windows; `earlier` is every session before the recent window (for the record rule). */
export function judgeWindows(
  previous: readonly ProgressSession[],
  recent: readonly ProgressSession[],
  earlier: readonly ProgressSession[],
  lowerIsBetter: boolean,
  kind: "lift" | "benchmark"
): ProgressVerdict {
  const previousBest = bestSession(previous, lowerIsBetter);
  const recentBest = bestSession(recent, lowerIsBetter);
  const sign = lowerIsBetter ? -1 : 1;
  const change = roundHalfAway(((recentBest.value - previousBest.value) / previousBest.value) * sign * 100, 1);
  const beforeRecent = bestSession(earlier, lowerIsBetter);
  const record = roundHalfAway(((recentBest.value - beforeRecent.value) / beforeRecent.value) * sign * 100, 1) >= PV_RECORD_MARGIN_PCT;
  let state: VerdictState;
  if (change >= PV_CHANGE_THRESHOLD_PCT || record) state = "up";
  else if (change <= -PV_CHANGE_THRESHOLD_PCT) state = kind === "benchmark" || recent.some((s) => s.maxEffort) ? "down" : "not-tested-since";
  else state = "no-clear-change";
  const first = recent[0] as ProgressSession;
  const last = recent[recent.length - 1] as ProgressSession;
  return {
    state,
    change,
    n: previous.length + recent.length,
    window: recent.length,
    previous: [...previous],
    recent: [...recent],
    previousBest,
    recentBest,
    record,
    recentSpanDays: dayNumber(last.date) - dayNumber(first.date),
  };
}

/** The verdict for a subject's sessions, or null with fewer than `2 * PV_MIN_SESSIONS_PER_SIDE` of them. */
export function progressVerdict(sessions: readonly ProgressSession[], lowerIsBetter: boolean, kind: "lift" | "benchmark"): ProgressVerdict | null {
  const n = sessions.length;
  if (n < 2 * PV_MIN_SESSIONS_PER_SIDE) return null;
  const window = Math.min(PV_MAX_WINDOW, Math.floor(n / 2));
  const v = judgeWindows(sessions.slice(n - 2 * window, n - window), sessions.slice(n - window), sessions.slice(0, n - window), lowerIsBetter, kind);
  return { ...v, n };
}
