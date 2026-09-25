/**
 * Types for the Alignment rollup (`src/lib/analytics/alignment.ts`).
 *
 * Same two deviations from the feature spec as `plateau.ts`, for the same
 * reasons: `windowStart`/`windowEnd` are ISO date strings ("YYYY-MM-DD"), not
 * `Date` objects, and the body-comp deltas reuse `PlateauBodyCompTrend`
 * (`number | null`) rather than the spec's plain `number` — the scan-count
 * gate only checks *count*, not per-field completeness, so an individual
 * InBody field can still be "-" (not measured) on the specific two scans
 * compared even once the gate passes.
 */

import type { PlateauBodyCompTrend } from "./plateau";

export type AlignmentClassification = "aligned" | "tension" | "insufficient_data";

export interface AlignmentPerformanceSummary {
  improvingCount: number;
  /** plateaued_body_comp + plateaued_other combined. */
  plateauedCount: number;
  /** Subjects from #1 with a real classification; excludes insufficient_data. */
  classifiedCount: number;
}

export interface AlignmentBodyCompSummary extends PlateauBodyCompTrend {
  /** "" when no window is computable (zero classified subjects). */
  windowStart: string;
  windowEnd: string;
}

export interface AlignmentResult {
  classification: AlignmentClassification;
  /** Only set when classification === "insufficient_data". */
  reason?: string;
  performanceSummary: AlignmentPerformanceSummary;
  bodyCompSummary: AlignmentBodyCompSummary;
}
