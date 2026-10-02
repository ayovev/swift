// Shapes for the Movements view: which workouts contained a given movement
// (or a whole family of them, like every kind of clean), and how often.

/** One workout, reduced to what the Movements view needs. */
export interface MovementWorkout {
  /** YY-MM-DD, matching every other workout list. */
  date: string;
  title: string;
  /** The row's aggregation bucket key (see granularity.ts). */
  bucket: string;
  /** Distinct movements found in the workout, in the order they were written. */
  movements: { id: string; label: string; phrase: string }[];
}

export interface MovementData {
  /** Every workout in range, oldest first (unmatched ones too: they are the denominator). */
  workouts: MovementWorkout[];
  /** Every bucket that holds at least one workout, sorted. */
  buckets: string[];
}

/** A family (any member counts) or one specific movement. Ids are never labels. */
export interface MovementSelection {
  kind: "family" | "movement";
  id: string;
}

export interface MovementOption {
  kind: "family" | "movement";
  id: string;
  label: string;
  /** Workouts in range that include it. */
  count: number;
}
