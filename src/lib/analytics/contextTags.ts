import dayjs from "dayjs";
import { TAG_TYPES, type ContextTag, type TagType } from "@/types/tag";

/**
 * Pure helpers over the athlete's context tags: overlap tests, the one
 * sentence an insight uses to acknowledge a tag, and JSON export/import.
 *
 * Tags never change a classification or a number. An insight that overlaps a
 * tag adds a sentence naming it; with no tags (or none overlapping) its
 * output is byte-for-byte what it was before tags existed.
 */

const fmt = (iso: string) => dayjs(iso).format("MMM D, YYYY");

/** The tag's own name, or its type when it has none. */
export function tagLabel(tag: ContextTag): string {
  return tag.label?.trim() ? tag.label.trim() : tag.type;
}

/** `"Spring cut" (cut, Mar 1, 2026 – ongoing)` */
export function describeTag(tag: ContextTag): string {
  const span = `${fmt(tag.startDate)} – ${tag.endDate ? fmt(tag.endDate) : "ongoing"}`;
  const name = tagLabel(tag);
  return name === tag.type ? `${tag.type} tag (${span})` : `"${name}" (${tag.type}, ${span})`;
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

/** Tag types an insight acknowledges by name in its explanation. */
export const ACKNOWLEDGED_TYPES: readonly TagType[] = ["cut", "injury"];

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

// ── JSON export / import ────────────────────────────────────────────────

export interface TagsFile {
  swiftTags: 1;
  tags: ContextTag[];
}

export function serializeTags(tags: readonly ContextTag[]): string {
  const file: TagsFile = { swiftTags: 1, tags: [...tags] };
  return JSON.stringify(file, null, 2);
}

export type TagsParseResult = { status: "ok"; tags: ContextTag[] } | { status: "invalid"; reason: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && dayjs(s, "YYYY-MM-DD", true).isValid();

/**
 * Reads a tags file back in. Strict on purpose: a hand-edited or wrong file
 * is rejected with a sentence saying which entry is wrong, rather than
 * half-imported. Unknown extra keys are dropped.
 */
export function parseTagsJson(text: string): TagsParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: "invalid", reason: "That file isn't valid JSON." };
  }
  const list = Array.isArray(data) ? data : (data as Partial<TagsFile> | null)?.tags;
  if (!Array.isArray(list)) return { status: "invalid", reason: "That file doesn't contain a list of tags." };

  const tags: ContextTag[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const t = raw as Partial<Record<keyof ContextTag, unknown>> | null;
    if (!t || typeof t !== "object") return { status: "invalid", reason: `Tag ${n} isn't an object.` };
    if (typeof t.id !== "string" || t.id === "") return { status: "invalid", reason: `Tag ${n} has no id.` };
    if (seen.has(t.id)) return { status: "invalid", reason: `Tag ${n} repeats an id used by an earlier tag.` };
    if (!TAG_TYPES.includes(t.type as TagType)) return { status: "invalid", reason: `Tag ${n} has an unknown type.` };
    if (!validDate(t.startDate)) return { status: "invalid", reason: `Tag ${n} has no valid start date (YYYY-MM-DD).` };
    if (t.endDate !== null && t.endDate !== undefined && !validDate(t.endDate)) {
      return { status: "invalid", reason: `Tag ${n} has an end date that isn't YYYY-MM-DD.` };
    }
    const endDate = (t.endDate ?? null) as string | null;
    if (endDate !== null && endDate < t.startDate) return { status: "invalid", reason: `Tag ${n} ends before it starts.` };
    if (t.label !== undefined && typeof t.label !== "string") return { status: "invalid", reason: `Tag ${n} has a label that isn't text.` };
    if (t.note !== undefined && typeof t.note !== "string") return { status: "invalid", reason: `Tag ${n} has a note that isn't text.` };
    seen.add(t.id);
    tags.push({
      id: t.id,
      type: t.type as TagType,
      ...(typeof t.label === "string" && t.label !== "" ? { label: t.label } : {}),
      startDate: t.startDate,
      endDate,
      ...(typeof t.note === "string" && t.note !== "" ? { note: t.note } : {}),
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
