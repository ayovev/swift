import dayjs, { type Dayjs } from "dayjs";
import { getBodyCompNoiseBands, isMeaningfulChange, readingsForMetric, type BodyCompNoiseBands } from "./bodyCompNoise";
import { describeTag, overlappingTags } from "./contextTags";
import {
  BODY_COMP_METRICS,
  CMP_LENGTH_MISMATCH_RATIO,
  CMP_MIN_OBSERVATIONS_PER_WINDOW,
  CMP_MIN_SCANS_PER_WINDOW,
  type BodyCompMetric,
} from "./insightConfig";
import {
  buildBenchmarkSubjects,
  buildLiftSubjects,
  formatGateShortfall,
  mean,
  TREND_THRESHOLD,
  type SubjectCandidate,
} from "./plateauDetector";
import { parseWorkoutDate } from "./scanParsing";
import type { BodyCompComparison, DateWindow, PerformanceComparison, WindowComparison } from "@/types/compare";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";

/**
 * "Select a range, see what changed": performance and body composition in
 * window B against window A. Generalises Experiments — a saved comparison
 * becomes an `Experiment` (window B → `date`/`endDate`), so there is one
 * data model, not two.
 *
 * Reuses the Plateau Detector's subject building unchanged (same lift-name
 * normalisation, same 1RM estimate, RX and Scaled never merged), so a lift
 * means the same thing here as everywhere else. Each side of a subject is
 * the mean of its entries inside the window and needs at least
 * `CMP_MIN_OBSERVATIONS_PER_WINDOW` of them; a subject that doesn't gets a
 * row with `comparable: false`, a reason and NO numbers — never a partial
 * comparison. Body-comp deltas go through `isMeaningfulChange` with the
 * athlete's own noise band (Phase 1), estimated from ALL their scans, not
 * just the two windows'.
 *
 * `windowA` is normally `defaultWindowA(windowB)`, the equal-length window
 * immediately before B, but any non-overlapping window works. Tags never
 * change a number: overlapping ones are named in `caveats`.
 *
 * Pure: raw rows in, a value out.
 */

export interface CompareWindowsOptions {
  noiseBands?: BodyCompNoiseBands;
  tags?: readonly ContextTag[];
  minObservationsPerWindow?: number;
  minScansPerWindow?: number;
}

const DATE_FMT = "YYYY-MM-DD";

/** The window of the same length ending the day before `windowB` starts. */
export function defaultWindowA(windowB: DateWindow): DateWindow {
  const start = dayjs(windowB.start);
  const end = dayjs(windowB.end);
  const days = end.diff(start, "day") + 1;
  return {
    start: start.subtract(days, "day").format(DATE_FMT),
    end: start.subtract(1, "day").format(DATE_FMT),
  };
}

export function windowLengthDays(w: DateWindow): number {
  return dayjs(w.end).diff(dayjs(w.start), "day") + 1;
}

const inWindow = (d: Dayjs, w: DateWindow) => !d.isBefore(dayjs(w.start), "day") && !d.isAfter(dayjs(w.end), "day");

const BODY_LABEL: Record<BodyCompMetric, { label: string; unit: "lb" | "%" }> = {
  weight: { label: "Weight", unit: "lb" },
  leanMass: { label: "Lean mass", unit: "lb" },
  fatMass: { label: "Fat mass", unit: "lb" },
  bodyFatPct: { label: "Body fat", unit: "%" },
};

function emptyResult(a: DateWindow, b: DateWindow, reason: string): WindowComparison {
  return { status: "insufficient", reason, windowA: a, windowB: b, performance: [], bodyComp: [], caveats: [] };
}

function comparePerformance(
  candidate: SubjectCandidate,
  a: DateWindow,
  b: DateWindow,
  minObs: number
): PerformanceComparison {
  const before = candidate.entries.filter((e) => inWindow(e.date, a));
  const after = candidate.entries.filter((e) => inWindow(e.date, b));
  const { subject, valueKind, scoreDirection } = candidate;
  const base = {
    metric: `${subject.name} (${subject.status})`,
    subject,
    valueKind,
    observations: { before: before.length, after: after.length },
  };
  if (before.length < minObs || after.length < minObs) {
    const thin = before.length < minObs ? "window A" : "window B";
    const has = before.length < minObs ? before.length : after.length;
    return {
      ...base,
      before: null,
      after: null,
      delta: null,
      pctChange: null,
      direction: null,
      comparable: false,
      reason: `${thin} ${formatGateShortfall(has, minObs, "logged entry", "logged entries")}`,
    };
  }
  const beforeMean = mean(before.map((e) => e.value));
  const afterMean = mean(after.map((e) => e.value));
  const rawPct = beforeMean === 0 ? 0 : (afterMean - beforeMean) / beforeMean;
  const pctChange = scoreDirection === "lower_better" ? -rawPct : rawPct;
  const direction = pctChange >= TREND_THRESHOLD ? "up" : pctChange <= -TREND_THRESHOLD ? "down" : "flat";
  return {
    ...base,
    before: beforeMean,
    after: afterMean,
    delta: afterMean - beforeMean,
    pctChange,
    direction,
    comparable: true,
  };
}

