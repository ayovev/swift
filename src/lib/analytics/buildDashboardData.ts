import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { classifyWithReasons } from "@/lib/classify/domainKeywords";
import { classifiableText } from "@/lib/classify/matcher";
import { parseRepMax } from "./repMax";
import { bucketKey, type Granularity } from "./granularity";
import { DOMAIN_LIST } from "@/types/dashboard";
import type {
  BenchmarkEntry,
  BucketCount,
  DashboardData,
  Domain,
  DomainTrendPoint,
  LiftEntry,
  OverallDomainStat,
  PrTimelineEntry,
  StackedBucketShare,
  SugarWodRow,
  TrendDirectionStat,
  WorkoutListEntry,
} from "@/types/dashboard";

dayjs.extend(customParseFormat);

/** "The girls" plus a couple of heroes. Matched on exact uppercased title. */
const NAMED_BENCHMARKS = [
  "FRAN", "GRACE", "MURPH", "HELEN", "DIANE",
  "NANCY", "CINDY", "ANNIE", "JACKIE", "KAREN",
] as const;

/** A benchmark needs at least this many logs before a history is worth showing. */
const MIN_ENTRIES_FOR_HISTORY = 2;

function toTitleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/**
 * Input dates are "MM/DD/YYYY". `new Date(str)` is locale-inconsistent for
 * that format, so parse explicitly and strictly.
 */
function parseDate(dateStr: string): Dayjs {
  return dayjs(dateStr.trim(), "MM/DD/YYYY", true);
}

