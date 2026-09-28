// Shapes for the computed dashboard data. Mirrors the output of
// build_dashboard_data() in the validated Python reference, plus two
// additive fields noted below.

import type { SugarWodRow } from "./sugarwod";

/** The ten CrossFit general physical skills. Order drives tab display. */
export const DOMAIN_LIST = [
  "Cardiovascular/Respiratory Endurance",
  "Stamina",
  "Strength",
  "Flexibility",
  "Power",
  "Speed",
  "Coordination",
  "Agility",
  "Balance",
  "Accuracy",
] as const;

export type Domain = (typeof DOMAIN_LIST)[number];

/** Short tab labels — the full domain names don't fit a tab strip. */
export const DOMAIN_SHORT_LABELS: Record<Domain, string> = {
  "Cardiovascular/Respiratory Endurance": "Cardio",
  Stamina: "Stamina",
  Strength: "Strength",
  Flexibility: "Flexibility",
  Power: "Power",
  Speed: "Speed",
  Coordination: "Coordination",
  Agility: "Agility",
  Balance: "Balance",
  Accuracy: "Accuracy",
};

/**
 * CrossFit's own definition of each skill, word for word — shown as the
 * subtitle under a domain page's heading (see pageSubtitleOf in
 * SectionNav.tsx). Never edit the wording for style or house voice; the
 * app's own words about a domain live in DOMAIN_BLURBS below.
 *
 * Transcribed from Greg Glassman's "What Is Fitness?" (CrossFit Journal,
 * October 2002), which CrossFit's "What Is Fitness? — 10 Physical Skills"
 * lecture presents: https://www.crossfit.com/essentials/what-is-fitness-lecture-10-physical-skills
 */
export const CROSSFIT_DEFINITIONS: Record<Domain, string> = {
  "Cardiovascular/Respiratory Endurance":
    "The ability of body systems to gather, process, and deliver oxygen.",
  Stamina: "The ability of body systems to process, deliver, store, and utilize energy.",
  Strength: "The ability of a muscular unit, or combination of muscular units, to apply force.",
  Flexibility: "The ability to maximize the range of motion at a given joint.",
  Power:
    "The ability of a muscular unit, or combination of muscular units, to apply maximum force in minimum time.",
  Speed: "The ability to minimize the time cycle of a repeated movement.",
  Coordination:
    "The ability to combine several distinct movement patterns into a singular distinct movement.",
  Agility: "The ability to minimize transition time from one movement pattern to another.",
  Balance:
    "The ability to control the placement of the body's center of gravity in relation to its support base.",
  Accuracy: "The ability to control movement in a given direction or at a given intensity.",
};

/**
 * The app's own note on how each domain tends to show up in a logged
 * workout. CrossFit's definition is quoted separately (CROSSFIT_DEFINITIONS),
 * so these don't restate it.
 */
export const DOMAIN_BLURBS: Record<Domain, string> = {
  "Cardiovascular/Respiratory Endurance": "Driven by running, rowing, biking, and other engine work.",
  Stamina: "Sustained efforts — the classic long metcon or chipper.",
  Strength: "Squats, deadlifts, presses, and heavy pulls under load.",
  Flexibility: "Rarely programmed directly — usually shows up as warmup or accessory work.",
  Power: "Olympic lifts, box jumps, and explosive movements.",
  Speed: "Sprints, fast runs, and time-trial efforts.",
  Coordination: "Muscle-ups, snatches, double-unders.",
  Agility: "Burpees, box jumps, shuttle-style work.",
  Balance: "Handstands, pistols, carries.",
  Accuracy: "Wall-balls, double-unders, anything with a target.",
};

export interface LiftEntry {
  date: string;
  value: number;
  rx: string;
  pr: boolean;
  /**
   * ADDITIVE (not in the Python reference). Inferred rep count this load was
   * working toward — 1 for a max single, 5 for a 5RM — so the chart doesn't
   * plot a 5RM and a 1RM as one comparable series. null when the workout text
   * gives no basis to infer it. See lib/analytics/repMax.ts.
   */
  repMax: number | null;
}

export interface BenchmarkEntry {
  date: string;
  value: number | null;
  display: string;
  rx: string;
  pr: boolean;
}

export interface BucketCount {
  bucket: string;
  count: number;
}

export interface PrTimelineEntry {
  date: string;
  title: string;
  display: string;
  barbell_lift: string | null;
}

export interface DomainTrendPoint {
  bucket: string;
  count: number;
  /** Share of THAT bucket's workouts touching this domain. Domains overlap, so
   *  these do not sum to 100 across domains — see `stacked` for that view. */
  pct: number;
  total: number;
}

export interface OverallDomainStat {
  count: number;
  pct: number;
}

export interface TrendDirectionStat {
  early_pct: number;
  late_pct: number;
  delta: number;
}

/** [date (YY-MM-DD), workout title, the keyword that triggered the match] */
export type WorkoutListEntry = [date: string, title: string, matchedKeyword: string];

export interface StackedBucketShare {
  bucket: string;
  [domain: string]: string | number;
}

export interface Stacked {
  domain_names: readonly Domain[];
  bucket_shares: StackedBucketShare[];
}

export interface DashboardSummary {
  total_logged: number;
  date_start: string;
  date_end: string;
  total_prs: number;
  rx_count: number;
  scaled_count: number;
  /** ADDITIVE (not in the Python reference). */
  avg_per_bucket: number;
  /**
   * ADDITIVE (not in the Python reference). Count of distinct calendar days
   * with at least one logged workout — several workouts on the same day
   * (e.g. a class plus accessory work) count once, unlike total_logged.
   */
  unique_days: number;
  /**
   * ADDITIVE (not in the Python reference). Average unique training days per
   * bucket at the selected granularity, e.g. "days per week". Averaged only
   * over buckets that have at least one logged workout — same denominator as
   * avg_per_bucket — so a span with no activity at all doesn't exist as a
   * bucket and can't drag the average down.
   */
  avg_days_per_bucket: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  lifts: Record<string, LiftEntry[]>;
  benchmarks: Record<string, BenchmarkEntry[]>;
  buckets: BucketCount[];
  /**
   * ADDITIVE (not in the Python reference). Same buckets as `buckets`, but
   * counting unique training days rather than workouts logged — see
   * DashboardSummary.unique_days for why that's a distinct number.
   */
  days_buckets: BucketCount[];
  pr_timeline: PrTimelineEntry[];
  domain_trends: Record<Domain, DomainTrendPoint[]>;
  overall: Record<Domain, OverallDomainStat>;
  trend_direction: Record<Domain, TrendDirectionStat>;
  workout_lists: Record<Domain, WorkoutListEntry[]>;
  stacked: Stacked;
}

export type { SugarWodRow };
