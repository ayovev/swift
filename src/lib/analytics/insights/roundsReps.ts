/**
 * Rounds + Reps scores, split out of `sessions.ts` on purpose: `display.ts` needs these, `bodyContext.ts` needs `display.ts`, and the
 * weigh-in code the upload screen loads needs `bodyContext.ts`. Imported from `sessions.ts` they dragged the whole workout classifier
 * (`liftSubjects` -> `buildDashboardData` -> the movement lexicon) into the first load. Keep this file free of imports from there.
 * `sessions.ts` re-exports both, so existing imports are unchanged. See CLAUDE.md, "Architecture: the bundle split".
 */

/** Reps in one round, for the Rounds + Reps benchmarks whose round is fixed (Cindy: 5 + 10 + 15). Without it a difference in reps is not stated. */
export const REPS_PER_ROUND: Record<string, number> = { cindy: 30 };

/** "17+20" is 17 rounds and 20 reps; "16" is 16 rounds. */
export function parseRoundsReps(display: string): { rounds: number; reps: number } | null {
  const m = /^\s*(\d+)(?:\s*\+\s*(\d+))?\s*$/.exec(display);
  return m ? { rounds: Number(m[1]), reps: Number(m[2] ?? 0) } : null;
}
