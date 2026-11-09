import { useMemo } from "react";
import dayjs from "dayjs";
import { readingsFromInBody, weightBandLb } from "@/lib/analytics/insights/bodyReadings";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import {
  bodyWeightStat,
  daysTrainedStat,
  latestPrStat,
  latestTimelineEntry,
  monthlyDaysTrained,
  monthlyModalityMix,
  progressState,
  progressStat,
  shortDate,
  weightChangeText,
  weightText,
  whatMoved,
  whatMovedEmptyText,
} from "@/lib/analytics/overview";
import { pooledReadings, pooledScanRows } from "@/lib/analytics/weighIns";
import { OVERVIEW_RECENT_DAYS } from "@/lib/analytics/insightConfig";
import { cn } from "@/lib/utils";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { BodyPanel, InsightsPanel, TrainingPanel, bodySourcesCaption } from "./overview/OverviewPanels";
import { BODY_COMP_TAB, LIFTS_TAB, LIFT_HISTORY_TAB, TIMELINE_TAB, WORKOUTS_TAB } from "./tabs";
import type { Insights } from "@/lib/analytics/buildInsights";

/**
 * One stat in the totals row: a large figure, what it is, and up to two muted
 * lines. Numbers set in the large mono face; words (a PR's title, the Progress
 * label) one size down in the sans face, so a long title fits a quarter of
 * the row. With `onOpen` the whole cell is a button into the stat's section.
 */
function Stat({
  value,
  label,
  lines = [],
  numeric = true,
  onOpen,
  openLabel,
}: {
  value: string;
  label: string;
  lines?: string[];
  numeric?: boolean;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "tracking-tight",
          numeric
            ? "font-mono text-3xl font-medium tabular sm:text-[44px] sm:leading-none"
            : "text-2xl leading-tight font-semibold break-words sm:text-[28px]"
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-sm">{label}</span>
      {lines.map((l) => (
        <span key={l} className="text-xs text-muted-foreground">
          {l}
        </span>
      ))}
    </>
  );
  const cell = "flex min-w-0 flex-col gap-1 py-6 pr-6 text-left sm:[&:not(:first-child)]:pl-6";
  if (!onOpen) return <div className={cell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={openLabel}
      className={cn(cell, "transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring")}
    >
      {body}
    </button>
  );
}

/**
 * The Overview tab: where things stand now, from the full history as of today
 * (docs/overview.md). The totals row carries one figure per area: days trained,
 * the most recent PR, body weight and the Progress headline. Below it, three
 * panels (OverviewPanels.tsx), each the evidence for one stat with a link into
 * its section. Nothing on the page follows the date range or the grouping.
 */
