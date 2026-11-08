/**
 * One entry on the athlete's timeline: something they changed or something that happened, over a stretch of time.
 * User-authored, stored on its own IndexedDB key (`timelineStorage.ts`), never derived from an upload.
 *
 * Three independent parts. Initiation is the only one a rule reads: an entry the athlete changed gets a before and
 * after comparison, one that happened is context only. The area groups and filters and drives no rule. Dates are
 * "YYYY-MM-DD"; a null `endDate` is an entry still going (ongoing), bounded only by today. A single day is an end
 * equal to the start.
 */
export type Initiation = "changed" | "happened";
export type EntryArea = "training" | "nutrition" | "health" | "travel" | "other";

export const INITIATIONS: readonly Initiation[] = ["changed", "happened"];
export const AREAS: readonly EntryArea[] = ["training", "nutrition", "health", "travel", "other"];

/** The kinds, as the form and the detail say them. */
export const INITIATION_LABEL: Record<Initiation, string> = {
  changed: "Something I changed",
  happened: "Something that happened",
};

/** What each kind means, under its card on the form. */
export const INITIATION_HINT: Record<Initiation, string> = {
  changed: "You chose or decided it. It gets a before and after comparison.",
  happened: "It came to you. It is shown beside your results for context.",
};

export const AREA_LABEL: Record<EntryArea, string> = {
  training: "Training",
  nutrition: "Nutrition",
  health: "Health",
  travel: "Travel",
  other: "Other",
};

export const NOTE_MAX_CHARS = 200;
export const NAME_MAX_CHARS = 80;

export interface TimelineEntry {
  id: string;
  initiation: Initiation;
  area: EntryArea;
  /** In the athlete's words ("Spring cut"). An unnamed entry reads by its area. */
  name?: string;
  note?: string;
  startDate: string;
  endDate: string | null;
}
