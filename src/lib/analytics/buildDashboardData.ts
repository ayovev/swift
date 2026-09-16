import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { classifyWithReasons } from "@/lib/classify/domainKeywords";
import { classifiableText } from "@/lib/classify/matcher";
import { parseRepMax } from "./repMax";
import { DOMAIN_LIST } from "@/types/dashboard";
import type {
  BenchmarkEntry,
  DashboardData,
  Domain,
  DomainTrendPoint,
  LiftEntry,
  MonthlyCount,
  OverallDomainStat,
  PrTimelineEntry,
  StackedMonthlyShare,
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
  /** YYYY-MM */
  ym: string;
}

/**
 * Parse, classify, and sort rows oldest-first. Exported because the modality
 * pipeline consumes the same parsed rows rather than re-parsing the file.
 */
export function parseRows(rows: SugarWodRow[]): ParsedRow[] {
  const parsed: ParsedRow[] = [];

  for (const raw of rows) {
    const dateParsed = parseDate(raw.date ?? "");
    // parseCsv already dropped undated rows; skip defensively rather than
    // letting one bad cell produce NaN months downstream.
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
      ym: dateParsed.format("YYYY-MM"),
    });
  }

  parsed.sort((a, b) => a.dateParsed.valueOf() - b.dateParsed.valueOf());
  return parsed;
}

export function buildDashboardData(rows: SugarWodRow[]): DashboardData {
  const df = parseRows(rows);
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
    avg_per_month: 0, // filled in once months are known
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

  // --- monthly counts ---
  const monthlyMap = new Map<string, number>();
  for (const r of df) monthlyMap.set(r.ym, (monthlyMap.get(r.ym) ?? 0) + 1);
  const monthly: MonthlyCount[] = [...monthlyMap.entries()].map(([month, count]) => ({
    month,
    count,
  }));
  const allMonths = [...monthlyMap.keys()].sort();
  summary.avg_per_month =
    allMonths.length > 0 ? Math.round((totalWorkouts / allMonths.length) * 10) / 10 : 0;

  // --- PR timeline ---
  const pr_timeline: PrTimelineEntry[] = df
    .filter((r) => r.raw.pr === "PR")
    .map((r) => ({
      date: r.dateParsed.format("YYYY-MM-DD"),
      title: r.raw.title,
      display: r.raw.best_result_display ?? "",
      barbell_lift: r.raw.barbell_lift || null,
    }));

  // --- per-domain monthly trend ---
  // Group once rather than re-filtering the whole set per domain per month;
  // at 1,200 rows x 10 domains x ~47 months the naive version is noticeably slow.
  const byMonth = new Map<string, ParsedRow[]>();
  for (const r of df) {
    const bucket = byMonth.get(r.ym);
    if (bucket) bucket.push(r);
    else byMonth.set(r.ym, [r]);
  }

  const domain_trends = {} as Record<Domain, DomainTrendPoint[]>;
  for (const domain of DOMAIN_LIST) {
    domain_trends[domain] = allMonths.map((month) => {
      const group = byMonth.get(month) ?? [];
      const count = group.filter((r) => r.domains.has(domain)).length;
      return { month, count, pct: pct1(count, group.length), total: group.length };
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

  // --- normalized monthly domain shares (sums to 100 per month) ---
  // Deliberately NOT the same as domain_trends[d].pct: domains overlap, so
  // those sum to ~300%. This view divides by total tags, not total workouts.
  const monthly_shares: StackedMonthlyShare[] = allMonths.map((month, i) => {
    const counts = DOMAIN_LIST.map((d) => domain_trends[d][i]?.count ?? 0);
    const totalTags = counts.reduce((sum, c) => sum + c, 0);
    const row: StackedMonthlyShare = { month };
    DOMAIN_LIST.forEach((d, di) => {
      row[d] = pct1(counts[di] ?? 0, totalTags);
    });
    return row;
  });

  return {
    summary,
    lifts,
    benchmarks,
    monthly,
    pr_timeline,
    domain_trends,
    overall,
    trend_direction,
    workout_lists,
    stacked: { domain_names: DOMAIN_LIST, monthly_shares },
  };
}
