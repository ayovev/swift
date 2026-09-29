/**
 * A stretch of time the athlete labels ("cut", "injury", "travel"), so an
 * insight can acknowledge context the two exports can't see. User-authored
 * and stored on its own IndexedDB key (`tagsStorage.ts`), never derived
 * from either upload.
 *
 * Dates are "YYYY-MM-DD" strings, same convention as `Experiment`, so they
 * survive IndexedDB's structured clone and JSON export unchanged. A null
 * `endDate` is an open-ended tag: still going, bounded only by today.
 */
export type TagType = "cut" | "bulk" | "maintain" | "injury" | "travel" | "other";

export const TAG_TYPES: readonly TagType[] = ["cut", "bulk", "maintain", "injury", "travel", "other"];

export interface ContextTag {
  id: string;
  type: TagType;
  /** A name for the tag ("Spring cut"). Falls back to the type when unset. */
  label?: string;
  startDate: string;
  endDate: string | null;
  note?: string;
}
