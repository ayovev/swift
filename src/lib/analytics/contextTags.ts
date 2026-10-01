import dayjs from "dayjs";
import { formatDay } from "./formatting";
import { isIsoDay } from "./scanParsing";
import { TAG_TYPE_LABEL, TAG_TYPES, isChangeType, type ContextTag, type TagType } from "@/types/tag";

/**
 * Pure helpers over the athlete's context tags: overlap tests, the one
 * sentence an insight uses to acknowledge a tag, and the validation that
 * sync and backup restore run on a received list.
 *
 * Tags never change a classification or a number. An insight that overlaps a
 * tag adds a sentence naming it; with no tags (or none overlapping) its
 * output is byte-for-byte what it was before tags existed.
 */

/**
 * Whether a period gets a before/after verdict (`getPeriodVerdict`): every type
 * in "Something you changed", not only "experiment". Injury and travel are
 * context and never do.
 */
export const hasVerdict = (tag: ContextTag): boolean => isChangeType(tag.type);

/** `incoming` wins on a shared id; everything else is kept, in order. */
export function mergeTagsById(existing: readonly ContextTag[], incoming: readonly ContextTag[]): ContextTag[] {
  const replaced = new Set(incoming.map((t) => t.id));
  return [...existing.filter((t) => !replaced.has(t.id)), ...incoming];
}

/** The tag's own name, or its type ("cut", "new cycle") when it has none. */
export function tagLabel(tag: ContextTag): string {
  return tag.label?.trim() ? tag.label.trim() : TAG_TYPE_LABEL[tag.type].toLowerCase();
}

/** `"Spring cut" (cut, Mar 1, 2026 – ongoing)` */
export function describeTag(tag: ContextTag): string {
  const span = `${formatDay(tag.startDate)} – ${tag.endDate ? formatDay(tag.endDate) : "ongoing"}`;
  const name = tagLabel(tag);
  const type = TAG_TYPE_LABEL[tag.type].toLowerCase();
  return name === type ? `${type} period (${span})` : `"${name}" (${type}, ${span})`;
}

/** Whether the tag and the inclusive window share at least one day. An open-ended tag runs to the end of time. */
export function tagOverlaps(tag: ContextTag, windowStart: string, windowEnd: string): boolean {
  const start = dayjs(tag.startDate);
  const end = tag.endDate ? dayjs(tag.endDate) : null;
  if (!start.isValid() || (end && !end.isValid())) return false;
  if (start.isAfter(dayjs(windowEnd), "day")) return false;
  if (end && end.isBefore(dayjs(windowStart), "day")) return false;
  return true;
}

