// Shapes for the M/W/G modality classifier.
//
// Unlike the 10 GPP domains — which are independent yes/no tags — the three
// modalities are a PROPORTIONAL split of a single workout. A thruster/pull-up
// couplet is part Weightlifting, part Gymnastics, and the shares sum to 100.
//
// This is new work for Swift; no Python reference exists. Canonical CrossFit
// semantics: M is monostructural only. Fran is 50 W / 50 G / 0 M.

/** Order drives tab display. */
export const MODALITY_LIST = ["M", "W", "G"] as const;

export type Modality = (typeof MODALITY_LIST)[number];

export const MODALITY_NAMES: Record<Modality, string> = {
  M: "Metabolic Conditioning",
  W: "Weightlifting",
  G: "Gymnastics",
};

export const MODALITY_SHORT_LABELS: Record<Modality, string> = {
  M: "Cardio",
  W: "Weightlifting",
  G: "Gymnastics",
};

export const MODALITY_BLURBS: Record<Modality, string> = {
  M:
    "Monostructural cardio — the long-cycle engine work that moves you through space at a steady pattern: running, rowing, biking, skiing, jumping rope. In CrossFit terms this is the \"M\" of M/W/G, and it counts only the movement itself, not how hard a workout feels. A brutal thruster couplet is punishing metabolic work, but it is scored here as weightlifting and gymnastics, because that is what you were actually doing.",
  W:
    "Moving an external load — barbells, dumbbells, kettlebells, wall balls, sandbags, and carries. Everything from a max-effort single to a light barbell cycled for reps in a metcon. If the weight is separate from your body and you are moving it, it lands here.",
  G:
    "Moving your own bodyweight through space — pull-ups, push-ups, dips, muscle-ups, handstand work, toes-to-bar, burpees, box jumps, air squats, pistols, rope climbs, and core work. No external load: the resistance is you.",
};

/** A workout's proportional composition. Shares are percentages summing to
 *  100, or all zero when nothing in the text was recognised. */
export interface ModalitySplit {
  M: number;
  W: number;
  G: number;
}

/** One recognised movement and the modality it contributed to. */
export interface MovementHit {
  /** The lexicon phrase that matched, e.g. "power clean". */
  phrase: string;
  /** Display name, e.g. "Power clean". */
  label: string;
  modality: Modality;
}

export interface ModalityClassification {
  split: ModalitySplit;
  /** Distinct movements found, in the order they appear in the text. */
  movements: MovementHit[];
  /** false when no movement was recognised — excluded from all averages
   *  rather than counted as an empty split, which would drag them down. */
  classified: boolean;
}

export interface ModalityTrendPoint {
  month: string;
  /** Mean share of this modality across that month's CLASSIFIED workouts. */
  avg_share: number;
  /** Workouts that month with a nonzero share of this modality. */
  count: number;
  /** Classified workouts that month (the denominator for avg_share). */
  total: number;
}

export interface ModalityOverallStat {
  /** Mean share across all classified workouts. */
  avg_share: number;
  /** Workouts with a nonzero share of this modality. */
  count: number;
}

export interface ModalityTrendDirectionStat {
  early_pct: number;
  late_pct: number;
  delta: number;
}

/** A workout in a modality's drill-down list. */
export interface ModalityWorkoutEntry {
  /** YY-MM-DD, matching the GPP workout lists. */
  date: string;
  title: string;
  /** This modality's share of the workout. */
  share: number;
  /** The workout's full M/W/G split, shown alongside. */
  split: ModalitySplit;
  /** Movement labels that drove THIS modality's share. */
  movements: string[];
}

export interface ModalityStackedShare {
  month: string;
  M: number;
  W: number;
  G: number;
}

export interface ModalityStacked {
  modality_names: readonly Modality[];
  monthly_shares: ModalityStackedShare[];
}

export interface ModalityData {
  modality_trends: Record<Modality, ModalityTrendPoint[]>;
  modality_overall: Record<Modality, ModalityOverallStat>;
  modality_trend_direction: Record<Modality, ModalityTrendDirectionStat>;
  modality_workout_lists: Record<Modality, ModalityWorkoutEntry[]>;
  modality_stacked: ModalityStacked;
  /** Workouts where no movement was recognised. Surfaced as a UI caveat so
   *  the percentages are read with the right amount of trust. */
  unclassified_count: number;
  /** Denominator behind every average above. */
  classified_count: number;
}
