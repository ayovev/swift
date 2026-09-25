import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { NAMED_BENCHMARKS, toTitleCase } from "./buildDashboardData";
import type { SugarWodRow } from "@/types/dashboard";
import type { InBodyRow } from "@/types/inbody";
import type {
  PlateauBodyCompTrend,
  PlateauClassification,
  PlateauInsight,
  PlateauPerformancePoint,
  PlateauSubject,
} from "@/types/plateau";

dayjs.extend(customParseFormat);

/**
 * Score direction per named benchmark. `score_type` is unreliable for these
 * (blank for Grace/Nancy in the real export despite both being time-based),
 * so this is a maintained lookup instead. All ten are time-based
 * (lower_better) except Cindy, a 20-minute AMRAP scored rounds+reps
 * (higher_better) — confirmed against the sample export, where
 * `best_result_raw` is encoded as "16.015" (16 rounds, 15 reps): a plain
 * float parse, larger is better.
 */
const BENCHMARK_SCORE_DIRECTION: Record<(typeof NAMED_BENCHMARKS)[number], ScoreDirection> = {
  FRAN: "lower_better",
  GRACE: "lower_better",
  MURPH: "lower_better",
  HELEN: "lower_better",
  DIANE: "lower_better",
  NANCY: "lower_better",
  ANNIE: "lower_better",
  JACKIE: "lower_better",
  KAREN: "lower_better",
  CINDY: "higher_better",
};

type ScoreDirection = "lower_better" | "higher_better";

/** Eligibility gate minimums (spec Step 2). */
const MIN_ENTRIES = 3;
const MIN_SCANS_IN_WINDOW = 2;

/**
 * Relative change (vs. the previous window's average) needed to call a trend
 * up/down rather than flat. Starting point, verified against real sample
 * data: the Back Squat decline is -4.8% (clears it), Diane's real
 * improvement is +8.4% (clears it) — both comfortably past 3% without the
 * threshold being so loose it swallows real signal. Tune against the full
 * sample export if it proves too strict/loose in practice.
 */
const TREND_THRESHOLD = 0.03;

interface DatedValue {
  date: Dayjs;
  value: number;
}

interface SubjectCandidate {
  subject: PlateauSubject;
  entries: DatedValue[];
  scoreDirection: ScoreDirection;
}

function parseWorkoutDate(dateStr: string): Dayjs {
  return dayjs((dateStr ?? "").trim(), "MM/DD/YYYY", true);
}

function parseInBodyDate(dateStr: string): Dayjs {
  return dayjs((dateStr ?? "").trim(), "YYYYMMDDHHmmss", true);
}

/** Treats "", undefined and the literal "-" (InBody's "not measured") as no data — never 0. */
function parseNumericField(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "-") return null;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

/** Strips exactly one trailing "s" so "Deadlift"/"Deadlifts" group together. */
function normalizeLiftName(s: string): string {
  return s.trim().toLowerCase().replace(/s$/, "");
}

/** Matches the codebase's existing `titleNorm` convention (exact-equality, not substring). */
function normalizeTitle(s: string): string {
  return (s ?? "").trim().toUpperCase();
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toPoint(e: DatedValue): PlateauPerformancePoint {
  return { date: e.date.format("YYYY-MM-DD"), value: e.value };
}

interface LiftGroup {
  /** Original casing, e.g. "Back Squat", kept for display. */
  displayName: string;
  rows: { date: Dayjs; raw: SugarWodRow }[];
}

/**
 * Groups Load-scored lift entries by normalized name, folding in freeform
 * title matches (e.g. a "FRONT SQUAT" title with no barbell_lift tag) into
 * an already-known lift — never inventing a new lift subject from a title
 * match alone. Splits each lift by rx_or_scaled, since PlateauSubject.status
 * applies to lifts the same way it applies to benchmarks.
 */
function buildLiftSubjects(workouts: { date: Dayjs; raw: SugarWodRow }[]): SubjectCandidate[] {
  const groups = new Map<string, LiftGroup>();

  for (const w of workouts) {
    if (w.raw.score_type !== "Load") continue;
    const liftRaw = (w.raw.barbell_lift ?? "").trim();
    if (!liftRaw) continue;
    const key = normalizeLiftName(liftRaw);
    const group = groups.get(key);
    if (group) group.rows.push(w);
    else groups.set(key, { displayName: liftRaw, rows: [w] });
  }

  for (const w of workouts) {
    if (w.raw.score_type !== "Load") continue;
    if ((w.raw.barbell_lift ?? "").trim()) continue; // already covered above
    const key = normalizeLiftName(w.raw.title ?? "");
    const group = groups.get(key);
    if (group) group.rows.push(w);
  }

  const candidates: SubjectCandidate[] = [];
  for (const group of groups.values()) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: DatedValue[] = [];
      for (const w of group.rows) {
        if (w.raw.rx_or_scaled !== status) continue;
        const value = parseNumericField(w.raw.best_result_raw);
        if (value !== null) entries.push({ date: w.date, value });
      }
      if (entries.length === 0) continue;
      candidates.push({
        subject: { type: "lift", name: group.displayName, status },
        entries,
        scoreDirection: "higher_better",
      });
    }
  }
  return candidates;
}

