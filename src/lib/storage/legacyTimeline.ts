import { experimentToEntry, validateLegacyTags } from "@/lib/analytics/legacyTimeline";
import { mergeEntriesById } from "@/lib/analytics/timeline";
import { validateExperiments } from "@/lib/sync/validateReceived";
import type { TimelineEntry } from "@/types/timeline";
import { idbDelete, idbGet } from "./idbStore";
import { loadTimeline, saveTimeline } from "./timelineStorage";

/**
 * Entries used to be stored as "periods" under `"context-tags"`, and before that as experiments under `"experiments"`.
 * This is the one remaining reader of both keys: it moves whatever is there into the timeline, once, and removes it.
 * Nothing else reads or writes them, and nothing writes them any more.
 *
 * Safe to run on every load and to run twice:
 * - It writes the merged entries first and reads them back before it deletes an old key. `idbSet` swallows its own
 *   failures (idbStore.ts), so a write that didn't land would otherwise look like success and the entries would be
 *   lost. If the read-back is short, the old keys are left for the next load.
 * - An entry already holding an id wins, so a run interrupted after the write doesn't overwrite later edits.
 * - A stored list that doesn't validate is left untouched.
 */
const LEGACY_TAGS_KEY = "context-tags";
const LEGACY_EXPERIMENTS_KEY = "experiments";

/**
 * Returns the entries as they stand after the migration, or `undefined` when there was nothing to migrate. When the write
 * can't be confirmed it still returns the merged list, so the athlete sees their entries this session.
 */
export async function migrateLegacyTimeline(): Promise<TimelineEntry[] | undefined> {
  const [storedTags, storedExperiments] = await Promise.all([idbGet<unknown>(LEGACY_TAGS_KEY), idbGet<unknown>(LEGACY_EXPERIMENTS_KEY)]);
  if (storedTags === undefined && storedExperiments === undefined) return undefined;

  const found: TimelineEntry[] = [];
  const keysToClear: string[] = [];
  if (storedExperiments !== undefined) {
    const checked = validateExperiments(storedExperiments);
    if (checked.status === "ok") {
      found.push(...checked.value.map(experimentToEntry));
      keysToClear.push(LEGACY_EXPERIMENTS_KEY);
    }
  }
  if (storedTags !== undefined) {
    const checked = validateLegacyTags(storedTags);
    if (checked.status === "ok") {
      // Periods win over experiments of the same id, as they did before.
      found.splice(0, found.length, ...mergeEntriesById(found, checked.entries));
      keysToClear.push(LEGACY_TAGS_KEY);
    }
  }
  if (keysToClear.length === 0) return undefined;

  const existing = (await loadTimeline()) ?? [];
  const merged = mergeEntriesById(found, existing);

  await saveTimeline(merged);
  const saved = await loadTimeline();
  const savedIds = new Set((saved ?? []).map((e) => e.id));
  if (merged.every((e) => savedIds.has(e.id))) await Promise.all(keysToClear.map((key) => idbDelete(key)));

  return merged;
}
