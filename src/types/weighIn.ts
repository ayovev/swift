/**
 * A body weight the athlete typed in, in pounds. One per day: saving a weigh-in for a date that has one replaces it. `source` is stored
 * on every record so a pooled body-weight series can always say where a reading came from (an InBody scan or a manual entry).
 * Athlete-authored and persisted on its own key (`storage/weighInsStorage.ts`); it travels in sync and backup like the other datasets.
 */
export interface WeighIn {
  /** YYYY-MM-DD */
  date: string;
  weightLb: number;
  /** Optional plain text, trimmed, at most `WEIGH_IN_NOTE_MAX` characters. A blank note is stored as absent. */
  notes?: string;
  source: "manual";
}

export const WEIGH_IN_MIN_LB = 50;
export const WEIGH_IN_MAX_LB = 600;
export const WEIGH_IN_NOTE_MAX = 200;
