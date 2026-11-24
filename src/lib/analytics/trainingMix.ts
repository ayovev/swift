import dayjs from "dayjs";
import { buildFromParsedRows, type ParsedRow } from "./buildDashboardData";
import { buildModalityData } from "./buildModalityData";
import { buildMovementData, buildMovementOptions } from "./buildMovementData";
import { monthlyDaysTrained, monthlyModalityMix, type MonthDays, type MonthMix } from "./overview";
import { sharesTo100 } from "@/lib/classify/classifyModality";
import { DOMAIN_LIST, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, type ModalitySplit } from "@/types/modality";

/**
 * Everything the Training mix report prints (docs/reports.md), for a period, from the rows Overview and every other view already parsed
 * (`Insights.allRows`): no second `parseRows()`, and nothing classified again. The period filters those rows once, then the same builders
 * the Training views use run over the result, so a number here is the number the matching Training view shows for that range.
 *
 * The two shapes stay apart, as everywhere else (CLAUDE.md, "Architecture: classify → analytics → components"): the ten domains are
 * independent tags that add up to well over 100%, and the three modalities are one workout's split, which adds to 100.
 * Dates are passed in, never read from the clock.
 */
export interface DomainShare {
  domain: Domain;
  /** Workouts in the period touching this domain. */
  count: number;
  /** Share of the period's workouts, 0 to 100. Shares overlap, so they do not sum to 100. */
  pct: number;
}

export interface MovementShare {
  id: string;
  label: string;
  /** Workouts in the period that include it. */
  count: number;
  pct: number;
}

export interface TrainingMixData {
  start: string | null;
  end: string;
  /** Workouts logged in the period, and the distinct days they fell on. */
  workouts: number;
  days: number;
  /** One entry per calendar month from the period's first workout to its end, so no empty months are drawn before training began. */
  months: MonthDays[];
  mix: MonthMix[];
  /** The average split of a classified workout, summing to 100; null when no workout was classified. */
  split: ModalitySplit | null;
  classified: number;
  /** Workouts in the period with no recognized movement, outside the M/W/G split. Said once, never drawn. */
  unclassified: number;
  /** All ten domains, most-touched first. */
  domains: DomainShare[];
  /** The most-used single movements, most first, at most `TOP_MOVEMENTS`. */
  movements: MovementShare[];
  /** The newest workout on or before the end, from the whole log, for the footer's basis. */
  lastLogged: string | null;
}

export const TOP_MOVEMENTS = 10;

const day = (r: ParsedRow): string => r.dateParsed.format("YYYY-MM-DD");

export function buildTrainingMix(allRows: readonly ParsedRow[], start: string | null, end: string): TrainingMixData {
  let lastLogged: string | null = null;
  const inPeriod: ParsedRow[] = [];
  for (const r of allRows) {
    const d = day(r);
    if (d > end) continue;
    if (lastLogged === null || d > lastLogged) lastLogged = d;
    if (start === null || d >= start) inPeriod.push(r);
  }

  const dashboard = buildFromParsedRows(inPeriod);
  const modality = buildModalityData(inPeriod);
  const first = inPeriod.length ? day(inPeriod[0]!) : null;

  // The months the period spans, from its first workout to its end; the first and last are marked partial when the period cuts them.
  const span = first ? dayjs(end).startOf("month").diff(dayjs(first).startOf("month"), "month") + 1 : 0;
  const rawMonths = span > 0 ? monthlyDaysTrained(inPeriod, end, span) : [];
  const rawMix = span > 0 ? monthlyModalityMix(inPeriod, end, span) : [];
  const cutStart = start !== null && start.slice(8) !== "01";
  const cutEnd = end !== dayjs(end).endOf("month").format("YYYY-MM-DD");
  const partialOf = (i: number, n: number): boolean => (i === 0 && cutStart) || (i === n - 1 && cutEnd);
  const months = rawMonths.map((m, i) => ({ ...m, partial: partialOf(i, rawMonths.length) }));
  const mix = rawMix.map((m, i) => ({ ...m, partial: partialOf(i, rawMix.length) }));

  const weights = Object.fromEntries(MODALITY_LIST.map((m) => [m, modality.modality_overall[m].avg_share])) as Record<(typeof MODALITY_LIST)[number], number>;
  const total = MODALITY_LIST.reduce((n, m) => n + weights[m], 0);

  const options = buildMovementOptions(buildMovementData(inPeriod)).movements;
  const workouts = dashboard.summary.total_logged;

  return {
    start,
    end,
    workouts,
    days: dashboard.summary.unique_days,
    months,
    mix,
    split: modality.classified_count > 0 ? sharesTo100(weights, total) : null,
    classified: modality.classified_count,
    unclassified: modality.unclassified_count,
    domains: DOMAIN_LIST.map((domain) => ({ domain, count: dashboard.overall[domain].count, pct: dashboard.overall[domain].pct })).sort(
      (a, b) => b.pct - a.pct || DOMAIN_LIST.indexOf(a.domain) - DOMAIN_LIST.indexOf(b.domain)
    ),
    movements: [...options]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, TOP_MOVEMENTS)
      .map((o) => ({ id: o.id, label: o.label, count: o.count, pct: workouts > 0 ? Math.round((o.count / workouts) * 1000) / 10 : 0 })),
    lastLogged,
  };
}
