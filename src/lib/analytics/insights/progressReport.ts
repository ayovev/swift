import dayjs from "dayjs";
import { entryEnd } from "../timeline";
import { pooledReadings, pooledScanRows } from "../weighIns";
import { classifySubjects, type ProgressHeadline, type ProgressRow } from "./headline";
import { readingsFromInBody, weightBandLb } from "./bodyReadings";
import { entryBodyWeightLine } from "./entryDisplay";
import { entryVerdict, type EntryVerdict } from "./entryVerdict";
import { compareProgress, type SinceComparison } from "./sinceDate";
import { buildProgressSubjects, type ProgressSubject } from "./sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import { withScoreUnit } from "@/lib/format/scoreUnit";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";

/**
 * Everything the Progress report prints (docs/reports.md). The same functions Progress and the Timeline use (`buildProgressSubjects`,
 * `classifySubjects`, `entryVerdict`, `entryBodyWeightLine`) plus the comparison in `sinceDate.ts`; nothing here classifies or counts
 * anything new. Dates are passed in, never read from the clock.
 */
export interface PrItem {
  /** YYYY-MM-DD. */
  date: string;
  /** The workout title as logged. */
  title: string;
  /** The score as SugarWOD displays it, with its unit; may be "". */
  display: string;
}

export interface ChangeItem {
  entry: TimelineEntry;
  /** The before and after for an entry the athlete changed; null for something that happened, which gets no comparison. */
  verdict: EntryVerdict | null;
  /** Body weight over the entry's span, or null when either end has no reading. Printed only when the report's body section is on. */
  bodyLine: string | null;
}

export interface ProgressReportData {
  today: string;
  subjects: ProgressSubject[];
  rows: ProgressRow[];
  headline: ProgressHeadline;
  /** Present when a comparison date was chosen. */
  comparison: SinceComparison | null;
  /** PRs by SugarWOD's own flag, newest first, after the comparison date. Empty without one: a report states no recent window of its own. */
  prs: PrItem[];
  /** Timeline entries that touch the report's period, in start order. */
  changes: ChangeItem[];
  /** Whether any body reading exists, so the report can say the body section has nothing to print. */
  hasBodyReadings: boolean;
  /** The newest workout in the log, YYYY-MM-DD, for the footer's basis; null for an empty log. */
  lastLogged: string | null;
}

export interface ProgressReportInputs {
  timeline?: readonly TimelineEntry[];
  scans?: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
}

/**
 * PRs after `since` and up to `today`, by SugarWOD's PR flag as logged. The flag is a logged fact in the sport's own words and feeds no
 * verdict (Overview's "most recent PR" is the other reader); here it is listed, never counted into anything.
 */
export function prsSince(workouts: readonly SugarWodRow[], since: string, today: string): PrItem[] {
  const items: (PrItem & { order: number })[] = [];
  workouts.forEach((w, order) => {
    if (w.pr !== "PR") return;
    const d = parseWorkoutDate(w.date);
    if (!d.isValid()) return;
    const date = d.format("YYYY-MM-DD");
    if (date <= since || date > today) return;
    items.push({ date, title: w.title, display: withScoreUnit(w.best_result_display ?? "", w.score_type ?? ""), order });
  });
  // Newest first; within a day, the log's own order.
  items.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1));
  return items.map(({ date, title, display }) => ({ date, title, display }));
}

/** Entries that share at least one day with the period: from `since` (or the beginning) to `today`. An ongoing entry runs to `today`. */
export function entriesInPeriod(entries: readonly TimelineEntry[], since: string | null, today: string): TimelineEntry[] {
  return entries
    .filter((e) => e.startDate <= today && entryEnd(e, today) >= (since ?? ""))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1));
}

export function buildProgressReportData(
  workouts: readonly SugarWodRow[],
  today: string,
  since: string | null,
  { timeline = [], scans = [], weighIns = [] }: ProgressReportInputs = {}
): ProgressReportData {
  const { subjects } = buildProgressSubjects(workouts);
  const { rows, headline } = classifySubjects(subjects, today);
  let lastLogged: string | null = null;
  for (const w of workouts) {
    const d = parseWorkoutDate(w.date);
    if (!d.isValid()) continue;
    const iso = d.format("YYYY-MM-DD");
    if (iso <= today && (lastLogged === null || iso > lastLogged)) lastLogged = iso;
  }

  const readings = pooledReadings(readingsFromInBody(scans), weighIns);
  const band = weightBandLb(pooledScanRows(scans, weighIns));
  const changes: ChangeItem[] = entriesInPeriod(timeline, since, today).map((entry) => ({
    entry,
    verdict: entry.initiation === "changed" ? entryVerdict(entry, subjects, today) : null,
    bodyLine: entryBodyWeightLine(entry, readings, band, today),
  }));

  return {
    today,
    subjects,
    rows,
    headline,
    comparison: since ? compareProgress(subjects, since, today) : null,
    prs: since ? prsSince(workouts, since, today) : [],
    changes,
    hasBodyReadings: readings.length > 0,
    lastLogged,
  };
}

/** A comparison date from a preset: weeks or months before today. */
export type SincePreset = "4w" | "8w" | "6m";
export function sinceFromPreset(preset: SincePreset, today: string): string {
  const d = dayjs(today);
  return (preset === "6m" ? d.subtract(6, "month") : d.subtract(preset === "4w" ? 4 : 8, "week")).format("YYYY-MM-DD");
}
