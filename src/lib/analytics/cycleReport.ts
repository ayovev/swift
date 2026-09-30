import dayjs from "dayjs";
import {
  getBodyCompNoiseBands,
  isMeaningfulChange,
  readingsForMetric,
  type BodyCompNoiseBands,
} from "./bodyCompNoise";
import { formatDay, formatPercent } from "./formatting";
import { describeTag, overlappingTags, tagLabel } from "./contextTags";
import {
  BODY_COMP_METRICS,
  CYCLE_FOCUS_MIN_SHARE,
  CYCLE_MAX_FOCUS_LIFTS,
  CYCLE_MIN_DAYS,
  CYCLE_MIN_SCANS,
  CYCLE_MIN_SESSIONS_PER_LIFT,
  RS_MAX_REPS,
  type BodyCompMetric,
} from "./insightConfig";
import { buildLiftSubjects, formatGateShortfall } from "./plateauDetector";
import { getRelativeStrength, type StrengthAttribution } from "./relativeStrength";
import { parseWorkoutDate } from "./scanParsing";
import type { Cycle, CycleBodyChange, CycleLiftChange, CycleReport } from "@/types/cycle";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag, TagType } from "@/types/tag";

/**
 * Turns history into a readable retrospective: what did each training block
 * do to performance and body composition?
 *
 * WHAT IS AND ISN'T BUILT. Cycles are user-defined: their boundaries come
 * from a tag of type bulk, cut, maintain or other (injury and travel are
 * context, not blocks) or from dates the athlete types. Automatic
 * segmentation by rolling lift-exposure share is deliberately not shipped:
 * the plan asks for it to be prototyped on a multi-year history and reviewed
 * by eye first, and there is no such history in this repo to review it on.
 * `Cycle.source` keeps "detected" as a value so adding it later changes no
 * type.
 *
 * `getCycleReport` does not recompute what earlier phases already decided:
 * lift changes and their attribution come from `getRelativeStrength`
 * (Phase 2), and whether a body-composition change is bigger than scan noise
 * comes from `getBodyCompNoiseBands` / `isMeaningfulChange` (Phase 1).
 *
 * Pure: raw rows in, a value out.
 */

const CYCLE_TAG_TYPES: readonly TagType[] = ["bulk", "cut", "maintain", "other"];

/** Tag types that add a "this block overlaps X" sentence to a report. */
const CONTEXT_TAG_TYPES: readonly TagType[] = ["injury", "travel"];

export interface GetCyclesOptions {
  /** Open-ended tags run to this date. */
  asOfDate: Date;
  tagTypes?: readonly TagType[];
}

const DATE_FMT = "YYYY-MM-DD";

function liftSessionsByName(workouts: SugarWodRow[], start: string, end: string): Map<string, Set<string>> {
  const parsed = workouts
    .map((raw) => ({ raw, date: parseWorkoutDate(raw.date) }))
    .filter((w) => w.date.isValid() && !w.date.isBefore(dayjs(start), "day") && !w.date.isAfter(dayjs(end), "day"));
  const byName = new Map<string, Set<string>>();
  for (const c of buildLiftSubjects(parsed, { maxReps: RS_MAX_REPS })) {
    const dates = byName.get(c.subject.name) ?? new Set<string>();
    for (const e of c.entries) dates.add(e.date.format(DATE_FMT));
    byName.set(c.subject.name, dates);
  }
  return byName;
}

/** The lifts with the largest shares of a range's logged lift sessions. */
export function findFocusLifts(workouts: SugarWodRow[], start: string, end: string): string[] {
  const byName = liftSessionsByName(workouts, start, end);
  const total = [...byName.values()].reduce((s, d) => s + d.size, 0);
  if (total === 0) return [];
  return [...byName.entries()]
    .map(([name, dates]) => ({ name, share: dates.size / total }))
    .filter((l) => l.share >= CYCLE_FOCUS_MIN_SHARE)
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
    .slice(0, CYCLE_MAX_FOCUS_LIFTS)
    .map((l) => l.name);
}

