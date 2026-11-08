import dayjs from "dayjs";
import { formatDay } from "./formatting";
import { isIsoDay } from "./scanParsing";
import {
  AREAS,
  AREA_LABEL,
  INITIATIONS,
  NAME_MAX_CHARS,
  NOTE_MAX_CHARS,
  type EntryArea,
  type Initiation,
  type TimelineEntry,
} from "@/types/timeline";

/**
 * Pure helpers over the athlete's timeline entries: the form's rules, the check on a list that arrives from sync or a
 * backup, names and spans in words, overlap, and the lanes the Timeline view stacks entries into.
 *
 * An entry never changes a verdict, a count, a label or a body-context line; it sits beside them. The one thing a rule
 * reads is the initiation (`entryVerdict.ts`).
 */

/** What the form holds. Nothing is pre-selected, so `initiation`, `area` and the dates start empty. */
export interface EntryInput {
  initiation: Initiation | "";
  area: EntryArea | "";
  startDate: string;
  endDate: string;
  ongoing: boolean;
  name: string;
  note: string;
}

export const EMPTY_ENTRY_INPUT: EntryInput = { initiation: "", area: "", startDate: "", endDate: "", ongoing: true, name: "", note: "" };

/** Every rule the input fails, each as a plain sentence, in form order. Empty means it can be saved. */
export function validateEntryInput(input: EntryInput, today: string): string[] {
  const reasons: string[] = [];
  if (input.initiation === "") reasons.push("Choose whether you changed it or it happened.");
  if (input.area === "") reasons.push("Choose what it touches.");
  const startOk = isIsoDay(input.startDate);
  if (!startOk) reasons.push("Add a start date.");
  else if (input.startDate > today) reasons.push("The start date is after today.");
  if (!input.ongoing) {
    if (!isIsoDay(input.endDate)) reasons.push("Add an end date, or tick Ongoing.");
    else if (startOk && input.endDate < input.startDate) reasons.push("The end date is before the start date.");
  }
  if (input.name.trim().length > NAME_MAX_CHARS) reasons.push(`The name is over ${NAME_MAX_CHARS} characters.`);
  if (input.note.trim().length > NOTE_MAX_CHARS) reasons.push(`The note is over ${NOTE_MAX_CHARS} characters.`);
  return reasons;
}

/** The entry an input describes. Call only when `validateEntryInput` returned nothing. */
export function entryFromInput(input: EntryInput, id: string): TimelineEntry {
  const name = input.name.trim();
  const note = input.note.trim();
  return {
    id,
    initiation: input.initiation as Initiation,
    area: input.area as EntryArea,
    ...(name ? { name } : {}),
    ...(note ? { note } : {}),
    startDate: input.startDate,
    endDate: input.ongoing ? null : input.endDate,
  };
}

export function inputFromEntry(entry: TimelineEntry): EntryInput {
  return {
    initiation: entry.initiation,
    area: entry.area,
    startDate: entry.startDate,
    endDate: entry.endDate ?? "",
    ongoing: entry.endDate === null,
    name: entry.name ?? "",
    note: entry.note ?? "",
  };
}

/** The entry's own name, or its area ("Nutrition") when it has none. */
export function entryName(entry: TimelineEntry): string {
  return entry.name?.trim() ? entry.name.trim() : AREA_LABEL[entry.area];
}

/** The last day an entry covers: its end, or the reference date for an ongoing one. */
export const entryEnd = (entry: TimelineEntry, asOf: string): string => entry.endDate ?? (asOf < entry.startDate ? entry.startDate : asOf);

const monthYear = (iso: string): string => dayjs(iso).format("MMM YYYY");

/** "Mar 1, 2026 to Apr 2, 2026", "Mar 1, 2026" (a single day) or "Ongoing since Mar 2026". */
export function entrySpanText(entry: TimelineEntry): string {
  if (entry.endDate === null) return `Ongoing since ${monthYear(entry.startDate)}`;
  if (entry.endDate === entry.startDate) return formatDay(entry.startDate);
  return `${formatDay(entry.startDate)} to ${formatDay(entry.endDate)}`;
}

