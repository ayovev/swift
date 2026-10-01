/**
 * Types for the before/after verdict (`src/lib/analytics/periodVerdict.ts`), which every
 * period in "Something you changed" gets (see `hasVerdict` in `contextTags.ts`).
 *
 * Same two deviations from the feature spec as `plateau.ts`/`alignment.ts`, for the same
 * reasons: dates are ISO strings ("YYYY-MM-DD"), not `Date` objects — matches every other
 * persisted/exported date in this app and survives IndexedDB's structured clone without the
 * Dayjs-prototype pitfall `viewPreferencesStorage.ts` already documents for custom date
 * ranges. `VerdictBodyCompSummary` reuses `PlateauBodyCompTrend` (`number | null`) rather than
 * the spec's plain `number`, since an individual InBody field can still be "-" (not measured)
 * on the specific two scans compared even once the eligibility gate passes.
 */

import type { ContextTag } from "./tag";
import type { PlateauBodyCompTrend } from "./plateau";

export type VerdictClassification = "improved" | "declined" | "no_change" | "mixed" | "insufficient_data";

export interface VerdictPerformanceSummary {
  /**
   * Subjects classified 'up' comparing before the start date to after it —
   * bounded by `endDate` when the period has one, otherwise open-ended.
   */
  improvingCount: number;
  decliningCount: number;
  flatCount: number;
  /** Subjects with usable data on both sides of the start date; excludes everything else. */
  classifiedCount: number;
}

export interface VerdictBodyCompSummary extends PlateauBodyCompTrend {}

export interface PeriodVerdict {
  /** The period this verdict is about. */
  period: ContextTag;
  classification: VerdictClassification;
  /** Only set when classification === "insufficient_data"; names which side is thin and by how much. */
  reason?: string;
  performanceSummary: VerdictPerformanceSummary;
  bodyCompSummary: VerdictBodyCompSummary;
}