/**
 * Matches only an exact-uppercased-title equality against the named
 * benchmark allowlist — deliberately not the substring-based classify engine
 * (`matcher.ts`), since the sample data has "HEAVY GRACE" and "JUMPING
 * NANCY" entries that are materially different, heavier/harder workouts a
 * substring match would wrongly conflate with Grace/Nancy.
 */
function buildBenchmarkSubjects(workouts: { date: Dayjs; raw: SugarWodRow }[]): SubjectCandidate[] {
  const candidates: SubjectCandidate[] = [];
  for (const name of NAMED_BENCHMARKS) {
    for (const status of ["RX", "SCALED"] as const) {
      const entries: DatedValue[] = [];
      for (const w of workouts) {
        if (normalizeTitle(w.raw.title) !== name || w.raw.rx_or_scaled !== status) continue;
        const value = parseNumericField(w.raw.best_result_raw);
        if (value !== null) entries.push({ date: w.date, value });
      }
      if (entries.length === 0) continue;
      candidates.push({
        subject: { type: "benchmark_wod", name: toTitleCase(name), status },
        entries,
        scoreDirection: BENCHMARK_SCORE_DIRECTION[name],
      });
    }
  }
  return candidates;
}

function diffField(
  start: InBodyRow,
  end: InBodyRow,
  field: keyof InBodyRow
): number | null {
  const startValue = parseNumericField(start[field]);
  const endValue = parseNumericField(end[field]);
  if (startValue === null || endValue === null) return null;
  return endValue - startValue;
}

/**
 * Diffs the two InBody scans nearest the start/end of the performance
 * window. leanMassDelta prefers Soft Lean Mass when both boundary scans have
 * real data for it, falling back to Skeletal Muscle Mass otherwise (the
 * bundled synthetic fixture never reports Soft Lean Mass, so this fallback
 * is what gives fixture-based tests any lean signal at all). fatMassDelta
 * uses Body Fat Mass as the primary signal — less confounded by simultaneous
 * weight change than a percentage; bodyFatPctDelta is tracked separately for
 * display only.
 */
function computeBodyCompTrend(startScan: InBodyRow, endScan: InBodyRow): PlateauBodyCompTrend {
  const softLeanDelta = diffField(startScan, endScan, "Soft Lean Mass(lb)");
  const smmDelta = diffField(startScan, endScan, "Skeletal Muscle Mass(lb)");
  return {
    leanMassDelta: softLeanDelta ?? smmDelta,
    fatMassDelta: diffField(startScan, endScan, "Body Fat Mass(lb)"),
    bodyFatPctDelta: diffField(startScan, endScan, "Percent Body Fat(%)"),
  };
}

/**
 * `flat`/`down` + lean down AND fat up is the one clean "body comp is
 * working against you" story. Every other flat/down combination — including
 * a mixed signal like lean down AND fat also down, which the spec's own
 * table doesn't cover — defaults to plateaued_other: it isn't a body-comp
 * story, which is exactly what that classification means. Never over-claim
 * a cause the data can't support.
 */
function classify(
  direction: "up" | "down" | "flat",
  bodyComp: PlateauBodyCompTrend
): PlateauClassification {
  if (direction === "up") return "improving";
  const leanBad = bodyComp.leanMassDelta !== null && bodyComp.leanMassDelta < 0;
  const fatBad = bodyComp.fatMassDelta !== null && bodyComp.fatMassDelta > 0;
  return leanBad && fatBad ? "plateaued_body_comp" : "plateaued_other";
}

type ConfidenceTier = "low" | "medium" | "high";
const TIER_ORDER: Record<ConfidenceTier, number> = { low: 0, medium: 1, high: 2 };

/**
 * Confidence is the weaker of two tiers, matching the spec's own anchors
 * exactly: "low" just clears the gate (3 entries / 2 scans), "high" needs
 * 8+ entries and 4+ scans.
 */
function tierConfidence(entryCount: number, scanCount: number): ConfidenceTier {
  const entryTier: ConfidenceTier = entryCount >= 8 ? "high" : entryCount >= 5 ? "medium" : "low";
  const scanTier: ConfidenceTier = scanCount >= 4 ? "high" : scanCount >= 3 ? "medium" : "low";
  return TIER_ORDER[entryTier] <= TIER_ORDER[scanTier] ? entryTier : scanTier;
}

