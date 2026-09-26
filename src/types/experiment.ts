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
 *
 * `endDate` is optional and follows the same ISO-string convention as `date` for the same
 * reason. Most experiments are open-ended ("started 5/3/1, still doing it"), so leaving it unset
 * keeps `getExperimentInsight`'s "after" window open (bounded only by `asOfDate`, as before this
 * field existed). Setting it marks the experiment as finished and narrows the comparison to the
 * period it actually ran, per `experimentInsight.ts`'s header comment.
 */

import type { PlateauBodyCompTrend } from "./plateau";

export interface Experiment {
  id: string;
  /** When the experiment started, "YYYY-MM-DD". */
  date: string;
  /** When the experiment ended, "YYYY-MM-DD". Unset means still ongoing. */
  endDate?: string;
  label: string;
}

export type ExperimentClassification = "improved" | "declined" | "no_change" | "mixed" | "insufficient_data";

export interface ExperimentPerformanceSummary {
  /**
   * Subjects classified 'up' comparing before the start date to after it —
   * bounded by `endDate` when the experiment has one, otherwise open-ended.
   */
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
