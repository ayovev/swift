/**
 * Types for the plateau detector (`src/lib/analytics/plateauDetector.ts`).
 *
 * Deviation from the original feature spec: dates here are ISO strings
 * ("YYYY-MM-DD"), not `Date` objects. Every other exported analytics type in
 * this app (`src/types/dashboard.ts`, `src/types/modality.ts`) uses ISO
 * strings — Dayjs/Date only ever appear as internal working values — so this
 * follows that convention instead of the spec's literal typing. Same
 * semantics, codebase-consistent representation.
 */

export type PlateauClassification =
  | "improving"
  | "plateaued_body_comp"
  | "plateaued_other"
  | "insufficient_data";

export interface PlateauSubject {
  type: "lift" | "benchmark_wod";
  /** Display name, e.g. "Back Squat", "Grace". */
  name: string;
  status: "RX" | "SCALED";
}

export interface PlateauPerformancePoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface PlateauPerformanceTrend {
  direction: "up" | "down" | "flat";
  /** The entries in the "recent" comparison window, chronological. */
  recentPoints: PlateauPerformancePoint[];
}

export interface PlateauBodyCompTrend {
  /** null = no comparable field had data on both window boundaries. */
  leanMassDelta: number | null;
  fatMassDelta: number | null;
  bodyFatPctDelta: number | null;
}

export interface PlateauInsight {
  subject: PlateauSubject;
  classification: PlateauClassification;
  windowStart: string; // "YYYY-MM-DD"
  windowEnd: string; // "YYYY-MM-DD"
  performanceTrend: PlateauPerformanceTrend;
  bodyCompTrend?: PlateauBodyCompTrend;
  confidence: "low" | "medium" | "high";
}
