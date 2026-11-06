import dayjs, { type Dayjs } from "dayjs";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";
import type { EntryArea, Initiation, TimelineEntry } from "@/types/timeline";

/**
 * Generates a handful of plausible timeline entries to go with the SugarWOD +
 * InBody demo data (`extendSample.ts`, `generateSampleBodyComp.ts`), so a
 * first-time visitor sees the Timeline view, with entries stacked and a before
 * and after beside them, instead of an empty state. See
 * `App.tsx`'s `finishSuccessfulLoad`, the only caller. Never persisted, never
 * synced: sample mode leaves nothing behind (CLAUDE.md, hard constraint 1).
 *
 * Every entry sits at a fixed
 * offset from the athlete's own first logged workout, never a hardcoded
 * calendar date, so this keeps working if the bundled export is swapped. A
 * entry is only used if it fits inside the logged span with a margin before
 * today; nothing is randomised, so reloading demo mode never reshuffles it.
 *
 * An entry says only what the athlete would say — "First cut", "Shoulder tweak" —
 * and never touches a number (see `timeline.ts`), so what the demo's
 * insights show still falls out of the data rather than the entries.
 */

/** Listed in date order; each entry the athlete changed gets a before and after, so each sits with months of history either side. */
interface Slot {
  initiation: Initiation;
  area: EntryArea;
  label: string;
  /** Months after the first logged workout the entry starts. */
  startMonth: number;
  /** Length in days. */
  days: number;
  note?: string;
}

const SLOTS: readonly Slot[] = [
  { initiation: "changed", area: "nutrition", label: "First bulk", startMonth: 5, days: 120 },
  { initiation: "changed", area: "nutrition", label: "First cut", startMonth: 11, days: 84 },
  { initiation: "changed", area: "training", label: "Started 5/3/1", startMonth: 15, days: 84 },
  { initiation: "happened", area: "health", label: "Shoulder tweak", startMonth: 19, days: 18, note: "No overhead work for a couple of weeks." },
  { initiation: "changed", area: "training", label: "5/3/1, cycle 2", startMonth: 20, days: 84 },
  { initiation: "changed", area: "nutrition", label: "Maintenance block", startMonth: 24, days: 112 },
  { initiation: "changed", area: "nutrition", label: "Switched to a protein-forward diet", startMonth: 28, days: 98 },
  { initiation: "happened", area: "travel", label: "Two weeks abroad", startMonth: 31, days: 14 },
  { initiation: "changed", area: "health", label: "Started tracking sleep", startMonth: 33, days: 56 },
];

/** An entry must end at least this many days before today to be used. */
const MARGIN_DAYS = 28;

/** The still-running block that closes the list: it starts this many days before today. */
const CURRENT_BLOCK_DAYS = 70;

const iso = (d: Dayjs) => d.format("YYYY-MM-DD");

/**
 * Returns [] when `workoutRows` has no valid date. Slots that don't fit the
 * span are skipped, so a short history gets fewer entries rather than a broken
 * one.
 */
export function generateSampleTimeline(workoutRows: readonly SugarWodRow[], today: Dayjs = dayjs()): TimelineEntry[] {
  const dates = workoutRows.map((row) => parseWorkoutDate(row.date)).filter((d) => d.isValid());
  if (dates.length === 0) return [];

  const firstDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b)).startOf("day");
  const todayStart = today.startOf("day");
  const latestAllowedEnd = todayStart.subtract(MARGIN_DAYS, "day");

  const entries: TimelineEntry[] = [];
  let lastEnd = firstDate;

  for (const slot of SLOTS) {
    const start = firstDate.add(slot.startMonth, "month");
    const end = start.add(slot.days - 1, "day");
    if (end.isAfter(latestAllowedEnd, "day")) continue;
    entries.push({
      id: `sample-entry-${iso(start)}`,
      initiation: slot.initiation,
      area: slot.area,
      name: slot.label,
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
    entries.push({
      id: `sample-entry-${iso(currentStart)}`,
      initiation: "changed",
      area: "training",
      name: "Current block",
      startDate: iso(currentStart),
      endDate: null,
    });
  }

  return entries;
}