function insufficientInsight(
  subject: PlateauSubject,
  sorted: DatedValue[],
  windowStart: Dayjs | undefined,
  windowEnd: Dayjs | undefined
): PlateauInsight {
  return {
    subject,
    classification: "insufficient_data",
    windowStart: windowStart?.format("YYYY-MM-DD") ?? "",
    windowEnd: windowEnd?.format("YYYY-MM-DD") ?? "",
    performanceTrend: { direction: "flat", recentPoints: sorted.map(toPoint) },
    confidence: "low",
  };
}

function computeInsight(
  candidate: SubjectCandidate,
  scans: { date: Dayjs; raw: InBodyRow }[]
): PlateauInsight {
  const { subject, entries, scoreDirection } = candidate;
  const sorted = [...entries].sort((a, b) => a.date.valueOf() - b.date.valueOf());
  const n = sorted.length;

  if (n < MIN_ENTRIES) {
    return insufficientInsight(subject, sorted, sorted[0]?.date, sorted[n - 1]?.date);
  }

  // Session-count windows, not calendar-day lookback: real benchmark logging
  // is too sparse/irregular (e.g. Nancy: 7 entries over 3+ years) for a
  // fixed lookback to reliably find >=2 points per side.
  const windowSize = Math.max(1, Math.min(3, Math.floor(n / 2)));
  const recentWindow = sorted.slice(-windowSize);
  const previousWindow = sorted.slice(-2 * windowSize, -windowSize);

  const recentAvg = mean(recentWindow.map((e) => e.value));
  const previousAvg = mean(previousWindow.map((e) => e.value));
  const rawPctChange = previousAvg === 0 ? 0 : (recentAvg - previousAvg) / previousAvg;
  const signedPctChange = scoreDirection === "lower_better" ? -rawPctChange : rawPctChange;
  const direction: "up" | "down" | "flat" =
    signedPctChange >= TREND_THRESHOLD ? "up" : signedPctChange <= -TREND_THRESHOLD ? "down" : "flat";

  const windowStart = previousWindow[0]!.date;
  const windowEnd = recentWindow[recentWindow.length - 1]!.date;
  const performanceTrend = { direction, recentPoints: recentWindow.map(toPoint) };

  const scansInWindow = scans
    .filter((s) => !s.date.isBefore(windowStart, "day") && !s.date.isAfter(windowEnd, "day"))
    .sort((a, b) => a.date.valueOf() - b.date.valueOf());

  if (scansInWindow.length < MIN_SCANS_IN_WINDOW) {
    return {
      subject,
      classification: "insufficient_data",
      windowStart: windowStart.format("YYYY-MM-DD"),
      windowEnd: windowEnd.format("YYYY-MM-DD"),
      performanceTrend,
      confidence: "low",
    };
  }

  const bodyCompTrend = computeBodyCompTrend(
    scansInWindow[0]!.raw,
    scansInWindow[scansInWindow.length - 1]!.raw
  );

  return {
    subject,
    classification: classify(direction, bodyCompTrend),
    windowStart: windowStart.format("YYYY-MM-DD"),
    windowEnd: windowEnd.format("YYYY-MM-DD"),
    performanceTrend,
    bodyCompTrend,
    confidence: tierConfidence(n, scansInWindow.length),
  };
}

/**
 * Pure function: for each lift or named benchmark WOD an athlete has logged
 * with a consistent rx_or_scaled status, classifies whether performance is
 * improving, plateaued (body-comp-driven or otherwise), or there's not yet
 * enough data to say. No identity, no persistence, no lookups — just the two
 * datasets in, insights out — kept standalone rather than plugged into
 * `buildInsights`'s SugarWOD-only pipeline, since it needs InBody data too.
 */
export function getPlateauInsights(
  workouts: SugarWodRow[],
  inbodyScans: InBodyRow[],
  asOfDate: Date
): PlateauInsight[] {
  const asOf = dayjs(asOfDate);

  const parsedWorkouts = workouts
    .map((raw) => ({ raw, date: parseWorkoutDate(raw.date) }))
    .filter((w) => w.date.isValid() && !w.date.isAfter(asOf, "day"));

  const parsedScans = inbodyScans
    .map((raw) => ({ raw, date: parseInBodyDate(raw.date) }))
    .filter((s) => s.date.isValid() && !s.date.isAfter(asOf, "day"));

  const candidates = [...buildLiftSubjects(parsedWorkouts), ...buildBenchmarkSubjects(parsedWorkouts)];
  return candidates.map((candidate) => computeInsight(candidate, parsedScans));
}
