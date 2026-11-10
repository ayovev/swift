import dayjs from "dayjs";
import { STALE_LOG_DAYS } from "./insightConfig";

export interface LogStaleness {
  /**
   * What the age was measured from. `upload` is the normal case; `last-workout`
   * only for a cache saved before upload dates were kept.
   */
  basis: "upload" | "last-workout";
  /** Whole days since that date, as of `today`. */
  days: number;
  /** Day the file reached this browser (YYYY-MM-DD), or null when unknown. */
  uploadedOn: string | null;
  /** Latest logged workout (YYYY-MM-DD), or null for an empty log. */
  lastWorkoutOn: string | null;
}

export interface LogStalenessInput {
  /** ISO timestamp the log was loaded, or null when unknown (older cache). */
  uploadedAt: string | null;
  /** ISO timestamp the reminder is snoozed until, or null. */
  snoozedUntil: string | null;
  /** Latest logged workout, YYYY-MM-DD. */
  lastWorkoutOn: string | null;
  /** Today as YYYY-MM-DD; passed in so tests can pin it. */
  today: string;
  /** Present moment, for the snooze comparison. */
  now: string;
}

const dayOf = (iso: string): string => dayjs(iso).format("YYYY-MM-DD");

/**
 * Whether the workout log is old enough to suggest a fresh export, or null when
 * it is not (or the reminder is snoozed).
 *
 * The age is measured from the upload, not the last workout: a rest week or an
 * injury leaves an old last workout in a file that is completely current, so
 * the last workout only stands in when no upload date exists. A date in the
 * future (clock skew between devices) is never stale.
 */
export function logStaleness(input: LogStalenessInput): LogStaleness | null {
  if (input.snoozedUntil && dayjs(input.snoozedUntil).isAfter(dayjs(input.now))) return null;

  const uploadedOn = input.uploadedAt ? dayOf(input.uploadedAt) : null;
  const basis = uploadedOn ? "upload" : "last-workout";
  const from = uploadedOn ?? input.lastWorkoutOn;
  if (!from) return null;

  const days = dayjs(input.today).diff(dayjs(from), "day");
  if (days < STALE_LOG_DAYS) return null;
  return { basis, days, uploadedOn, lastWorkoutOn: input.lastWorkoutOn };
}
