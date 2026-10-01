import { mergeTagsById } from "@/lib/analytics/contextTags";
import { experimentToTag } from "@/lib/analytics/experimentToTag";
import { validateExperiments } from "@/lib/sync/validateReceived";
import type { ContextTag } from "@/types/tag";
import { idbDelete, idbGet } from "./idbStore";
import { loadTags, saveTags } from "./tagsStorage";

/**
 * Experiments used to be their own stored list (key `"experiments"`). They are
 * tags of type "experiment" now, so this is the one remaining reader of that
 * key: it moves whatever is there into the tags list, once, and removes it.
 * Nothing else reads or writes the key, and nothing writes it any more.
 *
 * Safe to run on every load and to run twice:
 * - It writes the merged tags first and reads them back before it deletes the
 *   old key. `idbSet` swallows its own failures (idbStore.ts), so a write that
 *   didn't land would otherwise look like success and the experiments would be
 *   lost. If the read-back is short, the old key is left for the next load.
 * - A tag already holding an experiment's id wins, so a run that was
 *   interrupted after the write doesn't overwrite later edits.
 * - A stored list that doesn't validate is left untouched.
 */

const KEY = "experiments";

/**
 * Returns the tags as they stand after the migration, or `undefined` when
 * there was nothing to migrate. When the write can't be confirmed it still
 * returns the merged list, so the athlete sees their experiments this session.
 */
export async function migrateLegacyExperiments(): Promise<ContextTag[] | undefined> {
  const stored = await idbGet<unknown>(KEY);
  if (stored === undefined) return undefined;

  const checked = validateExperiments(stored);
  if (checked.status === "invalid") return undefined;

  const existing = (await loadTags()) ?? [];
  const merged = mergeTagsById(checked.value.map(experimentToTag), existing);

  await saveTags(merged);
  const saved = await loadTags();
  const savedIds = new Set((saved ?? []).map((t) => t.id));
  if (merged.every((t) => savedIds.has(t.id))) await idbDelete(KEY);

  return merged;
}
