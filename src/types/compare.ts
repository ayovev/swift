import type { BodyCompMetric } from "@/lib/analytics/insightConfig";
import type { PlateauSubject } from "./plateau";

/** An inclusive calendar range, "YYYY-MM-DD" on both ends. */
export interface DateWindow {
  start: string;
  end: string;
}

export interface PerformanceComparison {
  /** Display name, e.g. "Back Squat (RX)". */
  metric: string;
  subject: PlateauSubject;
  valueKind: "raw" | "estimated_1rm";
  /** Window means. null on both sides (and on `delta`) when `comparable` is false: no partial numbers. */
  before: number | null;
  after: number | null;
  delta: number | null;
  /** Signed so that positive is better, for lower-is-better benchmarks too. */
  pctChange: number | null;
  direction: "up" | "down" | "flat" | null;
  observations: { before: number; after: number };
  comparable: boolean;
  /** Set when `comparable` is false. */
  reason?: string;
}

export interface BodyCompComparison {
  metric: BodyCompMetric;
  label: string;
  unit: "lb" | "%";
  before: number | null;
  after: number | null;
  delta: number | null;
  /** True only when |delta| exceeds the metric's noise band. False when it doesn't, or when there is no delta. */
  meaningful: boolean;
  band: number;
  scans: { before: number; after: number };
  /** Set when there is no delta. */
  reason?: string;
}

export interface WindowComparison {
  status: "ok" | "insufficient";
  /** Set when status is "insufficient". */
  reason?: string;
  windowA: DateWindow;
  windowB: DateWindow;
  performance: PerformanceComparison[];
  bodyComp: BodyCompComparison[];
  caveats: string[];
}
