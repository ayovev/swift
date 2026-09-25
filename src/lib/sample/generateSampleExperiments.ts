import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { pick, rngFor } from "./rng";
import type { Experiment } from "@/types/experiment";
import type { SugarWodRow } from "@/types/sugarwod";

dayjs.extend(customParseFormat);

/**
 * Generates a couple of plausible logged Experiments to pair with the
 * SugarWOD + InBody demo data (`extendSample.ts`, `generateSampleBodyComp.ts`),
 * so a first-time visitor sees the Experiments tab actually populated instead
 * of its empty "no experiments logged yet" state. See `App.tsx`'s `run()`,
 * the only caller.
 *
 * Dates are placed at fixed offsets from the athlete's own first logged
 * workout — not hardcoded calendar dates — so this keeps working if the
 * bundled sample export is ever swapped for a different one, same principle
 * `extendSample.ts`'s header comment states for its own generation. An
 * offset is only used if it leaves at least `MARGIN_MONTHS` of history on
 * both sides of it: `getExperimentInsight` (`experimentInsight.ts`) needs
 * >=3 classified subjects and >=2 InBody scans strictly before *and* after
 * the experiment date, and placing the date well inside the span — rather
 * than near either edge — is what makes that gate pass reliably without
 * hand-tuning the result.
 *
 * The classification itself (improved/declined/no_change/mixed) is never
 * biased toward a particular outcome here — it falls out of whatever the
 * real historical data actually shows before/after that date. Forcing a
 * rosy result would make the demo read as staged rather than as a real
 * athlete's log.
 */

const OFFSET_MONTHS = [18, 32] as const;
const MARGIN_MONTHS = 4;

const LABELS = [
  "Started 5/3/1 cycle",
  "Added a second rest day",
  "Switched to a protein-forward diet",
  "Started tracking sleep",
  "Began a dedicated mobility routine",
  "Cut back on late workouts",
] as const;

function parseWorkoutDate(row: SugarWodRow): Dayjs {
  return dayjs((row.date ?? "").trim(), "MM/DD/YYYY", true);
}

function buildExperiment(date: Dayjs): Experiment {
  const dateKey = date.format("YYYY-MM-DD");
  return {
    id: `sample-experiment-${dateKey}`,
    date: dateKey,
    label: pick(rngFor(dateKey, "experiment-label"), LABELS),
  };
}

/**
 * Returns [] when `workoutRows` has no valid date, or when the span is too
 * short for any offset to land with enough margin on both sides —
 * defensive, mirroring `extendSampleRows`'s own empty-input guard.
 */
export function generateSampleExperiments(
  workoutRows: readonly SugarWodRow[],
  today: Dayjs = dayjs()
): Experiment[] {
  const dates = workoutRows.map(parseWorkoutDate).filter((d) => d.isValid());
  if (dates.length === 0) return [];

  const firstDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b)).startOf("day");
  const todayStart = today.startOf("day");

  const experiments: Experiment[] = [];
  for (const offset of OFFSET_MONTHS) {
    const date = firstDate.add(offset, "month");
    const monthsBefore = date.diff(firstDate, "month", true);
    const monthsAfter = todayStart.diff(date, "month", true);
    if (monthsBefore < MARGIN_MONTHS || monthsAfter < MARGIN_MONTHS) continue;
    experiments.push(buildExperiment(date));
  }

  return experiments;
}