/** Cycles from the athlete's block tags, oldest first. */
export function getCycles(workouts: SugarWodRow[], tags: readonly ContextTag[], options: GetCyclesOptions): Cycle[] {
  const types = options.tagTypes ?? CYCLE_TAG_TYPES;
  const today = dayjs(options.asOfDate).format(DATE_FMT);
  return tags
    .filter((t) => types.includes(t.type))
    .map((t) => {
      const end = t.endDate ?? today;
      return { t, end };
    })
    .filter(({ t, end }) => end >= t.startDate)
    .map(({ t, end }): Cycle => ({
      label: tagLabel(t),
      start: t.startDate,
      end,
      focusLifts: findFocusLifts(workouts, t.startDate, end),
      source: "user",
      tagId: t.id,
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label));
}

/** A cycle for dates the athlete typed. */
export function customCycle(workouts: SugarWodRow[], start: string, end: string, label = "Custom range"): Cycle {
  return { label, start, end, focusLifts: findFocusLifts(workouts, start, end), source: "user" };
}

export interface CycleReportOptions {
  noiseBands?: BodyCompNoiseBands;
  tags?: readonly ContextTag[];
  minDays?: number;
  minSessionsPerLift?: number;
  minScans?: number;
}

const BODY_LABEL: Record<BodyCompMetric, { label: string; unit: "lb" | "%" }> = {
  weight: { label: "Weight", unit: "lb" },
  leanMass: { label: "Lean mass", unit: "lb" },
  fatMass: { label: "Fat mass", unit: "lb" },
  bodyFatPct: { label: "Body fat", unit: "%" },
};

const ATTRIBUTION_PHRASE: Record<StrengthAttribution, string> = {
  "strength-driven": "not explained by body mass",
  "mass-driven": "in line with a change in body mass",
  mixed: "partly body mass",
  flat: "",
  declined: "",
};

const oneDecimal = (x: number) => (Math.round(Math.abs(x) * 10) / 10).toFixed(1);

function bodyChanges(scans: InBodyRow[], cycle: Cycle, bands: BodyCompNoiseBands, minScans: number) {
  const inCycle = (d: dayjs.Dayjs) => !d.isBefore(dayjs(cycle.start), "day") && !d.isAfter(dayjs(cycle.end), "day");
  const scanCount = readingsForMetric(scans, "weight").filter((r) => inCycle(r.date)).length;
  const changes: CycleBodyChange[] = [];
  for (const metric of BODY_COMP_METRICS) {
    const readings = readingsForMetric(scans, metric).filter((r) => inCycle(r.date));
    if (readings.length < minScans) continue;
    const first = readings[0]!;
    const last = readings[readings.length - 1]!;
    const delta = last.value - first.value;
    changes.push({
      metric,
      ...BODY_LABEL[metric],
      start: first.value,
      end: last.value,
      delta,
      meaningful: isMeaningfulChange(delta, bands[metric].band),
    });
  }
  const reason =
    changes.length > 0
      ? undefined
      : `${formatGateShortfall(scanCount, minScans, "InBody scan inside this cycle", "InBody scans inside this cycle")}`;
  return { changes, reason };
}

export function getCycleReport(
  cycle: Cycle,
  workouts: SugarWodRow[],
  scans: InBodyRow[],
  options: CycleReportOptions = {}
): CycleReport {
  const minDays = options.minDays ?? CYCLE_MIN_DAYS;
  const minSessions = options.minSessionsPerLift ?? CYCLE_MIN_SESSIONS_PER_LIFT;
  const minScans = options.minScans ?? CYCLE_MIN_SCANS;
  const start = dayjs(cycle.start, DATE_FMT, true);
  const end = dayjs(cycle.end, DATE_FMT, true);
  const empty = (reason: string, days = 0): CycleReport => ({
    status: "insufficient",
    reason,
    cycle,
    days,
    sessionsPerWeek: null,
    e1rmChanges: [],
    bodyCompChanges: [],
    summary: "",
  });

  if (!start.isValid() || !end.isValid()) return empty("This cycle needs a start and an end date.");
  if (end.isBefore(start, "day")) return empty("This cycle ends before it starts.");
  const days = end.diff(start, "day") + 1;
  if (days < minDays) return empty(formatGateShortfall(days, minDays, "day in this cycle", "days in this cycle"), days);

  const inRange = workouts.filter((w) => {
    const d = parseWorkoutDate(w.date);
    return d.isValid() && !d.isBefore(start, "day") && !d.isAfter(end, "day");
  });
  if (inRange.length === 0) return empty("No workouts were logged in this cycle.", days);
  const sessionsPerWeek = inRange.length / (days / 7);

  // Phase 2 does the lift work: window = the cycle, as of its last day.
  const bands = options.noiseBands ?? getBodyCompNoiseBands(scans);
  const rs = getRelativeStrength(workouts, scans, {
    asOfDate: end.toDate(),
    windowDays: days - 1,
    minSessions: minSessions,
    noiseBands: bands,
  });
  const e1rmChanges: CycleLiftChange[] = [];
  for (const lift of rs.lifts) {
    const points = lift.series.filter((p) => p.date >= cycle.start && p.date <= cycle.end);
    if (points.length < minSessions) continue;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    e1rmChanges.push({
      lift: lift.lift,
      rxStatus: lift.rxStatus,
      focus: cycle.focusLifts.includes(lift.lift),
      sessions: points.length,
      startE1rm: first.e1rm,
      endE1rm: last.e1rm,
      pctChange: first.e1rm === 0 ? 0 : (last.e1rm - first.e1rm) / first.e1rm,
      ...(lift.attribution ? { attribution: lift.attribution, attributionReason: lift.reason } : {}),
    });
  }
  e1rmChanges.sort((a, b) => Number(b.focus) - Number(a.focus) || b.sessions - a.sessions || a.lift.localeCompare(b.lift));

  const { changes: bodyCompChanges, reason: bodyCompReason } = bodyChanges(scans, cycle, bands, minScans);

  const contextTags = overlappingTags(options.tags ?? [], cycle.start, cycle.end, CONTEXT_TAG_TYPES);
  const tagNotes = contextTags.map((t) => `This cycle overlaps ${describeTag(t)}.`);

  const report: CycleReport = {
    status: "ok",
    cycle,
    days,
    sessionsPerWeek,
    e1rmChanges,
    bodyCompChanges,
    ...(bodyCompReason ? { bodyCompReason } : {}),
    summary: "",
    ...(tagNotes.length > 0 ? { tagNotes } : {}),
  };
  return { ...report, summary: summarizeCycle(report) };
}

/** What happened, in order: volume, lifts, body composition. States numbers; never grades them. */
function summarizeCycle(report: CycleReport): string {
  const { cycle, days, sessionsPerWeek, e1rmChanges, bodyCompChanges, bodyCompReason } = report;
  const parts: string[] = [
    `${cycle.label}, ${formatDay(cycle.start)} to ${formatDay(cycle.end)} (${days} days): ${(sessionsPerWeek ?? 0).toFixed(1)} logged workouts a week.`,
  ];

  const liftSentences = (e1rmChanges.some((c) => c.focus) ? e1rmChanges.filter((c) => c.focus) : e1rmChanges.slice(0, CYCLE_MAX_FOCUS_LIFTS)).map((c) => {
    const name = `${c.lift}${c.rxStatus === "SCALED" ? " (Scaled)" : ""}`;
    if (c.attribution === "flat" || Math.abs(c.pctChange) < 0.005) return `${name} estimated 1RM held near ${Math.round(c.endE1rm)}`;
    const dir = c.pctChange > 0 ? "rose" : "fell";
    const why = c.attribution ? ATTRIBUTION_PHRASE[c.attribution] : "";
    return `${name} estimated 1RM ${dir} ${formatPercent(c.pctChange)} (${Math.round(c.startE1rm)} to ${Math.round(c.endE1rm)})${why ? `, ${why}` : ""}`;
  });
  parts.push(liftSentences.length > 0 ? `${liftSentences.join("; ")}.` : "No lift has enough logged sessions in this cycle for an estimated 1RM change.");

  const moved = bodyCompChanges.filter((c) => c.meaningful);
  const still = bodyCompChanges.filter((c) => !c.meaningful);
  if (bodyCompChanges.length === 0) {
    parts.push(`No body composition change to report: ${bodyCompReason}.`);
  } else {
    if (moved.length > 0) {
      parts.push(
        moved
          .map((c) => `${c.label} ${c.delta > 0 ? "up" : "down"} ${oneDecimal(c.delta)}${c.unit === "%" ? " points" : " lb"}`)
          .join(", ") + "."
      );
    }
    if (still.length > 0) {
      const names = still.map((c) => c.label.toLowerCase());
      const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      parts.push(`${list.charAt(0).toUpperCase()}${list.slice(1)} ${names.length === 1 ? "change is" : "changes are"} within normal scan variation.`);
    }
  }
  return parts.join(" ");
}
