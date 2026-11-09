/**
 * The numbers behind Overview's totals row (docs/overview.md): where things
 * stand now, from the full history as of today. Pure functions; `today` is
 * always passed in (YYYY-MM-DD), never read from the clock, as in insights/.
 *
 * Four stats, one per area: days trained, the most recent PR, body weight and
 * the Progress headline. Each reports all time and the recent window
 * (OVERVIEW_RECENT_DAYS ending today) where a pair makes sense. Below them, the
 * evidence for three panels: days trained by month, the recent M/W/G mix and
 * most-trained domains, what moved on Progress, and the latest Timeline entry.
 */
import dayjs from "dayjs";
import type { ParsedRow } from "./buildDashboardData";
import { OVERVIEW_RECENT_DAYS } from "./insightConfig";
import type { BodyReading } from "./insights/bodyContext";
import type { ProgressHeadline, ProgressRow } from "./insights/headline";
import { classifyMovements, sharesTo100 } from "@/lib/classify/classifyModality";
import { DOMAIN_LIST, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, type Modality, type ModalitySplit } from "@/types/modality";
import type { TimelineEntry } from "@/types/timeline";
import { noHeadlineText } from "./insights/display";

const MINUS = "−";

export interface RecentWindow {
  /** First day of the recent window (inclusive). */
  recentStart: string;
  /** First day of the window before it (inclusive); it ends the day before `recentStart`. */
  priorStart: string;
  today: string;
}

/** The last OVERVIEW_RECENT_DAYS days ending today, and the same number of days before them. */
export function recentWindow(today: string): RecentWindow {
  const t = dayjs(today);
  const recentStart = t.subtract(OVERVIEW_RECENT_DAYS - 1, "day");
  return {
    recentStart: recentStart.format("YYYY-MM-DD"),
    priorStart: recentStart.subtract(OVERVIEW_RECENT_DAYS, "day").format("YYYY-MM-DD"),
    today,
  };
}

const iso = (r: ParsedRow): string => r.dateParsed.format("YYYY-MM-DD");

/** "Nov 6", or "Nov 6, 2025" when the date isn't in today's year. */
export function shortDate(date: string, today: string): string {
  const d = dayjs(date);
  return d.year() === dayjs(today).year() ? d.format("MMM D") : d.format("MMM D, YYYY");
}

/** The date of the latest workout on or before today, or null for an empty log. */
export function lastLoggedDate(rows: readonly ParsedRow[], today: string): string | null {
  let max: string | null = null;
  for (const r of rows) {
    const d = iso(r);
    if (d <= today && (max === null || d > max)) max = d;
  }
  return max;
}

/** "Uses your full history, as of today. Last workout logged Nov 6." */
export function overviewScopeSentence(rows: readonly ParsedRow[], today: string): string {
  const last = lastLoggedDate(rows, today);
  return `Uses your full history, as of today.${last ? ` Last workout logged ${shortDate(last, today)}.` : ""}`;
}

// ── Days trained ──────────────────────────────────────────────────────────

export interface DaysTrainedStat {
  total: number;
  recent: number;
  /** Null when the earlier window lies entirely before the first logged workout. */
  prior: number | null;
}

/**
 * Distinct days with at least one logged workout. Days, not workouts logged:
 * one session often produces several SugarWOD entries (a strength piece and a
 * metcon), so a day is the more honest unit of showing up.
 */
export function daysTrainedStat(rows: readonly ParsedRow[], today: string): DaysTrainedStat {
  const w = recentWindow(today);
  const days = new Set<string>();
  for (const r of rows) {
    const d = iso(r);
    if (d <= today) days.add(d);
  }
  let recent = 0;
  let prior = 0;
  let first: string | null = null;
  for (const d of days) {
    if (first === null || d < first) first = d;
    if (d >= w.recentStart) recent++;
    else if (d >= w.priorStart) prior++;
  }
  const priorEnd = dayjs(w.recentStart).subtract(1, "day").format("YYYY-MM-DD");
  return { total: days.size, recent, prior: first !== null && first <= priorEnd ? prior : null };
}

// ── Most recent PR ────────────────────────────────────────────────────────

export interface LatestPrStat {
  /** The workout title as logged, e.g. "Back Squat 3RM". */
  title: string;
  /** The score as SugarWOD displays it; may be "". */
  display: string;
  date: string;
  /** Other PRs logged the same day. */
  moreThatDay: number;
  /** PRs in the recent window. */
  recentCount: number;
}

/**
 * The latest PR by SugarWOD's own flag (`pr === "PR"`). This is a deliberate
 * exception to "Progress never reads the PR flag": a PR is a logged fact in the
 * sport's own words, shown here as one, and it feeds no verdict or count in the
 * Progress engine. Several PRs on the latest day: the first in log order is
 * shown (rows are oldest first with CSV order kept within a day).
 */
