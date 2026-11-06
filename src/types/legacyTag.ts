/**
 * What an older build stored and sent as a "period" (a context tag), kept only so it can still be read.
 * Nothing writes or sends this shape any more: `legacyTimeline.ts` turns it into a timeline entry
 * (`types/timeline.ts`) on load, on a sync that still names `tags`, and on a restore of an older backup.
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

export const TAG_TYPES: readonly TagType[] = [
  "nutrition", "cut", "bulk", "maintain", "programming", "cycle", "deload", "recovery", "experiment", "other", "injury", "travel",
];

export interface ContextTag {
  id: string;
  type: TagType;
  label?: string;
  startDate: string;
  endDate: string | null;
  note?: string;
  /** Read and ignored: the comparison no longer starts at a chosen date. */
  baselineStart?: string;
}
