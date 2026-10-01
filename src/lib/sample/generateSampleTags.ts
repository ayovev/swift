import dayjs, { type Dayjs } from "dayjs";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag, TagType } from "@/types/tag";

/**
 * Generates a handful of plausible context tags to go with the SugarWOD +
 * InBody demo data (`extendSample.ts`, `generateSampleBodyComp.ts`), so a
 * first-time visitor sees the Periods view, the shaded chart bands, Compare
 * and its verdicts and a tag note or two on Plateaus instead of empty states. See
 * `App.tsx`'s `finishSuccessfulLoad`, the only caller. Never persisted, never
 * synced: sample mode leaves nothing behind (CLAUDE.md, hard constraint 1).
 *
 * Every tag sits at a fixed
 * offset from the athlete's own first logged workout, never a hardcoded
 * calendar date, so this keeps working if the bundled export is swapped. A
 * tag is only used if it fits inside the logged span with a margin before
 * today; nothing is randomised, so reloading demo mode never reshuffles it.
 *
 * A tag says only what the athlete would say — "cut", "injury", "travel" —
 * and never touches a number (see `contextTags.ts`), so what the demo's
 * insights show still falls out of the data rather than the tags.
 */

/** Listed in date order; the types in "Something you changed" each get a before/after verdict, so each sits with months of history either side. */
interface Slot {
  type: TagType;
  label: string;
  /** Months after the first logged workout the tag starts. */
  startMonth: number;
  /** Length in days. */
  days: number;
  note?: string;
}

const SLOTS: readonly Slot[] = [
  { type: "bulk", label: "First bulk", startMonth: 5, days: 120 },
  { type: "cut", label: "First cut", startMonth: 11, days: 84 },
  { type: "programming", label: "Started 5/3/1", startMonth: 15, days: 84 },
  { type: "injury", label: "Shoulder tweak", startMonth: 19, days: 18, note: "No overhead work for a couple of weeks." },
  { type: "cycle", label: "5/3/1, cycle 2", startMonth: 20, days: 84 },
  { type: "maintain", label: "Maintenance block", startMonth: 24, days: 112 },
  { type: "nutrition", label: "Switched to a protein-forward diet", startMonth: 28, days: 98 },
  { type: "travel", label: "Two weeks abroad", startMonth: 31, days: 14 },
  { type: "recovery", label: "Started tracking sleep", startMonth: 33, days: 56 },
];

/** A tag must end at least this many days before today to be used. */
const MARGIN_DAYS = 28;

/** The still-running block that closes the list: it starts this many days before today. */
const CURRENT_BLOCK_DAYS = 70;

const iso = (d: Dayjs) => d.format("YYYY-MM-DD");

/**
 * Returns [] when `workoutRows` has no valid date. Slots that don't fit the
 * span are skipped, so a short history gets fewer tags rather than a broken
 * one.
 */
export function generateSampleTags(workoutRows: readonly SugarWodRow[], today: Dayjs = dayjs()): ContextTag[] {
  const dates = workoutRows.map((row) => parseWorkoutDate(row.date)).filter((d) => d.isValid());
  if (dates.length === 0) return [];

  const firstDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b)).startOf("day");
  const todayStart = today.startOf("day");
  const latestAllowedEnd = todayStart.subtract(MARGIN_DAYS, "day");

  const tags: ContextTag[] = [];
  let lastEnd = firstDate;

  for (const slot of SLOTS) {
    const start = firstDate.add(slot.startMonth, "month");
    const end = start.add(slot.days - 1, "day");
    if (end.isAfter(latestAllowedEnd, "day")) continue;
    tags.push({
      id: `sample-tag-${slot.type}-${iso(start)}`,
      type: slot.type,
      label: slot.label,
      startDate: iso(start),
      endDate: iso(end),
      ...(slot.note ? { note: slot.note } : {}),
    });
    if (end.isAfter(lastEnd)) lastEnd = end;
  }

  // The block the athlete is in now, open-ended. Only when it starts after
  // everything above and the history is long enough to have one.
  const currentStart = todayStart.subtract(CURRENT_BLOCK_DAYS, "day");
  if (currentStart.isAfter(lastEnd, "day") && currentStart.isAfter(firstDate, "day")) {
    tags.push({
      id: `sample-tag-maintain-${iso(currentStart)}`,
      type: "maintain",
      label: "Current block",
      startDate: iso(currentStart),
      endDate: null,
    });
  }

  return tags;
}
