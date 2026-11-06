import { isIsoDay } from "./scanParsing";
import { TAG_TYPES, type ContextTag, type TagType } from "@/types/legacyTag";
import type { Experiment } from "@/types/experiment";
import type { EntryArea, Initiation, TimelineEntry } from "@/types/timeline";

/**
 * Reads the older shapes as timeline entries. A period (stored as a "context tag", before that an experiment) becomes an
 * entry by this table; nothing needs the athlete's attention. Only the readers live here: no build writes or sends the
 * older shapes any more.
 *
 *   cut, bulk, maintain, nutrition     I changed it, Nutrition
 *   programming, cycle, deload         I changed it, Training
 *   recovery                           I changed it, Health
 *   experiment, other                  I changed it, Other
 *   injury                             It happened, Health
 *   travel                             It happened, Travel
 *
 * The old type is not kept: a type that named the area ("cut") is lost as a name only when the period had none, so an
 * unnamed one takes its old type's words as its name rather than a bare area.
 */
const MAPPING: Record<TagType, { initiation: Initiation; area: EntryArea; word: string }> = {
  cut: { initiation: "changed", area: "nutrition", word: "Cut" },
  bulk: { initiation: "changed", area: "nutrition", word: "Bulk" },
  maintain: { initiation: "changed", area: "nutrition", word: "Maintain" },
  nutrition: { initiation: "changed", area: "nutrition", word: "Nutrition change" },
  programming: { initiation: "changed", area: "training", word: "Programming change" },
  cycle: { initiation: "changed", area: "training", word: "New cycle" },
  deload: { initiation: "changed", area: "training", word: "Deload" },
  recovery: { initiation: "changed", area: "health", word: "Recovery change" },
  experiment: { initiation: "changed", area: "other", word: "Experiment" },
  other: { initiation: "changed", area: "other", word: "Other" },
  injury: { initiation: "happened", area: "health", word: "Injury" },
  travel: { initiation: "happened", area: "travel", word: "Travel" },
};

export function tagToEntry(tag: ContextTag): TimelineEntry {
  const m = MAPPING[tag.type];
  const name = tag.label?.trim() ? tag.label.trim() : m.word;
  return {
    id: tag.id,
    initiation: m.initiation,
    area: m.area,
    name,
    ...(tag.note ? { note: tag.note } : {}),
    startDate: tag.startDate,
    endDate: tag.endDate,
  };
}

export function experimentToEntry(experiment: Experiment): TimelineEntry {
  return {
    id: experiment.id,
    initiation: "changed",
    area: "other",
    name: experiment.label,
    startDate: experiment.date,
    endDate: experiment.endDate ?? null,
  };
}

export type LegacyTagsResult = { status: "ok"; entries: TimelineEntry[] } | { status: "invalid"; reason: string };

/** Validates a list of periods from an older device or backup, then reads it as entries. */
export function validateLegacyTags(list: unknown): LegacyTagsResult {
  if (!Array.isArray(list)) return { status: "invalid", reason: "That file doesn't contain a list of periods." };
  const tags: ContextTag[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const t = raw as Partial<Record<keyof ContextTag, unknown>> | null;
    if (!t || typeof t !== "object" || Array.isArray(t)) return { status: "invalid", reason: `Period ${n} isn't an object.` };
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
  return { status: "ok", entries: tags.map(tagToEntry) };
}
