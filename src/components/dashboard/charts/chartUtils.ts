import dayjs from "dayjs";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS, type BucketCount, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS, type Modality } from "@/types/modality";
import type { ChartConfig } from "@/components/ui/chart";
import type { RepMaxCategory, TrackedRepMaxCategory } from "@/lib/analytics/repMax";

/** "2025-03-14" -> "14 Mar 2025" */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** "25-03-14" (the workout-list format) -> "14 Mar 2025" */
export function formatShortDate(yyMmDd: string): string {
  const [yy, mm, dd] = yyMmDd.split("-");
  if (!yy || !mm || !dd) return yyMmDd;
  return formatDate(`20${yy}-${mm}-${dd}`);
}

export interface MergedBucketCount {
  bucket: string;
  count: number;
  secondaryCount: number;
}

/**
 * Merges a primary bucket series with a secondary one sharing the same
 * bucket keys (e.g. workouts logged and unique days trained) into one row
 * per bucket, in the primary series' order — used to feed a grouped bar
 * chart from two independently-built BucketCount[] arrays. A secondary
 * bucket with no primary counterpart is dropped (the primary series' bucket
 * set is authoritative); a primary bucket missing from the secondary series
 * falls back to 0 rather than being dropped.
 */
export function mergeBucketCounts(
  primary: readonly BucketCount[],
  secondary: readonly BucketCount[]
): MergedBucketCount[] {
  const secondaryByBucket = new Map(secondary.map((b) => [b.bucket, b.count]));
  return primary.map((b) => ({
    bucket: b.bucket,
    count: b.count,
    secondaryCount: secondaryByBucket.get(b.bucket) ?? 0,
  }));
}

/**
 * The ten domain series, coloured along the accent's own hue rather than a
 * rainbow — see chartSeries() in lib/theme/palette.ts.
 */
export const DOMAIN_CHART_CONFIG: ChartConfig = Object.fromEntries(
  DOMAIN_LIST.map((domain, i) => [
    domain,
    { label: DOMAIN_SHORT_LABELS[domain], color: `var(--chart-${i + 1})` },
  ])
);

export function domainColor(domain: Domain): string {
  return `var(--chart-${DOMAIN_LIST.indexOf(domain) + 1})`;
}

export function modalityColor(modality: Modality): string {
  return `var(--chart-${MODALITY_LIST.indexOf(modality) * 4 + 1})`;
}

/** Shared axis styling — muted, small, and out of the way of the data. */
export const AXIS_PROPS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Y-axis widths, sized for the LONGEST label each axis can produce.
 *
 * Recharts renders axis labels inside the SVG canvas, so a negative left chart
 * margin tuned for short labels ("25") silently clips longer ones ("100%") off
 * the edge — the values are in the DOM the whole time, just painted outside the
 * viewBox, which makes it look like a data bug rather than a layout one.
 * Chart margins therefore stay at left: 0 and the axis reserves its own space.
 */
export const PCT_AXIS_WIDTH = 48;
export const NUM_AXIS_WIDTH = 52;

/**
 * The target tick count for every axis in the app, numeric or time — one
 * shared constant so every chart reads as the same "density" of gridlines
 * rather than each picking its own. It's a target, not a guarantee:
 * niceAxisTicks only steps in round 1/2/2.5/5/10 multiples and niceTimeTicks
 * only steps in calendar units (day/week/month/quarter/year), so a domain
 * that doesn't factor neatly lands on however many of those a clean envelope
 * actually divides into — usually within a tick or two of this number, never
 * exactly forced at the cost of a value like 104 or a date with no calendar
 * significance.
 */
export const AXIS_TICK_COUNT = 6;

/**
 * Recharts, given an explicit numeric domain and no `ticks` prop, generates
 * "nice" evenly-stepped gridlines but then forces the exact domain max back
 * in as the last tick — so a domain like [124.5, 215.5] reads 124.5, 149.5,
 * 174.5, 199.5, 215.5: three even 25-unit steps followed by a cramped 16-unit
 * one. Passing our own `domain` and `ticks`, both derived from a step size
 * that actually divides evenly, is what keeps gridlines visually even.
 *
 * "Nice numbers for graph labels" (Heckbert), extended to target a specific
 * tick count: try every 1/2/2.5/5/10 × a power of ten near the naive
 * (span / (tickCount - 1)) step, and keep whichever actually lands closest
 * to `tickCount` once snapped to the domain — a single fixed classification
 * (as the classic algorithm uses) tends to overshoot or undershoot by 2-3
 * ticks depending on which side of a 1/2/5 boundary the span falls on.
 * Every resulting tick is still a multiple of that chosen round step, so
 * labels always read as clean numbers, never an arbitrary fraction of the
 * range — the tradeoff is the count can land a tick or two off `tickCount`.
 *
 * Every caller must also pass `interval={0}` on its `<YAxis>` — Recharts'
 * gridline generator reuses axis-label collision-avoidance without font
 * metrics, so it silently drops roughly half of an explicit `ticks` array's
 * gridlines otherwise, even though every tick label still renders.
 */