function parseFloatOrNull(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

/**
 * round(x, 1). Uses plain Math.round rather than replicating Python's
 * round-half-even. Measured divergence against the validation export: 20 of
 * 950 percentage cells differ, each by exactly 0.1, all in months whose
 * count/total lands on an exact .x5 tie. Invisible in any chart.
 */
function pct1(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface ParsedRow {
  raw: SugarWodRow;
  dateParsed: Dayjs;
  titleNorm: string;
  /** Lowercased title + description + barbell_lift — what both classifiers read. */
  text: string;
  domainHits: Partial<Record<Domain, string>>;
  domains: Set<Domain>;
  /** The row's aggregation bucket key, shaped by the selected granularity (default "YYYY-MM"). */
  bucket: string;
}

/**
 * Parse, classify, and sort rows oldest-first. Exported because the modality
 * pipeline consumes the same parsed rows rather than re-parsing the file.
 */
export function parseRows(rows: SugarWodRow[], granularity: Granularity = "monthly"): ParsedRow[] {
  const parsed: ParsedRow[] = [];

  for (const raw of rows) {
    const dateParsed = parseDate(raw.date ?? "");
    // parseCsv already dropped undated rows; skip defensively rather than
    // letting one bad cell produce NaN buckets downstream.
    if (!dateParsed.isValid()) continue;

    const text = classifiableText(raw);
    const domainHits = classifyWithReasons(text);

    parsed.push({
      raw,
      dateParsed,
      titleNorm: (raw.title ?? "").trim().toUpperCase(),
      text,
      domainHits,
      domains: new Set(Object.keys(domainHits) as Domain[]),
      bucket: bucketKey(dateParsed, granularity),
    });
  }

  parsed.sort((a, b) => a.dateParsed.valueOf() - b.dateParsed.valueOf());
  return parsed;
}

export function buildDashboardData(
  rows: SugarWodRow[],
  granularity: Granularity = "monthly"
): DashboardData {
  const df = parseRows(rows, granularity);
  return buildFromParsedRows(df);
}

export function buildFromParsedRows(df: readonly ParsedRow[]): DashboardData {
  const totalWorkouts = df.length;
  const first = df[0];
  const last = df[totalWorkouts - 1];

  // --- summary ---
  const summary = {
    total_logged: totalWorkouts,
    date_start: first ? first.dateParsed.format("YYYY-MM-DD") : "",
    date_end: last ? last.dateParsed.format("YYYY-MM-DD") : "",
    total_prs: df.filter((r) => r.raw.pr === "PR").length,
    rx_count: df.filter((r) => r.raw.rx_or_scaled === "RX").length,
    scaled_count: df.filter((r) => r.raw.rx_or_scaled === "SCALED").length,
    avg_per_bucket: 0, // filled in once buckets are known
    unique_days: 0, // filled in once buckets are known
    avg_days_per_bucket: 0, // filled in once buckets are known
  };

  // --- lifts: Load-scored barbell entries with enough history to plot ---
  const liftsDf = df.filter((r) => r.raw.score_type === "Load" && !!r.raw.barbell_lift);
  const liftNames = [...new Set(liftsDf.map((r) => r.raw.barbell_lift))].sort();
  const lifts: Record<string, LiftEntry[]> = {};
  for (const lift of liftNames) {
    const sub = liftsDf.filter((r) => r.raw.barbell_lift === lift);
    if (sub.length < MIN_ENTRIES_FOR_HISTORY) continue;
    lifts[lift] = sub.map((r) => ({
      date: r.dateParsed.format("YYYY-MM-DD"),
      value: parseFloatOrNull(r.raw.best_result_raw) ?? 0,
      rx: r.raw.rx_or_scaled,
      pr: r.raw.pr === "PR",
      repMax: parseRepMax(`${r.raw.title ?? ""} ${r.raw.description ?? ""}`),
    }));
  }

  // --- named benchmarks ---
  const benchmarks: Record<string, BenchmarkEntry[]> = {};
  for (const name of NAMED_BENCHMARKS) {
    const sub = df.filter((r) => r.titleNorm === name);
    if (sub.length < MIN_ENTRIES_FOR_HISTORY) continue;
    benchmarks[toTitleCase(name)] = sub.map((r) => ({
      date: r.dateParsed.format("YYYY-MM-DD"),
      value: parseFloatOrNull(r.raw.best_result_raw),
      display: r.raw.best_result_display ?? "",
      rx: r.raw.rx_or_scaled ?? "",
      pr: r.raw.pr === "PR",
    }));
  }

  // --- bucket counts ---
  const bucketMap = new Map<string, number>();
  for (const r of df) bucketMap.set(r.bucket, (bucketMap.get(r.bucket) ?? 0) + 1);
  const buckets: BucketCount[] = [...bucketMap.entries()].map(([bucket, count]) => ({
    bucket,
    count,
  }));
  const allBuckets = [...bucketMap.keys()].sort();
  summary.avg_per_bucket =
    allBuckets.length > 0 ? Math.round((totalWorkouts / allBuckets.length) * 10) / 10 : 0;

  // --- unique training days, overall and per bucket ---
  // Several rows can share a date (a class plus logged accessory work), so
  // this is a distinct count from total_logged rather than derived from it.
  const daysByBucket = new Map<string, Set<string>>();
  const allDays = new Set<string>();
  for (const r of df) {
    const day = r.dateParsed.format("YYYY-MM-DD");
    allDays.add(day);
    const set = daysByBucket.get(r.bucket);
    if (set) set.add(day);
    else daysByBucket.set(r.bucket, new Set([day]));
  }
  summary.unique_days = allDays.size;
  summary.avg_days_per_bucket =
    allBuckets.length > 0
      ? Math.round(
          (allBuckets.reduce((sum, b) => sum + (daysByBucket.get(b)?.size ?? 0), 0) /
            allBuckets.length) *
            10
        ) / 10
      : 0;
  const days_buckets: BucketCount[] = allBuckets.map((bucket) => ({
    bucket,
    count: daysByBucket.get(bucket)?.size ?? 0,
  }));

  // --- PR timeline ---
  const pr_timeline: PrTimelineEntry[] = df
    .filter((r) => r.raw.pr === "PR")
    .map((r) => ({
      date: r.dateParsed.format("YYYY-MM-DD"),
      title: r.raw.title,
      display: r.raw.best_result_display ?? "",
      barbell_lift: r.raw.barbell_lift || null,
    }));

  // --- per-domain trend, one point per bucket ---
  // Group once rather than re-filtering the whole set per domain per bucket;
  // at 1,200 rows x 10 domains x ~47 monthly buckets the naive version is
  // noticeably slow (and worse at daily/weekly granularity).
  const byBucket = new Map<string, ParsedRow[]>();
  for (const r of df) {
    const group = byBucket.get(r.bucket);
    if (group) group.push(r);
    else byBucket.set(r.bucket, [r]);
  }

  const domain_trends = {} as Record<Domain, DomainTrendPoint[]>;
  for (const domain of DOMAIN_LIST) {
    domain_trends[domain] = allBuckets.map((bucket) => {
      const group = byBucket.get(bucket) ?? [];
      const count = group.filter((r) => r.domains.has(domain)).length;
      return { bucket, count, pct: pct1(count, group.length), total: group.length };
    });
  }

  // --- overall domain totals ---
  const overall = {} as Record<Domain, OverallDomainStat>;
  for (const domain of DOMAIN_LIST) {
    const count = df.filter((r) => r.domains.has(domain)).length;
    overall[domain] = { count, pct: pct1(count, totalWorkouts) };
  }

  // --- early half vs late half ---
  const midpoint = Math.floor(totalWorkouts / 2);
  const early = df.slice(0, midpoint);
  const late = df.slice(midpoint);
  const trend_direction = {} as Record<Domain, TrendDirectionStat>;
  for (const domain of DOMAIN_LIST) {
    const earlyCount = early.filter((r) => r.domains.has(domain)).length;
    const lateCount = late.filter((r) => r.domains.has(domain)).length;
    const early_pct = pct1(earlyCount, early.length);
    const late_pct = pct1(lateCount, late.length);
    trend_direction[domain] = {
      early_pct,
      late_pct,
      delta: Math.round((late_pct - early_pct) * 10) / 10,
    };
  }

  // --- per-domain workout lists, most recent first ---
  const recentFirst = [...df].reverse();
  const workout_lists = {} as Record<Domain, WorkoutListEntry[]>;
  for (const domain of DOMAIN_LIST) workout_lists[domain] = [];
  for (const r of recentFirst) {
    for (const [domain, keyword] of Object.entries(r.domainHits) as [Domain, string][]) {
      workout_lists[domain].push([r.dateParsed.format("YY-MM-DD"), r.raw.title, keyword]);
    }
  }

  // --- normalized per-bucket domain shares (sums to 100 per bucket) ---
  // Deliberately NOT the same as domain_trends[d].pct: domains overlap, so
  // those sum to ~300%. This view divides by total tags, not total workouts.
  const bucket_shares: StackedBucketShare[] = allBuckets.map((bucket, i) => {
    const counts = DOMAIN_LIST.map((d) => domain_trends[d][i]?.count ?? 0);
    const totalTags = counts.reduce((sum, c) => sum + c, 0);
    const row: StackedBucketShare = { bucket };
    DOMAIN_LIST.forEach((d, di) => {
      row[d] = pct1(counts[di] ?? 0, totalTags);
    });
    return row;
  });

  return {
    summary,
    lifts,
    benchmarks,
    buckets,
    days_buckets,
    pr_timeline,
    domain_trends,
    overall,
    trend_direction,
    workout_lists,
    stacked: { domain_names: DOMAIN_LIST, bucket_shares },
  };
}