/** Whether two entries share at least one day. An ongoing entry runs to the reference date. */
export function entriesOverlap(a: TimelineEntry, b: TimelineEntry, asOf: string): boolean {
  return a.startDate <= entryEnd(b, asOf) && b.startDate <= entryEnd(a, asOf);
}

/** The other entries that overlap this one, earliest first. */
export function overlappingEntries(entry: TimelineEntry, all: readonly TimelineEntry[], asOf: string): TimelineEntry[] {
  return all
    .filter((other) => other.id !== entry.id && entriesOverlap(entry, other, asOf))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

export interface PlacedEntry {
  entry: TimelineEntry;
  lane: number;
}

/**
 * Stacks entries into lanes so none overlaps another in its lane: each entry takes the first lane whose last entry ended
 * before this one starts. Earliest start first, so the result is stable and nothing computes "overlap" for the reader to
 * trust; the stacking shows it.
 */
export function packLanes(entries: readonly TimelineEntry[], asOf: string): { placed: PlacedEntry[]; lanes: number } {
  const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const laneEnds: string[] = [];
  const placed: PlacedEntry[] = [];
  for (const entry of sorted) {
    let lane = laneEnds.findIndex((end) => end < entry.startDate);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entryEnd(entry, asOf);
    placed.push({ entry, lane });
  }
  return { placed, lanes: laneEnds.length };
}

// ── Validation of a received list ───────────────────────────────────────

export type EntryListResult = { status: "ok"; entries: TimelineEntry[] } | { status: "invalid"; reason: string };

/**
 * Validates a list of entries from a backup file or from another device. Strict on purpose: a hand-edited or wrong list is
 * rejected with a sentence saying which entry is wrong, never half-imported. Shape only: the rule that a start date is not
 * after today belongs to the form, so another device's clock cannot make a good list unreadable. Unknown keys are dropped,
 * and a stored `baselineStart` is ignored.
 */
export function validateEntryList(list: unknown): EntryListResult {
  if (!Array.isArray(list)) return { status: "invalid", reason: "That file doesn't contain a list of timeline entries." };
  const entries: TimelineEntry[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const e = raw as Partial<Record<keyof TimelineEntry, unknown>> | null;
    if (!e || typeof e !== "object" || Array.isArray(e)) return { status: "invalid", reason: `Entry ${n} isn't an object.` };
    if (typeof e.id !== "string" || e.id === "") return { status: "invalid", reason: `Entry ${n} has no id.` };
    if (seen.has(e.id)) return { status: "invalid", reason: `Entry ${n} repeats an id used by an earlier entry.` };
    if (!INITIATIONS.includes(e.initiation as Initiation)) return { status: "invalid", reason: `Entry ${n} has an unknown kind.` };
    if (!AREAS.includes(e.area as EntryArea)) return { status: "invalid", reason: `Entry ${n} has an unknown area.` };
    if (!isIsoDay(e.startDate)) return { status: "invalid", reason: `Entry ${n} has no valid start date (YYYY-MM-DD).` };
    if (e.endDate !== null && e.endDate !== undefined && !isIsoDay(e.endDate)) {
      return { status: "invalid", reason: `Entry ${n} has an end date that isn't YYYY-MM-DD.` };
    }
    const endDate = (e.endDate ?? null) as string | null;
    if (endDate !== null && endDate < e.startDate) return { status: "invalid", reason: `Entry ${n} ends before it starts.` };
    if (e.name !== undefined && typeof e.name !== "string") return { status: "invalid", reason: `Entry ${n} has a name that isn't text.` };
    if (e.note !== undefined && typeof e.note !== "string") return { status: "invalid", reason: `Entry ${n} has a note that isn't text.` };
    seen.add(e.id);
    entries.push({
      id: e.id,
      initiation: e.initiation as Initiation,
      area: e.area as EntryArea,
      ...(typeof e.name === "string" && e.name !== "" ? { name: e.name } : {}),
      ...(typeof e.note === "string" && e.note !== "" ? { note: e.note } : {}),
      startDate: e.startDate,
      endDate,
    });
  }
  return { status: "ok", entries };
}
