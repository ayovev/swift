/**
 * A stretch of time the athlete labels ("cut", "injury", "travel", "started
 * 5/3/1"), so an insight can acknowledge context the two exports can't see.
 * User-authored and stored on its own IndexedDB key (`tagsStorage.ts`), never
 * derived from either upload.
 *
 * One record covers what used to be two. An experiment is a tag of type
 * "experiment": something the athlete tried. What the app derives from a tag
 * follows its type, and the grouping below (`TAG_GROUPS`) is the one place that
 * is decided: every tag shades the charts; cut and injury are named where they
 * overlap a result; every type in "Something you changed" is also a training
 * block, can be opened on Compare, and gets a before/after verdict; injury and
 * travel are context only.
 *
 * Dates are "YYYY-MM-DD" strings, same convention as `Experiment`, so they
 * survive IndexedDB's structured clone and JSON export unchanged. A null
 * `endDate` is an open-ended tag: still going, bounded only by today.
 */
export type TagType =
  | "nutrition"
  | "cut"
  | "bulk"
  | "maintain"
  | "programming"
  | "cycle"
  | "deload"
  | "recovery"
  | "experiment"
  | "other"
  | "injury"
  | "travel";

/** How each type reads on screen. Lowercased, a label also stands in for the name of an unnamed period. */
export const TAG_TYPE_LABEL: Record<TagType, string> = {
  nutrition: "Nutrition change",
  cut: "Cut",
  bulk: "Bulk",
  maintain: "Maintain",
  programming: "Programming change",
  cycle: "New cycle",
  deload: "Deload",
  recovery: "Recovery change",
  experiment: "Experiment",
  other: "Other",
  injury: "Injury",
  travel: "Travel",
};

/** A domain inside a group, shown as a heading over its types in the picker. Absent for a group with only one. */
export interface TagCategory {
  label?: string;
  types: readonly TagType[];
}

export interface TagGroup {
  id: "changed" | "happened";
  label: string;
  /** What the picker switches to when the athlete moves to this group. */
  defaultType: TagType;
  categories: readonly TagCategory[];
}

/**
 * The two kinds of period, in plain words, and the domains inside the first.
 * Something you changed is something you chose to do, so "did it change
 * anything?" is a fair question; something that happened to you is context only
 * and never gets a verdict. Each domain has a generic catch-all ("Nutrition
 * change") so an athlete who isn't sure can pick it and put the detail in the
 * name; the specific types (cut, bulk, new cycle, deload) are optional
 * refinements. A type implies its domain, so no extra field is stored.
 */
export const TAG_GROUPS: readonly TagGroup[] = [
  {
    id: "changed",
    label: "Something you changed",
    defaultType: "experiment",
    categories: [
      { label: "Nutrition", types: ["nutrition", "cut", "bulk", "maintain"] },
      { label: "Programming", types: ["programming", "cycle", "deload"] },
      { label: "Recovery", types: ["recovery"] },
      { label: "Something else", types: ["experiment", "other"] },
    ],
  },
  {
    id: "happened",
    label: "Something that happened",
    defaultType: "injury",
    categories: [{ types: ["injury", "travel"] }],
  },
];

const typesOf = (group: TagGroup): TagType[] => group.categories.flatMap((c) => c.types);

export const TAG_TYPES: readonly TagType[] = TAG_GROUPS.flatMap(typesOf);

/** The types in "Something you changed": training blocks, openable on Compare, and judged by a verdict. */
export const CHANGE_TYPES: readonly TagType[] = typesOf(TAG_GROUPS[0]!);

export const isChangeType = (type: TagType): boolean => CHANGE_TYPES.includes(type);

/** The group a type belongs to. */
export function groupOfType(type: TagType): TagGroup {
  return TAG_GROUPS.find((g) => typesOf(g).includes(type)) ?? TAG_GROUPS[0]!;
}

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
   * a verdict (a period in "Something you changed") uses it; unset means all
   * earlier history. Kept on any tag so changing a tag's type never drops it.
   */
  baselineStart?: string;
}