export function latestPrStat(rows: readonly ParsedRow[], today: string): LatestPrStat | null {
  const w = recentWindow(today);
  const prs = rows.filter((r) => r.raw.pr === "PR" && iso(r) <= today);
  if (prs.length === 0) return null;
  let latest = "";
  for (const r of prs) if (iso(r) > latest) latest = iso(r);
  const sameDay = prs.filter((r) => iso(r) === latest);
  const shown = sameDay[0]!;
  return {
    title: shown.raw.title,
    display: shown.raw.best_result_display ?? "",
    date: latest,
    moreThatDay: sameDay.length - 1,
    recentCount: prs.filter((r) => iso(r) >= w.recentStart).length,
  };
}

// ── Body weight ───────────────────────────────────────────────────────────

/** A change in body weight: a signed number of pounds, or within the noise band. */
export type WeightChange = { kind: "change"; lb: number } | { kind: "within" };

export interface BodyWeightStat {
  latestLb: number;
  latestDate: string;
  readings: number;
  /** From the last reading on or before the window's start to the latest. Null without a reading that old, or none inside the window. */
  recent: WeightChange | null;
  /** From the first reading to the latest. Null with a single reading. */
  sinceFirst: WeightChange | null;
}

function weightChange(fromLb: number, toLb: number, bandLb: number): WeightChange {
  const lb = toLb - fromLb;
  return Math.abs(lb) <= bandLb ? { kind: "within" } : { kind: "change", lb };
}

/**
 * Latest body weight from the pooled series (scans and weigh-ins, oldest
 * first), with its change over the recent window and since the first reading.
 * A change no bigger than the noise band reads "within normal scan
 * variation", the same rule the Insights views use, so no line rests on sign
 * alone. Weight only: it is the one body measurement with a band.
 */
export function bodyWeightStat(readings: readonly BodyReading[], bandLb: number, today: string): BodyWeightStat | null {
  const series = readings.filter((r) => r.date <= today);
  const latest = series.at(-1);
  if (!latest) return null;
  const first = series[0]!;
  const w = recentWindow(today);
  const baseline = [...series].reverse().find((r) => r.date <= w.recentStart);
  const recent =
    baseline && baseline !== latest && latest.date >= w.recentStart ? weightChange(baseline.weightLb, latest.weightLb, bandLb) : null;
  return {
    latestLb: latest.weightLb,
    latestDate: latest.date,
    readings: series.length,
    recent,
    sinceFirst: series.length > 1 ? weightChange(first.weightLb, latest.weightLb, bandLb) : null,
  };
}

const lbText = (x: number): string => String(Number(x.toFixed(1)));

/** "−2.1 lb in 90 days", "Within normal scan variation over 90 days". */
export function weightChangeText(change: WeightChange, span: "recent" | "sinceFirst"): string {
  const tail = span === "recent" ? `${OVERVIEW_RECENT_DAYS} days` : "first reading";
  if (change.kind === "within") return span === "recent" ? `Within normal scan variation over ${tail}` : `Within normal scan variation since ${tail}`;
  const signed = `${change.lb >= 0 ? "+" : MINUS}${lbText(Math.abs(change.lb))} lb`;
  return span === "recent" ? `${signed} in ${tail}` : `${signed} since ${tail}`;
}

export function weightText(lb: number): string {
  return `${lbText(lb)} lb`;
}

// ── Progress ──────────────────────────────────────────────────────────────

export interface ProgressStat {
  /** "Improving", "Steady", "Declining", or "No headline yet". */
  value: string;
  lines: string[];
}

/**
 * The Progress headline as computed by Progress itself (`classifySubjects`),
 * restated in two short lines: the count that earned the label, then the rest.
 * Body weight never feeds it.
 */
export function progressStat(h: ProgressHeadline): ProgressStat {
  if (!h.label) {
    return { value: "No headline yet", lines: [noHeadlineText(h).replace(/^No headline yet: n/, "N")] };
  }
  const n = h.counted;
  const lifts = `${n} ${n === 1 ? "lift or benchmark" : "lifts and benchmarks"}`;
  const rest = (parts: [number, string][]) =>
    parts.filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(", ");
  if (h.label === "Improving") {
    const others = rest([[h.noClearChange, "no clear change"], [h.down, "down"]]);
    return { value: "Improving", lines: [`Up in ${h.up} of ${lifts}`, ...(others ? [others] : [])] };
  }
  if (h.label === "Declining") {
    const others = rest([[h.noClearChange, "no clear change"], [h.up, "up"]]);
    return { value: "Declining", lines: [`Down in ${h.down} of ${lifts}`, ...(others ? [others] : [])] };
  }
  return { value: "Steady", lines: [`Across ${lifts}`, rest([[h.up, "up"], [h.noClearChange, "no clear change"], [h.down, "down"]])] };
}

// ── Training panel ────────────────────────────────────────────────────────

