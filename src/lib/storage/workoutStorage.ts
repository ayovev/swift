import { idbGet, idbSet } from "./idbStore";
import type { SugarWodRow } from "@/types/sugarwod";

const KEY = "workout-rows";
const META_KEY = "workout-meta";

export function saveWorkoutRows(rows: SugarWodRow[]): Promise<void> {
  return idbSet(KEY, rows);
}

export function loadWorkoutRows(): Promise<SugarWodRow[] | undefined> {
  return idbGet<SugarWodRow[]>(KEY);
}

/**
 * Facts about the stored workout log that are not rows: when it reached this
 * browser, and until when the stale-log reminder is snoozed. Its own key so the
 * rows keep the shape sync and backup validate, and a cache written before this
 * existed simply has no meta (read as `undefined`).
 *
 * `uploadedAt` is an ISO timestamp of arrival on this device. Data that came by
 * sync or backup restore is stamped when it arrived, not when the original
 * export was made, since neither format carries the original date; that can
 * make an old backup look fresher than it is.
 */
export interface WorkoutMeta {
  uploadedAt: string;
  /** ISO timestamp; the reminder stays hidden until this passes. */
  staleSnoozedUntil?: string;
}

export function saveWorkoutMeta(meta: WorkoutMeta): Promise<void> {
  return idbSet(META_KEY, meta);
}

export function loadWorkoutMeta(): Promise<WorkoutMeta | undefined> {
  return idbGet<WorkoutMeta>(META_KEY);
}
