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

/**
 * The four rep-max schemes SugarWOD athletes actually chase (1/2/3/5RM), plus a
 * neutral catch-all for everything else a workout might be — a 4RM off a rep
 * ladder, a 6+RM, or unspecified. Coloring dots by exact reps only makes sense
 * for the schemes people actually train toward; folding the rest into "other"
 * avoids implying a 4RM is a 5RM just because they're chart-adjacent.
 */
export type RepMaxCategory = "1RM" | "2RM" | "3RM" | "5RM" | "other";

export function repMaxCategory(reps: number | null): RepMaxCategory {
  if (reps === 1) return "1RM";
  if (reps === 2) return "2RM";
  if (reps === 3) return "3RM";
  if (reps === 5) return "5RM";
  return "other";
}

export function repMaxLabel(reps: number | null): string {
  return reps === null ? "rep scheme not specified" : `${reps}-rep max`;
}

/** The 4 rep-max schemes precise enough to filter, chart, and summarize by. */
export type TrackedRepMaxCategory = Exclude<RepMaxCategory, "other">;

export interface RepMaxPr {
  value: number;
  date: string;
}

/**
 * A lift's current standing PR for each tracked rep-max scheme, taken from
 * whichever PR-flagged entries the source data has for that lift. A lift can
 * be PR'd more than once at the same scheme over the years (e.g. two 1RM
 * PRs), so this keeps the highest value seen, not just the most recent.
 */
export function currentTrackedPrs(
  entries: readonly { value: number; pr: boolean; date: string; repMax: number | null }[]
): Partial<Record<TrackedRepMaxCategory, RepMaxPr>> {
  const best: Partial<Record<TrackedRepMaxCategory, RepMaxPr>> = {};
  for (const entry of entries) {
    if (!entry.pr) continue;
    const category = repMaxCategory(entry.repMax);
    if (category === "other") continue;
    const current = best[category];
    if (!current || entry.value > current.value) {
      best[category] = { value: entry.value, date: entry.date };
    }
  }
  return best;
}