/** The Training panel's chart span in calendar months, ending with the current one. */
export const OVERVIEW_CHART_MONTHS = 12;

export interface MonthDays {
  /** YYYY-MM */
  month: string;
  days: number;
  /** The current month, still under way. */
  partial: boolean;
}

/**
 * Days trained per calendar month over the last 12 months, ending with the
 * current (partial) month. Bars start at the first logged month when the log is
 * younger than that, so no empty months are drawn before training began. The
 * month comes from each row's date, not `ParsedRow.bucket`, which follows the
 * athlete's chosen grouping.
 */
export function monthlyDaysTrained(rows: readonly ParsedRow[], today: string): MonthDays[] {
  const current = dayjs(today).startOf("month");
  const earliest = current.subtract(OVERVIEW_CHART_MONTHS - 1, "month");
  const daysByMonth = new Map<string, Set<string>>();
  let first: string | null = null;
  for (const r of rows) {
    const d = iso(r);
    if (d > today) continue;
    if (first === null || d < first) first = d;
    const m = d.slice(0, 7);
    if (!daysByMonth.has(m)) daysByMonth.set(m, new Set());
    daysByMonth.get(m)!.add(d);
  }
  if (first === null) return [];
  let start = dayjs(first).startOf("month");
  if (start.isBefore(earliest)) start = earliest;
  const out: MonthDays[] = [];
  for (let m = start; !m.isAfter(current); m = m.add(1, "month")) {
    const key = m.format("YYYY-MM");
    out.push({ month: key, days: daysByMonth.get(key)?.size ?? 0, partial: m.isSame(current) });
  }
  return out;
}

export interface WindowMix {
  /** The window's M/W/G split, summing to 100 (largest-remainder rounding, as everywhere else). */
  split: ModalitySplit;
  /** Classified workouts in the window; unclassified ones are excluded, never counted as zeroes. */
  workouts: number;
}

export interface TrainingMix {
  recent: WindowMix | null;
  prior: WindowMix | null;
  /** Up to three GPP domains tagged on the most workouts in the recent window, most first. */
  mostTrained: Domain[];
}

function windowMix(rows: readonly ParsedRow[]): WindowMix | null {
  const weights: Record<Modality, number> = { M: 0, W: 0, G: 0 };
  let workouts = 0;
  for (const r of rows) {
    const c = classifyMovements(r.movements);
    if (!c.classified) continue;
    workouts++;
    for (const m of MODALITY_LIST) weights[m] += c.split[m];
  }
  if (workouts === 0) return null;
  return { split: sharesTo100(weights, MODALITY_LIST.reduce((n, m) => n + weights[m], 0)), workouts };
}

/**
 * What the recent window was made of: its M/W/G split beside the window
 * before, built the same way the modality stack is (each workout's split
 * summed, then normalised to 100), and the three most-trained domains. Least
 * trained is left out on purpose for now (docs/overview.md).
 */
export function trainingMix(rows: readonly ParsedRow[], today: string): TrainingMix {
  const w = recentWindow(today);
  const recentRows = rows.filter((r) => iso(r) >= w.recentStart && iso(r) <= today);
  const priorRows = rows.filter((r) => iso(r) >= w.priorStart && iso(r) < w.recentStart);
  const counts = new Map<Domain, number>();
  for (const r of recentRows) for (const d of r.domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  const mostTrained = DOMAIN_LIST.filter((d) => (counts.get(d) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, 3);
  return { recent: windowMix(recentRows), prior: windowMix(priorRows), mostTrained };
}

// ── Insights panel ────────────────────────────────────────────────────────

/** Most rows the Insights panel lists. */
export const OVERVIEW_MOVED_MAX = 5;

/**
 * The lifts and benchmarks Progress calls up or down (a move up to RX is in
 * "up", as on Progress), most recently logged first, at most five.
 */
export function whatMoved(rows: readonly ProgressRow[]): ProgressRow[] {
  return rows
    .filter((r) => r.group === "up" || r.group === "down")
    .sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0))
    .slice(0, OVERVIEW_MOVED_MAX);
}

export interface LatestEntry {
  entry: TimelineEntry;
  /** Other entries ongoing today besides this one. */
  moreOngoing: number;
}

/**
 * The Timeline entry to show: the ongoing one that started most recently, else
 * the one that ended most recently. Entries starting after today are ignored.
 */
export function latestTimelineEntry(entries: readonly TimelineEntry[], today: string): LatestEntry | null {
  const started = entries.filter((e) => e.startDate <= today);
  const ongoing = started.filter((e) => e.endDate === null || e.endDate >= today);
  if (ongoing.length) {
    const entry = [...ongoing].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0]!;
    return { entry, moreOngoing: ongoing.length - 1 };
  }
  const ended = [...started].sort((a, b) => ((a.endDate ?? "") < (b.endDate ?? "") ? 1 : -1))[0];
  return ended ? { entry: ended, moreOngoing: 0 } : null;
}
