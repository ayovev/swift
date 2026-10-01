import dayjs from "dayjs";
import { getBodyCompNoiseBands } from "./bodyCompNoise";
import {
  type InsightOptions,
  buildBenchmarkSubjects,
  buildLiftSubjects,
  computeBodyCompTrend,
  formatGateShortfall,
  isBodyCompDeclining,
  isBodyCompImproving,
  mean,
  parseInBodyDate,
  parseWorkoutDate,
  TREND_THRESHOLD,
  type SubjectCandidate,
} from "./plateauDetector";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/dashboard";
import type { ContextTag } from "@/types/tag";
import type {
  PeriodVerdict,
  VerdictBodyCompSummary,
  VerdictClassification,
  VerdictPerformanceSummary,
} from "@/types/verdict";

/** Eligibility gate minimums (spec Step 1), applied independently to the before and after sides. */
const MIN_CLASSIFIED_SUBJECTS = 3;
const MIN_SCANS_PER_SIDE = 2;

const NULL_BODY_COMP_SUMMARY: VerdictBodyCompSummary = {
  leanMassDelta: null,
  fatMassDelta: null,
  bodyFatPctDelta: null,
};

const ZERO_PERFORMANCE_SUMMARY: VerdictPerformanceSummary = {
  improvingCount: 0,
  decliningCount: 0,
  flatCount: 0,
  classifiedCount: 0,
};

interface SplitCandidate {
  candidate: SubjectCandidate;
  before: SubjectCandidate["entries"];
  after: SubjectCandidate["entries"];
}

function insufficient(period: ContextTag, reason: string): PeriodVerdict {
  return {
    period,
    classification: "insufficient_data",
    reason,
    performanceSummary: ZERO_PERFORMANCE_SUMMARY,
    bodyCompSummary: NULL_BODY_COMP_SUMMARY,
  };
}

/**
 * Pure function: re-anchors the same before/after performance-vs-body-comp
 * comparison the Plateau Detector (#1) and Alignment (#2) use around an
 * arbitrary period start date, instead of a recent/prior rolling window.
 * Takes the period itself (any type that `hasVerdict` accepts); only its dates are read.
 * Reuses #1's subject identification (`buildLiftSubjects`/
 * `buildBenchmarkSubjects`, `parseWorkoutDate`/`parseInBodyDate`,
 * `computeBodyCompTrend`, `isBodyCompDeclining`/`isBodyCompImproving`)
 * unchanged — the normalization/grouping rules must not drift between the
 * three pipelines — but computes its own before/after windowing and
 * classification, since #1's session-count recent/prior windowing has no
 * reason to land on either side of an arbitrary date.
 *
 * When `period.endDate` is set, the "after" side is bounded to
 * [start, end] instead of running open-ended to `asOfDate` — a finished
 * period is compared against the period it actually ran, not against
 * whatever the athlete did afterward. An unset `endDate`, or one that's
 * before the start date (which the UI shouldn't produce, but this stays
 * defensive about it rather than throwing), falls back to the open-ended
 * behavior unchanged.
 *
 * When `period.baselineStart` is set (before `startDate`), the "before" side is
 * [baselineStart, startDate) instead of all history before `startDate` — the earlier
 * range a Compare was saved from — for both the lift/WOD entries and the
 * InBody scans. Unset, nothing changes.
 */
