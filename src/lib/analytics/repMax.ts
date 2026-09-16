/**
 * ADDITIVE to the Python reference.
 *
 * Infers the rep-max scheme (1RM, 3RM, 5RM, ...) a logged lift was working
 * toward, from the workout's free text. SugarWOD exports carry no rep-count
 * column, so "225" alone doesn't say whether that was a max single or the top
 * of a set of five — and plotting those as one series makes a lift chart lie.
 *
 * Checked in priority order:
 *   1. An explicit "1RM" / "3 RM" / "5-rm" — most authoritative.
 *   2. A rep ladder "10-8-6-4-3-3-2-2-1-1" — the LAST number is the heaviest,
 *      final effort, by CrossFit programming convention.
 *   3. "SxR" shorthand — "Back Squat 5x3" is 5 sets of 3, so 3 reps.
 *
 * Returns null when none appear, which is common for plainly-named entries
 * ("BACK SQUAT" with no detail). Guessing there would be worse than admitting
 * it's unknown, so the UI shows those as "rep scheme not specified".
 */

export type RepMaxBucket = "1RM" | "2-3RM" | "4-5RM" | "6+RM" | "unspecified";

const EXPLICIT_RM_RE = /(\d+)\s*-?\s*rm\b/i;
// Three or more hyphenated numbers — a ladder, not a date or a "21-15-9" pair.
const LADDER_RE = /\d+(?:-\d+){2,}/;
const SETS_X_REPS_RE = /(\d+)\s*x\s*(\d+)\b/i;

export function parseRepMax(text: string): number | null {
  const explicit = EXPLICIT_RM_RE.exec(text);
  if (explicit?.[1]) return Number.parseInt(explicit[1], 10);

  const ladder = LADDER_RE.exec(text);
  if (ladder) {
    const nums = ladder[0].split("-").map((n) => Number.parseInt(n, 10));
    const last = nums[nums.length - 1];
    if (last !== undefined && Number.isFinite(last)) return last;
  }

  const setsXReps = SETS_X_REPS_RE.exec(text);
  if (setsXReps?.[2]) return Number.parseInt(setsXReps[2], 10);

  return null;
}

export function repMaxBucket(reps: number | null): RepMaxBucket {
  if (reps === null) return "unspecified";
  if (reps <= 1) return "1RM";
  if (reps <= 3) return "2-3RM";
  if (reps <= 5) return "4-5RM";
  return "6+RM";
}

export const REP_MAX_BUCKET_ORDER: readonly RepMaxBucket[] = [
  "1RM",
  "2-3RM",
  "4-5RM",
  "6+RM",
  "unspecified",
];

export const REP_MAX_BUCKET_LABELS: Record<RepMaxBucket, string> = {
  "1RM": "1-rep max",
  "2-3RM": "2–3 rep max",
  "4-5RM": "4–5 rep max",
  "6+RM": "6+ rep max",
  unspecified: "rep scheme not specified",
};
