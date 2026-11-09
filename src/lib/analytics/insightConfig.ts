/**
 * Every tunable threshold the insight pipelines added after v1 read lives
 * here, each with how it was chosen. Nothing in `weightNoiseBand.ts` or the
 * progress verdict (`insights/`) hard-codes a bare number.
 *
 * EVERY value below is a starting point — *tunable, validate against real
 * data*. The repo bundles no real InBody history (only a synthetic fixture and
 * a synthetic sample generator), so none of these has yet been checked against
 * a real athlete's scans.
 */

/**
 * Two scans this close together (calendar days, inclusive) are treated as the
 * same physiological state measured twice, so their difference is noise
 * rather than change. A week is short enough that real weight change is
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
 * A measured band is never allowed below this fraction of the
 * default. A history of scans that happen to agree closely (or a tiny
 * sample) would otherwise produce a band near zero and call everything real.
 * Tunable.
 */
export const NOISE_BAND_FLOOR_FRACTION = 0.5;

/**
 * Last-resort weight band: the size of a change between two readings that is
 * still ordinary variation from hydration, meal timing and time of day. lb.
 * A conservative round number in line with commonly cited InBody test-retest
 * variation, NOT measured on any athlete. Tunable.
 */
export const NOISE_DEFAULT_WEIGHT_BAND_LB = 3;

// ── Overview (overview.ts) ───────────────────────────────────────────────

/**
 * Overview's "recent" window: the last N days ending today, compared with the
 * N days before that (docs/overview.md). 90 is long enough to absorb a travel
 * week or a sick week without reading as a collapse, and short enough that a
 * real change in training shows within a season. Anchored to today, never to
 * the last logged workout, so "the last 90 days" means the same dates on a
 * given day. Tunable.
 */
export const OVERVIEW_RECENT_DAYS = 90;

// ── Rep schemes and body-weight readings (insights/) ────────────────────

/**
 * Highest rep scheme an e1RM is estimated from. The export carries the top
 * load of a session and only the rep scheme named in the title, so this is
 * an estimate from one set; above ~8 reps the 1RM formulas diverge badly.
 * Tunable.
 */
export const PV_MAX_REPS = 8;

/**
 * Two readings bracketing a session are interpolated between only when they are
 * no further apart than this (days). Beyond it the body may well have
 * changed non-linearly between them, so the session falls back to the
 * nearest reading or stays without one. Tunable.
 */
export const PV_BODY_INTERPOLATION_GAP_DAYS = 45;

/** A session with no bracketing pair uses its nearest reading only if it is within this many days; else none, never extrapolated. Tunable. */
export const PV_BODY_NEAREST_READING_DAYS = 21;

// ── Window comparison (compareWindows.ts) ───────────────────────────────

// ── Cycle reports (cycleReport.ts) ──────────────────────────────────────

// ── Progress verdict (insights/) ────────────────────────────────────────
// The one real-change rule for a lift or benchmark. All tunable; the reasoning and the measurements behind each value are in
// tests/progressVerdict.test.ts (the cases).

/** Sessions each side of a verdict needs, so a subject needs twice this many. Fewer gives a facts line, not a weaker verdict. */
export const PV_MIN_SESSIONS_PER_SIDE = 3;

/** Most sessions on each side of a verdict (the recent N against the N before them, N = min(this, floor(sessions / 2))). */
export const PV_MAX_WINDOW = 4;

/**
 * Change in the best of each window, in percent, that reads as a real change. Compared after rounding half away from zero to one
 * decimal. Chosen over 3% because it differs from "3% or a record" on one subject of the sample, where the more conservative reading is right.
 */
export const PV_CHANGE_THRESHOLD_PCT = 5;

/**
 * A record is the recent best at least this far above the best of every session before the recent window. It sits above the estimator's
 * own error: Epley and Brzycki sit about 1.9% either side of their average, and mixed rep schemes are routine.
 */
export const PV_RECORD_MARGIN_PCT = 2;

/** A subject whose latest session is further than this many days before the reference date is "not recent" and is left out of the counts. */
export const PV_RECENT_DAYS = 365;

/** A move up to RX counts as an up vote for this many days after the first RX session. */
export const PV_MOVE_UP_VOTE_DAYS = 365;

/** Fewest counted subjects before the headline shows a label. */
export const PV_HEADLINE_MIN_COUNTED = 3;

/** Compared sessions spanning more than this many days earn a long-gap note (24 months). */
export const PV_LONG_GAP_DAYS = 730;