function candidateSteps(rawStep: number): number[] {
  const exponent = Math.floor(Math.log10(rawStep));
  const bases = [1, 2, 2.5, 5, 10];
  const out: number[] = [];
  for (const e of [exponent - 1, exponent, exponent + 1]) {
    for (const base of bases) out.push(base * 10 ** e);
  }
  return out;
}

export function niceAxisTicks(
  min: number,
  max: number,
  tickCount = AXIS_TICK_COUNT,
  // For count data (e.g. workouts logged), a small max — a busy day is 1 or
  // 2 workouts — makes the general algorithm land on a sub-1 step, which
  // reads as "0.5 workouts". Rounding every candidate step up to a whole
  // number keeps ticks meaningful for anything that can't fractionally occur.
  wholeNumbers = false
): { domain: [number, number]; ticks: number[] } {
  if (min === max) return { domain: [min, max], ticks: [min] };

  const rawStep = (max - min) / (tickCount - 1);
  let candidates = candidateSteps(rawStep);
  if (wholeNumbers) candidates = candidates.map((s) => Math.max(1, Math.round(s)));
  candidates = Array.from(new Set(candidates));

  let step = candidates[0]!;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const candidateMin = Math.floor(min / candidate) * candidate;
    const candidateMax = Math.ceil(max / candidate) * candidate;
    const count = Math.round((candidateMax - candidateMin) / candidate) + 1;
    const score = Math.abs(count - tickCount);
    // On a tie, prefer the smaller (denser) step — the alternative can pick
    // an arbitrarily large step when no candidate gets close to tickCount
    // (e.g. a 0–1 whole-number domain, where every count is equally "off").
    if (score < bestScore || (score === bestScore && candidate < step)) {
      step = candidate;
      bestScore = score;
    }
  }

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Round off float accumulation (e.g. 0.1 + 0.2) so ticks print cleanly.
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Number(v.toFixed(precision)));
  }
  return { domain: [niceMin, niceMax], ticks };
}

export type TimeUnit = "day" | "month" | "year";
interface TimeStep {
  amount: number;
  unit: TimeUnit;
}

/**
 * Candidate calendar steps for niceTimeTicks, roughly log-spaced the same
 * way candidateSteps() is for numbers — a day/week/fortnight run for short
 * histories, then month/quarter/half-year/year runs for the multi-year
 * spans a lift's full history usually covers.
 */
const TIME_STEP_CANDIDATES: readonly TimeStep[] = [
  { amount: 1, unit: "day" },
  { amount: 2, unit: "day" },
  { amount: 3, unit: "day" },
  { amount: 7, unit: "day" },
  { amount: 14, unit: "day" },
  { amount: 1, unit: "month" },
  { amount: 2, unit: "month" },
  { amount: 3, unit: "month" },
  { amount: 6, unit: "month" },
  { amount: 1, unit: "year" },
  { amount: 2, unit: "year" },
  { amount: 5, unit: "year" },
  { amount: 10, unit: "year" },
];

/** Rough magnitude in days, used only to break score ties toward the denser step. */
function timeStepMagnitude(step: TimeStep): number {
  const daysPerUnit: Record<TimeUnit, number> = { day: 1, month: 30, year: 365 };
  return step.amount * daysPerUnit[step.unit];
}

/**
 * The first tick at or after `minMs` for a given step, aligned to a globally
 * recognizable calendar boundary rather than an arbitrary offset from
 * `minMs` itself — a 3-month step lands on Jan/Apr/Jul/Oct of the year
 * containing `minMs`, not "3 months after whenever the data happens to
 * start," so a quarterly axis reads as actual quarters. Year steps land on
 * Jan 1 of a year that's a multiple of the step (e.g. every 5th year).
 */
function firstTimeTick(minMs: number, step: TimeStep): number {
  const min = dayjs(minMs);
  if (step.unit === "day") return min.startOf("day").valueOf();

  if (step.unit === "month") {
    const startOfYear = min.startOf("year");
    const monthsIn = min.diff(startOfYear, "month");
    const niceMonthsIn = Math.ceil(monthsIn / step.amount) * step.amount;
    let start = startOfYear.add(niceMonthsIn, "month");
    if (start.valueOf() < minMs) start = start.add(step.amount, "month");
    return start.valueOf();
  }

  const niceYear = Math.ceil(min.year() / step.amount) * step.amount;
  let start = min.year(niceYear).startOf("year");
  if (start.valueOf() < minMs) start = start.add(step.amount, "year");
  return start.valueOf();
}

function timeTicksForStep(minMs: number, maxMs: number, step: TimeStep): number[] {
  const ticks: number[] = [];
  let cursor = dayjs(firstTimeTick(minMs, step));
  while (cursor.valueOf() <= maxMs) {
    ticks.push(cursor.valueOf());
    cursor = cursor.add(step.amount, step.unit);
  }
  return ticks;
}

