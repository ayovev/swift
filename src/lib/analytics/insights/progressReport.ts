import dayjs from "dayjs";
import { classifySubjects, type ProgressHeadline, type ProgressRow } from "./headline";
import { compareProgress, type SinceComparison } from "./sinceDate";
import { buildProgressSubjects } from "./sessions";
import { parseWorkoutDate } from "@/lib/analytics/scanParsing";
import type { SugarWodRow } from "@/types/sugarwod";

/**
 * Everything the Progress report prints, from the SugarWOD log alone (docs/reports.md). The same functions Progress uses
 * (`buildProgressSubjects`, `classifySubjects`) plus the comparison in `sinceDate.ts`; nothing here classifies or counts anything new.
 * Dates are passed in, never read from the clock.
 */
export interface ProgressReportData {
  today: string;
  rows: ProgressRow[];
  headline: ProgressHeadline;
  /** Present when a comparison date was chosen. */
  comparison: SinceComparison | null;
  /** The newest workout in the log, YYYY-MM-DD, for the footer's basis; null for an empty log. */
  lastLogged: string | null;
}

export function buildProgressReportData(workouts: readonly SugarWodRow[], today: string, since: string | null): ProgressReportData {
  const { subjects } = buildProgressSubjects(workouts);
  const { rows, headline } = classifySubjects(subjects, today);
  let lastLogged: string | null = null;
  for (const w of workouts) {
    const d = parseWorkoutDate(w.date);
    if (!d.isValid()) continue;
    const iso = d.format("YYYY-MM-DD");
    if (iso <= today && (lastLogged === null || iso > lastLogged)) lastLogged = iso;
  }
  return { today, rows, headline, comparison: since ? compareProgress(subjects, since, today) : null, lastLogged };
}

/** A comparison date from a preset: weeks or months before today. */
export type SincePreset = "4w" | "8w" | "6m";
export function sinceFromPreset(preset: SincePreset, today: string): string {
  const d = dayjs(today);
  return (preset === "6m" ? d.subtract(6, "month") : d.subtract(preset === "4w" ? 4 : 8, "week")).format("YYYY-MM-DD");
}
