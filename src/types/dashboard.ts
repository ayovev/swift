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

export const DOMAIN_BLURBS: Record<Domain, string> = {
  "Cardiovascular/Respiratory Endurance":
    "The ability of body systems to gather, process, and deliver oxygen. Driven by running, rowing, biking, and other engine work.",
  Stamina:
    "The ability of body systems to process, deliver, store, and use energy across sustained efforts — the classic long metcon or chipper.",
  Strength:
    "The productive application of force — squats, deadlifts, presses, and heavy pulls under load.",
  Flexibility:
    "The ability to maximize range of motion at a given joint. Rarely programmed directly — usually shows up as warmup or accessory work.",
  Power:
    "The ability to apply maximum force in minimum time — Olympic lifts, box jumps, and explosive movements.",
  Speed:
    "The ability to minimize the time cycle of a repeated movement — sprints, fast runs, and time-trial efforts.",
  Coordination:
    "The ability to combine several distinct movement patterns into a single distinct movement — muscle-ups, snatches, double-unders.",
  Agility:
    "The ability to minimize transition time from one movement pattern to another — burpees, box jumps, shuttle-style work.",
  Balance:
    "The ability to control the placement of the body's center of gravity relative to its base of support — handstands, pistols, carries.",
  Accuracy:
    "The ability to control movement in a given direction or at a given intensity — wall-balls, double-unders, anything with a target.",
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
}

export interface DashboardData {
  summary: DashboardSummary;
  lifts: Record<string, LiftEntry[]>;
  benchmarks: Record<string, BenchmarkEntry[]>;
  buckets: BucketCount[];
  pr_timeline: PrTimelineEntry[];
  domain_trends: Record<Domain, DomainTrendPoint[]>;
  overall: Record<Domain, OverallDomainStat>;
  trend_direction: Record<Domain, TrendDirectionStat>;
  workout_lists: Record<Domain, WorkoutListEntry[]>;
  stacked: Stacked;
}

export type { SugarWodRow };