/**
 * Evenly-spaced, calendar-aligned tick timestamps for a time-domain X axis —
 * the numeric-axis counterpart is niceAxisTicks(), and this is the same
 * "search nearby nice steps for whichever count is closest to the target"
 * idea, except the nice steps are calendar units rather than round numbers,
 * since a chart spanning years reads better ticking on Jan 1 or a quarter
 * start than on an arbitrary evenly-spaced millisecond boundary.
 *
 * Unlike niceAxisTicks, this doesn't widen the domain — the real first/last
 * logged date stays at the chart's edges; only which in-between dates get a
 * labeled tick is computed here. Pass `.ticks` to `<XAxis ticks={...}
 * interval={0} />` — same reason as niceAxisTicks: Recharts' own collision
 * thinning would otherwise second-guess an explicit ticks array. `.unit` is
 * the calendar step that was actually chosen (day/month/year) — pass it to
 * formatTimeTick() so the tick labels read at the same grain as the ticks
 * themselves, e.g. never a "Mar 2025" label sitting on a mid-month tick.
 */
export function niceTimeTicks(
  minMs: number,
  maxMs: number,
  tickCount = AXIS_TICK_COUNT
): { ticks: number[]; unit: TimeUnit } {
  if (minMs === maxMs) return { ticks: [minMs], unit: "day" };

  let bestStep: TimeStep = TIME_STEP_CANDIDATES[0]!;
  let bestTicks: number[] = [];
  let bestScore = Infinity;
  for (const step of TIME_STEP_CANDIDATES) {
    const ticks = timeTicksForStep(minMs, maxMs, step);
    if (ticks.length < 2) continue;
    const score = Math.abs(ticks.length - tickCount);
    if (
      score < bestScore ||
      (score === bestScore && timeStepMagnitude(step) < timeStepMagnitude(bestStep))
    ) {
      bestStep = step;
      bestScore = score;
      bestTicks = ticks;
    }
  }
  return bestTicks.length > 0
    ? { ticks: bestTicks, unit: bestStep.unit }
    : { ticks: [minMs, maxMs], unit: bestStep.unit };
}

/**
 * Formats a niceTimeTicks() tick to match the calendar unit that was chosen
 * for it — the same short, two-digit-year grammar formatBucketLabel() uses
 * for the granularity-bucketed charts (ConsistencyChart, StackedShareChart,
 * ShareAreaChart, BodyCompLineChart), so every chart's x-axis reads as one
 * consistent date style instead of LiftChart's own full "Mar 14, 2025"
 * (formatDate() stays that verbose form for prose contexts — tooltips, the
 * date range picker, PR lists — where there's room and the fuller date reads
 * better).
 */
export function formatTimeTick(t: number, unit: TimeUnit): string {
  const date = new Date(t);
  const yy = String(date.getFullYear()).slice(2);
  switch (unit) {
    case "day":
      return `${date.toLocaleDateString("en-US", { day: "numeric", month: "short" })} '${yy}`;
    case "month":
      return `${date.toLocaleString("en-US", { month: "short" })} '${yy}`;
    case "year":
      return String(date.getFullYear());
  }
}

/** The 4 tracked rep-max schemes, in the fixed left-to-right order every mode uses. */
export const REP_MAX_CATEGORY_ORDER: readonly TrackedRepMaxCategory[] = [
  "1RM",
  "2RM",
  "3RM",
  "5RM",
];

/**
 * Fixed, non-accent-derived colors for the 4 tracked rep-max schemes, used for
 * the lift chart dots and legend. Sourced from the --repmax-* CSS custom
 * properties in index.css.
 */
export const FIXED_REPMAX_COLORS: Record<RepMaxCategory, string> = {
  "1RM": "var(--repmax-1)",
  "2RM": "var(--repmax-2)",
  "3RM": "var(--repmax-3)",
  "5RM": "var(--repmax-5)",
  other: "var(--muted-foreground)",
};

/**
 * Fixed, non-accent-derived colors for the M/W/G modality bar (see
 * ModalityBar.tsx) — the same red/green/blue steps from the rep-max ramp
 * above (1RM's red, 3RM's green, 5RM's blue), skipping 2RM's orange since
 * there are only three modalities to color. Deliberately NOT modalityColor()
 * below, which derives from the athlete's accent hue — this bar stays fixed.
 */
export const FIXED_MODALITY_COLORS: Record<Modality, string> = {
  M: "var(--repmax-1)",
  W: "var(--repmax-3)",
  G: "var(--repmax-5)",
};

/**
 * Chart config built from FIXED_MODALITY_COLORS rather than modalityColor()
 * — used by the Overview M/W/G stacked bar so its segment colors match the
 * per-row ModalityBar on the Workouts tab instead of shifting with the
 * athlete's accent.
 */
export const MODALITY_FIXED_CHART_CONFIG: ChartConfig = Object.fromEntries(
  MODALITY_LIST.map((modality) => [
    modality,
    { label: MODALITY_SHORT_LABELS[modality], color: FIXED_MODALITY_COLORS[modality] },
  ])
);
