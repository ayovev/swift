/**
 * A stretch of time the athlete labels ("cut", "injury", "travel", "started
 * 5/3/1"), so an insight can acknowledge context the two exports can't see.
 * User-authored and stored on its own IndexedDB key (`tagsStorage.ts`), never
 * derived from either upload.
 *
 * One record covers what used to be two. An experiment is a tag of type
 * "experiment": a period the athlete has asked the app to judge. What the app
 * derives from a tag follows its type (see `TAG_GROUPS`): every tag shades the
 * charts, cut and injury are named where they overlap a result, the types in
 * "Something you changed" are also training blocks, and only "experiment"
 * gets a before/after verdict.
 *
 * Dates are "YYYY-MM-DD" strings, same convention as `Experiment`, so they
 * survive IndexedDB's structured clone and JSON export unchanged. A null
 * `endDate` is an open-ended tag: still going, bounded only by today.
 */
export type TagType = "experiment" | "cut" | "bulk" | "maintain" | "other" | "injury" | "travel";

/**
 * The two kinds of period the type picker groups, in plain words. Something
 * you changed is something you chose to do, so "did it change anything?" is a
 * fair question; something that happened to you is context only and never
 * gets a verdict.
 */
export const TAG_GROUPS: readonly { label: string; types: readonly TagType[] }[] = [
  { label: "Something you changed", types: ["experiment", "cut", "bulk", "maintain", "other"] },
  { label: "Something that happened", types: ["injury", "travel"] },
];

export const TAG_TYPES: readonly TagType[] = TAG_GROUPS.flatMap((g) => g.types);

export interface ContextTag {
  id: string;
  type: TagType;
  /** A name for the tag ("Spring cut"). Falls back to the type when unset. */
  label?: string;
  startDate: string;
  endDate: string | null;
  note?: string;
  /**
   * Where the "before" side of a before/after read starts, "YYYY-MM-DD". Only
   * an experiment's verdict uses it; unset means all earlier history. Kept on
   * any tag so changing a tag's type never drops it.
   */
  baselineStart?: string;
}
