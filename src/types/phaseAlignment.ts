/**
 * Types for the Phase Alignment rollup (`src/lib/analytics/phaseAlignment.ts`).
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

export type PhaseAlignmentClassification = "aligned" | "tension" | "insufficient_data";

export interface PhaseAlignmentPerformanceSummary {
  improvingCount: number;
  /** plateaued_body_comp + plateaued_other combined. */
  plateauedCount: number;
  /** Subjects from #1 with a real classification; excludes insufficient_data. */
  classifiedCount: number;
}

export interface PhaseAlignmentBodyCompSummary extends PlateauBodyCompTrend {
  /** "" when no window is computable (zero classified subjects). */
  windowStart: string;
  windowEnd: string;
}

export interface PhaseAlignmentResult {
  classification: PhaseAlignmentClassification;
  /** Only set when classification === "insufficient_data". */
  reason?: string;
  performanceSummary: PhaseAlignmentPerformanceSummary;
  bodyCompSummary: PhaseAlignmentBodyCompSummary;
}