export function OverviewTab({
  insights,
  workouts,
  scans = [],
  weighIns = [],
  timeline = [],
  asOf,
  onNavigate,
  onOpenProgressSubject,
}: {
  insights: Insights;
  /** The raw log, for the Progress headline (computed exactly as Progress computes it). */
  workouts: readonly SugarWodRow[];
  scans?: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
  /** Timeline entries, for the latest-entry line. */
  timeline?: readonly TimelineEntry[];
  /** Opens another view; a stat or panel with a section behind it links there. */
  onNavigate?: (tab: string) => void;
  /** Opens one lift or benchmark's row on Progress. */
  onOpenProgressSubject?: (key: string) => void;
}) {
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);

  const days = useMemo(() => daysTrainedStat(insights.allRows, today), [insights.allRows, today]);
  const pr = useMemo(() => latestPrStat(insights.allRows, today), [insights.allRows, today]);
  const readings = useMemo(() => pooledReadings(readingsFromInBody(scans), weighIns).filter((r) => r.date <= today), [scans, weighIns, today]);
  // Name only the sources the line is really drawn from: a weigh-in on a day with
  // a scan is not used (weighIns.ts), so count what survived the pooling.
  const bodySources = useMemo(() => {
    const scanDays = new Set(readingsFromInBody(scans).map((r) => r.date));
    const fromScans = readings.filter((r) => scanDays.has(r.date)).length;
    return bodySourcesCaption(fromScans, readings.length - fromScans);
  }, [readings, scans]);
  const body = useMemo(
    () => bodyWeightStat(readings, weightBandLb(pooledScanRows(scans, weighIns)), today),
    [readings, scans, weighIns, today]
  );
  // Classified once, exactly as Progress does: the headline feeds the totals
  // row and the rows feed "What moved".
  const classified = useMemo(() => classifySubjects(buildProgressSubjects(workouts).subjects, today), [workouts, today]);
  const state = progressState(classified.rows, classified.headline);
  const progress = progressStat(classified.headline, state);
  const moved = useMemo(() => whatMoved(classified.rows), [classified]);
  const months = useMemo(() => monthlyDaysTrained(insights.allRows, today), [insights.allRows, today]);
  const mix = useMemo(() => monthlyModalityMix(insights.allRows, today), [insights.allRows, today]);
  const latestEntry = useMemo(() => latestTimelineEntry(timeline, today), [timeline, today]);
  const go = (tab: string) => (onNavigate ? () => onNavigate(tab) : undefined);

  const open = (tab: string) => (onNavigate ? { onOpen: () => onNavigate(tab) } : {});
  const recent = `the last ${OVERVIEW_RECENT_DAYS} days`;

  return (
    <div className="flex flex-col gap-6">
      {/* Totals read as a ruled row rather than a card: they're the page's
          headline, not one panel among several. */}
      <section
        aria-label="Totals"
        className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border"
      >
        <Stat
          value={days.total.toLocaleString()}
          label="days trained"
          lines={[
            `${days.recent.toLocaleString()} in ${recent}` +
              (days.prior !== null ? ` (${days.prior.toLocaleString()} the ${OVERVIEW_RECENT_DAYS} before)` : ""),
          ]}
        />
        {pr ? (
          <Stat
            value={pr.title || "Untitled"}
            numeric={false}
            label="most recent PR"
            lines={[
              [pr.display, shortDate(pr.date, today)].filter(Boolean).join(" · ") +
                (pr.moreThatDay ? ` and ${pr.moreThatDay} more that day` : ""),
              pr.recentCount
                ? `${pr.recentCount} ${pr.recentCount === 1 ? "PR" : "PRs"} in ${recent}`
                : `None in ${recent}`,
            ]}
            {...open(LIFT_HISTORY_TAB)}
            openLabel="See every PR in Lifts"
          />
        ) : (
          <Stat value="No PRs logged" numeric={false} label="most recent PR" />
        )}
        {body ? (
          <Stat
            value={weightText(body.latestLb)}
            label="body weight"
            lines={
              body.readings === 1
                ? [`Read ${shortDate(body.latestDate, today)}`]
                : [
                    ...(body.recent ? [weightChangeText(body.recent, "recent")] : []),
                    ...(body.sinceFirst ? [weightChangeText(body.sinceFirst, "sinceFirst")] : []),
                  ]
            }
            {...open(BODY_COMP_TAB)}
            openLabel="See body composition"
          />
        ) : (
          <Stat
            value="No body data yet"
            numeric={false}
            label="body weight"
            {...open(BODY_COMP_TAB)}
            openLabel="See body composition"
          />
        )}
        <Stat
          value={progress.value}
          numeric={false}
          label="progress"
          lines={progress.lines}
          {...open(LIFTS_TAB)}
          openLabel="See progress"
        />
      </section>

      <TrainingPanel months={months} mix={mix} onSeeWorkouts={go(WORKOUTS_TAB)} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <InsightsPanel
          moved={moved}
          emptyText={whatMovedEmptyText(state)}
          latest={latestEntry}
          today={today}
          onOpenSubject={onOpenProgressSubject}
          onSeeProgress={go(LIFTS_TAB)}
          onSeeTimeline={go(TIMELINE_TAB)}
        />
        <BodyPanel readings={readings} sources={bodySources} onSeeBody={go(BODY_COMP_TAB)} />
      </div>
    </div>
  );
}