function compareBodyComp(
  scans: InBodyRow[],
  a: DateWindow,
  b: DateWindow,
  bands: BodyCompNoiseBands,
  minScans: number
): BodyCompComparison[] {
  return BODY_COMP_METRICS.map((metric) => {
    const readings = readingsForMetric(scans, metric);
    const before = readings.filter((r) => inWindow(r.date, a)).map((r) => r.value);
    const after = readings.filter((r) => inWindow(r.date, b)).map((r) => r.value);
    const band = bands[metric].band;
    const base = { metric, ...BODY_LABEL[metric], band, scans: { before: before.length, after: after.length } };
    if (before.length < minScans || after.length < minScans) {
      const thin = before.length < minScans ? "window A" : "window B";
      const has = before.length < minScans ? before.length : after.length;
      return {
        ...base,
        before: null,
        after: null,
        delta: null,
        meaningful: false,
        reason: `${thin} ${formatGateShortfall(has, minScans, "InBody scan with this measurement", "InBody scans with this measurement")}`,
      };
    }
    const beforeMean = mean(before);
    const afterMean = mean(after);
    const delta = afterMean - beforeMean;
    return { ...base, before: beforeMean, after: afterMean, delta, meaningful: isMeaningfulChange(delta, band) };
  });
}

export function compareWindows(
  workouts: SugarWodRow[],
  scans: InBodyRow[],
  windowA: DateWindow,
  windowB: DateWindow,
  options: CompareWindowsOptions = {}
): WindowComparison {
  const minObs = options.minObservationsPerWindow ?? CMP_MIN_OBSERVATIONS_PER_WINDOW;
  const minScans = options.minScansPerWindow ?? CMP_MIN_SCANS_PER_WINDOW;

  for (const [name, w] of [["A", windowA], ["B", windowB]] as const) {
    if (!dayjs(w.start, DATE_FMT, true).isValid() || !dayjs(w.end, DATE_FMT, true).isValid()) {
      return emptyResult(windowA, windowB, `Window ${name} needs a start and an end date.`);
    }
    if (dayjs(w.end).isBefore(dayjs(w.start), "day")) {
      return emptyResult(windowA, windowB, `Window ${name} ends before it starts.`);
    }
  }
  if (!dayjs(windowA.start).isAfter(dayjs(windowB.end), "day") && !dayjs(windowB.start).isAfter(dayjs(windowA.end), "day")) {
    return emptyResult(windowA, windowB, "The two windows overlap, so there is no before and after to compare.");
  }

  const parsedWorkouts = workouts
    .map((raw) => ({ raw, date: parseWorkoutDate(raw.date) }))
    .filter((w) => w.date.isValid());
  const candidates = [...buildLiftSubjects(parsedWorkouts), ...buildBenchmarkSubjects(parsedWorkouts)];

  const performance = candidates
    .filter((c) => c.entries.some((e) => inWindow(e.date, windowA) || inWindow(e.date, windowB)))
    .map((c) => comparePerformance(c, windowA, windowB, minObs))
    .sort((x, y) => Number(y.comparable) - Number(x.comparable) || x.metric.localeCompare(y.metric));

  const bands = options.noiseBands ?? getBodyCompNoiseBands(scans);
  const bodyComp = compareBodyComp(scans, windowA, windowB, bands, minScans);

  const comparablePerformance = performance.filter((p) => p.comparable).length;
  const comparableBody = bodyComp.filter((m) => m.delta !== null).length;
  if (comparablePerformance === 0 && comparableBody === 0) {
    const perfReason =
      performance.length === 0
        ? "no lift or benchmark was logged in either window"
        : `no lift or benchmark has ${minObs} logged entries in both windows`;
    const bodyReason = bodyComp.find((m) => m.reason)?.reason ?? "no body-composition measurement in both windows";
    return {
      ...emptyResult(windowA, windowB, `Nothing to compare: ${perfReason}, and ${bodyReason}.`),
      performance,
      bodyComp,
    };
  }

  const caveats: string[] = [];
  const lenA = windowLengthDays(windowA);
  const lenB = windowLengthDays(windowB);
  if (Math.abs(lenA - lenB) > CMP_LENGTH_MISMATCH_RATIO * Math.max(lenA, lenB)) {
    caveats.push(`The windows are different lengths (${lenA} and ${lenB} days), so a session count in one is not directly comparable to the other.`);
  }
  if (comparablePerformance === 0) caveats.push("No lift or benchmark has enough entries in both windows to compare performance.");
  if (comparableBody === 0) caveats.push("No body-composition measurement is available in both windows.");
  const thinnest = Math.min(...bodyComp.map((m) => Math.min(m.scans.before, m.scans.after)));
  if (comparableBody > 0 && thinnest === 1) {
    caveats.push("At least one window has a single InBody scan, which carries the full scan-to-scan variation.");
  }
  for (const [name, w] of [["A", windowA], ["B", windowB]] as const) {
    for (const t of overlappingTags(options.tags ?? [], w.start, w.end)) {
      caveats.push(`Window ${name} overlaps ${describeTag(t)}.`);
    }
  }

  return { status: "ok", windowA, windowB, performance, bodyComp, caveats };
}

/**
 * The Experiment fields a comparison maps onto: window B's span, and window
 * A's start as the experiment's `baselineStart`. Exact when A ends the day
 * before B starts (the default); an experiment's "before" side always runs
 * up to its start date, so a custom A that ends earlier gains the gap.
 */
export function windowsToExperimentFields(
  windowA: DateWindow,
  windowB: DateWindow
): { date: string; endDate: string; baselineStart: string } {
  return { date: windowB.start, endDate: windowB.end, baselineStart: windowA.start };
}

/** Whether saving as an experiment reproduces window A exactly: A ends the day before B starts. */
export function windowAIsContiguous(windowA: DateWindow, windowB: DateWindow): boolean {
  return dayjs(windowA.end).add(1, "day").isSame(dayjs(windowB.start), "day");
}
