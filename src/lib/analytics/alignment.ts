import dayjs, { type Dayjs } from "dayjs";
import {
  computeBodyCompTrend,
  formatGateShortfall,
  isBodyCompDeclining,
  parseInBodyDate,
} from "./plateauDetector";
import type { InBodyRow } from "@/types/inbody";
import type { PlateauInsight } from "@/types/plateau";
import type {
  AlignmentBodyCompSummary,
  AlignmentPerformanceSummary,
  AlignmentResult,
} from "@/types/alignment";

/** Eligibility gate minimums (spec Step 1). Named separately from #1's
 * MIN_ENTRIES/MIN_SCANS_IN_WINDOW even though the scan minimum currently
 * matches — the spec flags the whole-athlete InBody-scan minimum as its own
 * open tuning question, independent of #1's per-subject one. */
const MIN_CLASSIFIED_SUBJECTS = 3;
const MIN_SCANS_FOR_ROLLUP = 2;

const NULL_BODY_COMP_TREND = { leanMassDelta: null, fatMassDelta: null, bodyFatPctDelta: null } as const;

function computePerformanceSummary(classified: PlateauInsight[]): AlignmentPerformanceSummary {
  let improvingCount = 0;
  let plateauedCount = 0;
  for (const insight of classified) {
    if (insight.classification === "improving") improvingCount++;
    else if (insight.classification === "plateaued_body_comp" || insight.classification === "plateaued_other") {
      plateauedCount++;
    }
  }
  return { improvingCount, plateauedCount, classifiedCount: classified.length };
}

/**
 * The whole-athlete equivalent of #1's per-subject window: #1 computes an
 * independent session-count-based window per lift/benchmark, so there's no
 * single window to inherit. This takes the union span — earliest
 * windowStart to latest windowEnd across every classified subject — so the
 * body-comp comparison below has the best chance of finding qualifying
 * InBody scans across everything #1 already looked at.
 */
function computeWindowSpan(classified: PlateauInsight[]): { windowStart: string; windowEnd: string } {
  if (classified.length === 0) return { windowStart: "", windowEnd: "" };
  let windowStart = classified[0]!.windowStart;
  let windowEnd = classified[0]!.windowEnd;
  for (const insight of classified) {
    if (dayjs(insight.windowStart).isBefore(dayjs(windowStart))) windowStart = insight.windowStart;
    if (dayjs(insight.windowEnd).isAfter(dayjs(windowEnd))) windowEnd = insight.windowEnd;
  }
  return { windowStart, windowEnd };
}

function scansInWindow(
  inbodyScans: InBodyRow[],
  asOfDate: Date,
  windowStart: string,
  windowEnd: string
): { date: Dayjs; raw: InBodyRow }[] {
  const asOf = dayjs(asOfDate);
  const start = dayjs(windowStart);
  const end = dayjs(windowEnd);
  return inbodyScans
    .map((raw) => ({ raw, date: parseInBodyDate(raw.date) }))
    .filter((s) => s.date.isValid() && !s.date.isAfter(asOf, "day"))
    .filter((s) => !s.date.isBefore(start, "day") && !s.date.isAfter(end, "day"))
    .sort((a, b) => a.date.valueOf() - b.date.valueOf());
}

/**
 * Pure function: rolls up #1's per-subject Plateau Detector output plus the
 * raw InBody scans into one whole-athlete read — "are performance and body
 * composition telling a consistent story, or are they in tension?" Takes
 * #1's output directly rather than raw workout data, since this is a rollup,
 * not a re-derivation (see #1's own `getPlateauInsights`).
 */
export function getAlignment(
  plateauInsights: PlateauInsight[],
  inbodyScans: InBodyRow[],
  asOfDate: Date
): AlignmentResult {
  const classified = plateauInsights.filter((i) => i.classification !== "insufficient_data");
  const performanceSummary = computePerformanceSummary(classified);

  // Gate (a): a rollup built on too few classified subjects looks confident
  // but isn't representative of the whole athlete.
  if (performanceSummary.classifiedCount < MIN_CLASSIFIED_SUBJECTS) {
    const { windowStart, windowEnd } = computeWindowSpan(classified);
    return {
      classification: "insufficient_data",
      reason: formatGateShortfall(
        performanceSummary.classifiedCount,
        MIN_CLASSIFIED_SUBJECTS,
        "classified lift/WOD",
        "classified lifts/WODs"
      ),
      performanceSummary,
      bodyCompSummary: { ...NULL_BODY_COMP_TREND, windowStart, windowEnd },
    };
  }

  const { windowStart, windowEnd } = computeWindowSpan(classified);
  const scansInRange = scansInWindow(inbodyScans, asOfDate, windowStart, windowEnd);

  // Gate (b): same "is there enough body-comp signal in this window" check
  // as #1, just at the whole-athlete level instead of per-subject.
  if (scansInRange.length < MIN_SCANS_FOR_ROLLUP) {
    return {
      classification: "insufficient_data",
      reason: formatGateShortfall(
        scansInRange.length,
        MIN_SCANS_FOR_ROLLUP,
        "InBody scan in this window",
        "InBody scans in this window"
      ),
      performanceSummary,
      bodyCompSummary: { ...NULL_BODY_COMP_TREND, windowStart, windowEnd },
    };
  }

  const bodyCompTrend = computeBodyCompTrend(
    scansInRange[0]!.raw,
    scansInRange[scansInRange.length - 1]!.raw
  );
  const bodyCompSummary: AlignmentBodyCompSummary = { ...bodyCompTrend, windowStart, windowEnd };

  // Majority direction across classified subjects. A tie (including 0
  // classified-and-comparable subjects, which gate (a) already rules out)
  // falls to the "not trending up" side, matching the spec's table, which
  // only distinguishes "trending up" from "trending down / mixed."
  const performanceUp = performanceSummary.improvingCount > performanceSummary.plateauedCount;
  const bodyCompDeclining = isBodyCompDeclining(bodyCompSummary);

  let classification: AlignmentResult["classification"];
  if (performanceUp && !bodyCompDeclining) {
    classification = "aligned"; // trending up + lean stable/up, fat stable/down
  } else if (!performanceUp && bodyCompDeclining) {
    classification = "aligned"; // trending down/mixed + lean down, fat up: a consistent cut/decline story
  } else if (performanceUp && bodyCompDeclining) {
    classification = "tension"; // trending up + lean down, fat up: signals contradict
  } else {
    classification = "tension"; // trending down/mixed + lean stable/up, fat stable/down: signals contradict
  }

  return { classification, performanceSummary, bodyCompSummary };
}