export function getPeriodVerdict(
  period: ContextTag,
  workouts: SugarWodRow[],
  inbodyScans: InBodyRow[],
  asOfDate: Date,
  options: InsightOptions = {}
): PeriodVerdict {
  const asOf = dayjs(asOfDate);
  const start = dayjs(period.startDate);
  const rawEnd = period.endDate ? dayjs(period.endDate) : null;
  const end = rawEnd && rawEnd.isValid() && !rawEnd.isBefore(start, "day") ? rawEnd : null;
  // Same defensiveness as `end`: a baselineStart that isn't strictly before the
  // start date can't describe an earlier range, so it falls back to all history.
  const rawBaseline = period.baselineStart ? dayjs(period.baselineStart) : null;
  const baseline = rawBaseline && rawBaseline.isValid() && rawBaseline.isBefore(start, "day") ? rawBaseline : null;
  const isBefore = (d: dayjs.Dayjs) => d.isBefore(start, "day") && (!baseline || !d.isBefore(baseline, "day"));
  const beforeWhere = baseline ? "in the earlier range" : "before this date";

  const parsedWorkouts = workouts
    .map((raw) => ({ raw, date: parseWorkoutDate(raw.date) }))
    .filter((w) => w.date.isValid() && !w.date.isAfter(asOf, "day"));

  const parsedScans = inbodyScans
    .map((raw) => ({ raw, date: parseInBodyDate(raw.date) }))
    .filter((s) => s.date.isValid() && !s.date.isAfter(asOf, "day"));

  const candidates = [...buildLiftSubjects(parsedWorkouts), ...buildBenchmarkSubjects(parsedWorkouts)];

  // A subject only logged before, or only after, the start date can't show a
  // before/after change — split first, then only "classified" subjects (data
  // on both sides) enter the per-subject comparison below. "After" is also
  // capped at `end` when the period has one.
  const splits: SplitCandidate[] = candidates.map((candidate) => ({
    candidate,
    before: candidate.entries.filter((e) => isBefore(e.date)),
    after: candidate.entries.filter((e) => !e.date.isBefore(start, "day") && (!end || !e.date.isAfter(end, "day"))),
  }));

  const subjectsWithBefore = splits.filter((s) => s.before.length > 0).length;
  const subjectsWithAfter = splits.filter((s) => s.after.length > 0).length;
  const classified = splits.filter((s) => s.before.length > 0 && s.after.length > 0);

  // Gate 1: enough subjects with data on both sides. When it fails, name the
  // thinner raw side (before-data count vs. after-data count) rather than a
  // generic "not enough data" — a period started last week will almost
  // always be thin on the "after" side, and that's worth saying explicitly.
  // A tie defaults to "after", the spec's own called-out common case.
  if (classified.length < MIN_CLASSIFIED_SUBJECTS) {
    const thinSide = subjectsWithBefore < subjectsWithAfter ? "before" : "after";
    const reason =
      thinSide === "before"
        ? formatGateShortfall(
            subjectsWithBefore,
            MIN_CLASSIFIED_SUBJECTS,
            `lift/WOD with logged data ${beforeWhere}`,
            `lifts/WODs with logged data ${beforeWhere}`
          )
        : formatGateShortfall(
            subjectsWithAfter,
            MIN_CLASSIFIED_SUBJECTS,
            "lift/WOD with logged data after this date",
            "lifts/WODs with logged data after this date"
          );
    return insufficient(period, reason);
  }

  const scansBefore = parsedScans.filter((s) => isBefore(s.date));
  const scansAfter = parsedScans.filter((s) => !s.date.isBefore(start, "day") && (!end || !s.date.isAfter(end, "day")));

  // Gate 2: enough InBody scans on each side, checked independently so the
  // reason names exactly which side is short.
  if (scansBefore.length < MIN_SCANS_PER_SIDE) {
    return insufficient(
      period,
      formatGateShortfall(
        scansBefore.length,
        MIN_SCANS_PER_SIDE,
        `InBody scan ${beforeWhere}`,
        `InBody scans ${beforeWhere}`
      )
    );
  }
  if (scansAfter.length < MIN_SCANS_PER_SIDE) {
    return insufficient(
      period,
      formatGateShortfall(
        scansAfter.length,
        MIN_SCANS_PER_SIDE,
        "InBody scan after this date",
        "InBody scans after this date"
      )
    );
  }

  let improvingCount = 0;
  let decliningCount = 0;
  let flatCount = 0;

  for (const { candidate, before, after } of classified) {
    const beforeAvg = mean(before.map((e) => e.value));
    const afterAvg = mean(after.map((e) => e.value));
    const rawPctChange = beforeAvg === 0 ? 0 : (afterAvg - beforeAvg) / beforeAvg;
    const signedPctChange = candidate.scoreDirection === "lower_better" ? -rawPctChange : rawPctChange;
    if (signedPctChange >= TREND_THRESHOLD) improvingCount++;
    else if (signedPctChange <= -TREND_THRESHOLD) decliningCount++;
    else flatCount++;
  }

  const performanceSummary: VerdictPerformanceSummary = {
    improvingCount,
    decliningCount,
    flatCount,
    classifiedCount: classified.length,
  };

  // Nearest scan strictly before the start date vs. nearest on/after it (and,
  // when the period has ended, on/before it too, per `scansAfter` above)
  // — the tightest read of the transition itself, not the earliest/latest
  // scan in the athlete's whole history.
  const nearestBefore = scansBefore.reduce((a, b) => (b.date.isAfter(a.date) ? b : a));
  const nearestAfter = scansAfter.reduce((a, b) => (b.date.isBefore(a.date) ? b : a));
  const bodyCompSummary: VerdictBodyCompSummary = computeBodyCompTrend(
    nearestBefore.raw,
    nearestAfter.raw,
    options.noiseBands ?? getBodyCompNoiseBands(parsedScans.map((s) => s.raw))
  );

  const bodyCompState: "declining" | "improving" | "stable" = isBodyCompDeclining(bodyCompSummary)
    ? "declining"
    : isBodyCompImproving(bodyCompSummary)
      ? "improving"
      : "stable";

  // A strict majority (more than half of classified subjects) is required
  // for a clean up/down/flat read; no strict majority falls to `mixed`,
  // same spirit as the spec's own framing of `mixed` as an informative,
  // inconclusive result rather than a fallback error state.
  const half = classified.length / 2;
  let classification: VerdictClassification;
  if (improvingCount > half && bodyCompState !== "declining") {
    classification = "improved";
  } else if (decliningCount > half && bodyCompState !== "improving") {
    classification = "declined";
  } else if (flatCount > half && bodyCompState === "stable") {
    classification = "no_change";
  } else {
    classification = "mixed";
  }

  return { period, classification, performanceSummary, bodyCompSummary };
}