export function overlappingTags(
  tags: readonly ContextTag[],
  windowStart: string,
  windowEnd: string,
  types?: readonly TagType[]
): ContextTag[] {
  return tags
    .filter((t) => (!types || types.includes(t.type)) && tagOverlaps(t, windowStart, windowEnd))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

/**
 * A sentence shown under an experiment-style verdict for the types where a
 * decline is expected, so a verdict reads in context rather than as a grade.
 * Same wording `acknowledgeTags` uses for a cut overlapping a plateau.
 */
export const VERDICT_NOTE: Partial<Record<TagType, string>> = {
  cut: "Lifts and lean mass often move differently during a cut.",
};

/** Tag types an insight acknowledges by name in its explanation. */
const ACKNOWLEDGED_TYPES: readonly TagType[] = ["cut", "injury"];

/**
 * One sentence per overlapping cut/injury tag, each naming the tag. Empty
 * when nothing overlaps — callers omit the field entirely then, so an
 * untagged result is unchanged.
 */
export function acknowledgeTags(
  tags: readonly ContextTag[] | undefined,
  windowStart: string,
  windowEnd: string,
  windowNoun: string
): string[] {
  if (!tags || windowStart === "" || windowEnd === "") return [];
  return overlappingTags(tags, windowStart, windowEnd, ACKNOWLEDGED_TYPES).map((t) =>
    t.type === "cut"
      ? `This ${windowNoun} overlaps ${describeTag(t)}; lifts and lean mass often move differently during a cut.`
      : `This ${windowNoun} overlaps ${describeTag(t)}; a change in training during an injury is not a plateau in the usual sense.`
  );
}

// ── Validation ──────────────────────────────────────────────────────────

export type TagsParseResult = { status: "ok"; tags: ContextTag[] } | { status: "invalid"; reason: string };


/**
 * Validates a list of tags — from a backup file or from another device.
 * Strict on purpose: a hand-edited or wrong list is rejected with a sentence
 * saying which entry is wrong, rather than half-imported. Unknown extra keys
 * are dropped.
 */
export function validateTagList(list: unknown): TagsParseResult {
  if (!Array.isArray(list)) return { status: "invalid", reason: "That file doesn't contain a list of periods." };

  const tags: ContextTag[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const t = raw as Partial<Record<keyof ContextTag, unknown>> | null;
    if (!t || typeof t !== "object") return { status: "invalid", reason: `Period ${n} isn't an object.` };
    if (typeof t.id !== "string" || t.id === "") return { status: "invalid", reason: `Period ${n} has no id.` };
    if (seen.has(t.id)) return { status: "invalid", reason: `Period ${n} repeats an id used by an earlier period.` };
    if (!TAG_TYPES.includes(t.type as TagType)) return { status: "invalid", reason: `Period ${n} has an unknown type.` };
    if (!isIsoDay(t.startDate)) return { status: "invalid", reason: `Period ${n} has no valid start date (YYYY-MM-DD).` };
    if (t.endDate !== null && t.endDate !== undefined && !isIsoDay(t.endDate)) {
      return { status: "invalid", reason: `Period ${n} has an end date that isn't YYYY-MM-DD.` };
    }
    const endDate = (t.endDate ?? null) as string | null;
    if (endDate !== null && endDate < t.startDate) return { status: "invalid", reason: `Period ${n} ends before it starts.` };
    if (t.label !== undefined && typeof t.label !== "string") return { status: "invalid", reason: `Period ${n} has a label that isn't text.` };
    if (t.note !== undefined && typeof t.note !== "string") return { status: "invalid", reason: `Period ${n} has a note that isn't text.` };
    if (t.baselineStart !== undefined && !isIsoDay(t.baselineStart)) {
      return { status: "invalid", reason: `Period ${n} has a compare-against start that isn't YYYY-MM-DD.` };
    }
    seen.add(t.id);
    tags.push({
      id: t.id,
      type: t.type as TagType,
      ...(typeof t.label === "string" && t.label !== "" ? { label: t.label } : {}),
      startDate: t.startDate,
      endDate,
      ...(typeof t.note === "string" && t.note !== "" ? { note: t.note } : {}),
      ...(typeof t.baselineStart === "string" ? { baselineStart: t.baselineStart } : {}),
    });
  }
  return { status: "ok", tags };
}

// ── Chart bands ─────────────────────────────────────────────────────────

export interface AxisSpan {
  /** Inclusive calendar span the x-position stands for (a bucket, or a single day). */
  start: string;
  end: string;
}

export interface TagBandSpan {
  tag: ContextTag;
  /** Indexes into the axis: the first and last x-position the tag touches. */
  first: number;
  last: number;
}

/**
 * Where each tag falls on a time axis, as index ranges into `axis`. A tag
 * outside the plotted range produces no band. Not clipped or stretched: a
 * band covers exactly the x-positions whose span it overlaps.
 */
export function tagBandSpans(tags: readonly ContextTag[], axis: readonly AxisSpan[]): TagBandSpan[] {
  const out: TagBandSpan[] = [];
  for (const tag of tags) {
    let first = -1;
    let last = -1;
    axis.forEach((x, i) => {
      if (tagOverlaps(tag, x.start, x.end)) {
        if (first === -1) first = i;
        last = i;
      }
    });
    if (first !== -1) out.push({ tag, first, last });
  }
  return out;
}
