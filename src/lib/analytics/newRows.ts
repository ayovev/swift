import type { SugarWodRow } from "@/types/sugarwod";

/** What identifies an entry across two exports: SugarWOD gives rows no id, so the day, the name and what was done. */
const keyOf = (r: SugarWodRow): string => [r.date, r.title, r.description, r.best_result_raw].join("\u0001");

/**
 * How many entries in `next` are not in `previous`: what a re-export added.
 * Counted as a multiset, so two identical entries on one day (the same class
 * logged twice) are not hidden by one already being there. An entry whose
 * score was edited since the last export counts as new; the reveal only needs
 * a rough "did the refresh bring anything" answer, not an audit.
 */
export function countNewRows(previous: readonly SugarWodRow[], next: readonly SugarWodRow[]): number {
  const seen = new Map<string, number>();
  for (const r of previous) seen.set(keyOf(r), (seen.get(keyOf(r)) ?? 0) + 1);
  let added = 0;
  for (const r of next) {
    const k = keyOf(r);
    const left = seen.get(k) ?? 0;
    if (left > 0) seen.set(k, left - 1);
    else added += 1;
  }
  return added;
}
