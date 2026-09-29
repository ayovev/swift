import type { BodyCompMetric } from "@/lib/analytics/insightConfig";
import type { StrengthAttribution } from "@/lib/analytics/relativeStrength";

/**
 * A training block. `source: "user"` is the only source produced today: the
 * boundaries come from a tag (bulk, cut, maintain, other) or from dates the
 * athlete typed. "detected" is reserved for automatic segmentation, which is
 * deferred — see docs/insights-findings.md.
 */
export interface Cycle {
  label: string;
  /** "YYYY-MM-DD", inclusive. */
  start: string;
  end: string;
  /** Lifts that make up the largest shares of the cycle's logged lift sessions. */
  focusLifts: string[];
  source: "detected" | "user";
  /** The tag the boundaries came from, when they did. */
  tagId?: string;
}

export interface CycleLiftChange {
  lift: string;
  rxStatus: "RX" | "SCALED";
  focus: boolean;
  sessions: number;
  startE1rm: number;
  endE1rm: number;
  pctChange: number;
  /** From relative strength (Phase 2); absent when it could not attribute the change. */
  attribution?: StrengthAttribution;
  attributionReason?: string;
}

export interface CycleBodyChange {
  metric: BodyCompMetric;
  label: string;
  unit: "lb" | "%";
  start: number;
  end: number;
  delta: number;
  /** Exceeds the athlete's noise band (Phase 1). */
  meaningful: boolean;
}

export interface CycleReport {
  status: "ok" | "insufficient";
  /** Set when status is "insufficient". */
  reason?: string;
  cycle: Cycle;
  days: number;
  sessionsPerWeek: number | null;
  e1rmChanges: CycleLiftChange[];
  bodyCompChanges: CycleBodyChange[];
  /** Why there is no body-composition change, when there isn't one. */
  bodyCompReason?: string;
  /** What happened, in plain words. No judgement. */
  summary: string;
  /** Sentences naming any injury/travel tag inside the cycle; absent when none. */
  tagNotes?: string[];
}
