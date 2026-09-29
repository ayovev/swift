/**
 * Every tunable threshold the insight pipelines added after v1 read lives
 * here, each with how it was chosen. Nothing in `bodyCompNoise.ts` (or the
 * later relative-strength / comparison / cycle modules) hard-codes a bare
 * number.
 *
 * EVERY value below is a starting point — *tunable, validate against real
 * data*. The repo bundles no real InBody history (only a synthetic fixture and
 * a synthetic sample generator), so none of these has yet been checked against
 * a real athlete's scans. `scripts/insight_findings.ts` prints what each one
 * does on real exports; run it before trusting a number.
 *
 * The pre-existing thresholds (`TREND_THRESHOLD`, the MIN_* eligibility gates
 * in plateauDetector.ts / alignment.ts / experimentInsight.ts) stay where they
 * are: they are documented in place and moving them is out of Phase 1's scope.
 */

export type BodyCompMetric = "weight" | "leanMass" | "fatMass" | "bodyFatPct";

export const BODY_COMP_METRICS: readonly BodyCompMetric[] = ["weight", "leanMass", "fatMass", "bodyFatPct"];

/**
 * Two scans this close together (calendar days, inclusive) are treated as the
 * same physiological state measured twice, so their difference is noise
 * rather than change. A week is short enough that real lean/fat change is
 * small next to hydration swings, long enough that a typical athlete has
 * some pairs. Tunable.
 */
export const NOISE_PAIR_MAX_GAP_DAYS = 7;

/** Fewest close-together pairs before the paired-scans method is trusted. Small samples make a spread estimate unstable. Tunable. */
export const NOISE_MIN_PAIRS = 4;

/**
 * Residual method: each scan is compared against the median of the
 * `NOISE_RESIDUAL_HALF_WINDOW` scans on either side of it (itself excluded).
 * A symmetric window cancels a steady trend, so a steadily gaining athlete
 * does not read as noisy. Two per side = a five-scan window. Tunable.
 */
export const NOISE_RESIDUAL_HALF_WINDOW = 2;

/**
 * A residual window is only used if its outermost scans are no further apart
 * than this many days. Beyond that the athlete's real change between scans
 * would be counted as noise. Twelve weeks. Tunable.
 */
export const NOISE_RESIDUAL_MAX_SPAN_DAYS = 84;

/** Fewest usable residuals before the residual method is trusted. Tunable. */
export const NOISE_MIN_RESIDUALS = 4;

/**
 * A change between two scans has to exceed this many robust standard
 * deviations of scan-to-scan difference to count as real. 2 is roughly a
 * 95% one-sample cut for normal noise; deliberately conservative, because
 * the cost of calling noise "a change" is a wrong sentence about the athlete.
 * Tunable.
 */
export const NOISE_BAND_MULTIPLIER = 2;

/** Converts a median absolute deviation to a standard deviation for normal data. Not tunable. */
export const MAD_TO_SD = 1.4826;

/**
 * A measured band is never allowed below this fraction of the metric's
 * default. A history of scans that happen to agree closely (or a tiny
 * sample) would otherwise produce a band near zero and call everything real.
 * Tunable.
 */
export const NOISE_BAND_FLOOR_FRACTION = 0.5;

/**
 * Last-resort band per metric: the size of a change between two scans that is
 * still ordinary variation from hydration, meal timing and time of day. Units
 * are lb, except body fat which is percentage points. These are conservative
 * round numbers in line with commonly cited InBody test-retest variation —
 * NOT measured on any athlete. Tunable.
 */
export const DEFAULT_NOISE_BAND: Record<BodyCompMetric, number> = {
  weight: 3,
  leanMass: 3,
  fatMass: 3,
  bodyFatPct: 1.5,
};

/**
 * Morning/afternoon diagnostic: local hour at which "morning" ends.
 * Diagnostic only — no adjustment is built on it until the maintainer has
 * seen the findings. Tunable.
 */
export const TIME_OF_DAY_SPLIT_HOUR = 12;

/** Fewest scans on each side of the split before a morning/afternoon comparison is reported. Tunable. */
export const TIME_OF_DAY_MIN_PER_SIDE = 5;

// ── Relative strength (relativeStrength.ts) ─────────────────────────────

/**
 * Highest rep scheme an e1RM is estimated from. The export carries the top
 * load of a session and only the rep scheme named in the title, so this is
 * an estimate from one set; above ~8 reps the 1RM formulas diverge badly.
 * Tunable.
 */
export const RS_MAX_REPS = 8;

/** Look-back for one lift's attribution window, in days, ending at `asOfDate`. Tunable. */
export const RS_WINDOW_DAYS = 365;

/** Fewest sessions (dates with a usable e1RM) a lift needs inside the window. Tunable. */
export const RS_MIN_SESSIONS = 4;

/** Fewest of those sessions that must have a body-composition match. Tunable. */
export const RS_MIN_MATCHED_SESSIONS = 3;

/** Fewest InBody scans overlapping the window. Tunable. */
export const RS_MIN_SCANS_IN_WINDOW = 2;

/**
 * Two scans bracketing a session are interpolated between only when they are
 * no further apart than this (days). Beyond it the body may well have
 * changed non-linearly between them, so the session falls back to the
 * nearest scan or stays unmatched. Tunable.
 */
export const RS_MAX_INTERPOLATION_GAP_DAYS = 45;

/** A session with no bracketing pair uses its nearest scan only if it is within this many days; else unmatched, never extrapolated. Tunable. */
export const RS_MAX_NEAREST_SCAN_DAYS = 21;

/** Sessions averaged at each end of the window when comparing start to end. Capped at half the sessions. Tunable. */
export const RS_END_SEGMENT_SESSIONS = 3;
