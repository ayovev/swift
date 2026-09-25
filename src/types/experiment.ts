/**
 * Types for the Experiments feature (`src/lib/analytics/experimentInsight.ts`).
 *
 * Same two deviations from the feature spec as `plateau.ts`/`alignment.ts`, for the same
 * reasons: `Experiment.date` is an ISO string ("YYYY-MM-DD"), not a `Date` object — matches
 * every other persisted/exported date in this app and survives IndexedDB's structured clone
 * without the Dayjs-prototype pitfall `viewPreferencesStorage.ts` already documents for custom
 * date ranges. `ExperimentBodyCompSummary` reuses `PlateauBodyCompTrend` (`number | null`)
 * rather than the spec's plain `number`, since an individual InBody field can still be "-" (not
 * measured) on the specific two scans compared even once the eligibility gate passes.
 */

import type { PlateauBodyCompTrend } from "./plateau";

export interface Experiment {
  id: string;
  /** When the experiment started, "YYYY-MM-DD". */
  date: string;
  label: string;
}

export type ExperimentClassification = "improved" | "declined" | "no_change" | "mixed" | "insufficient_data";

export interface ExperimentPerformanceSummary {
  /** Subjects classified 'up' comparing before -> after the experiment's start date. */
  improvingCount: number;
  decliningCount: number;
  flatCount: number;
  /** Subjects with usable data on both sides of the start date; excludes everything else. */
  classifiedCount: number;
}

export interface ExperimentBodyCompSummary extends PlateauBodyCompTrend {}

export interface ExperimentInsight {
  experiment: Experiment;
  classification: ExperimentClassification;
  /** Only set when classification === "insufficient_data"; names which side is thin and by how much. */
  reason?: string;
  performanceSummary: ExperimentPerformanceSummary;
  bodyCompSummary: ExperimentBodyCompSummary;
}
