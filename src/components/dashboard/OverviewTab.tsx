import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { StackedShareChart } from "./charts/StackedShareChart";
import { DOMAIN_CHART_CONFIG, MODALITY_FIXED_CHART_CONFIG } from "./charts/chartUtils";
import { useMemo } from "react";
import dayjs from "dayjs";
import { GRANULARITY_NOUN, type Granularity } from "@/lib/analytics/granularity";
import { readingsFromInBody, weightBandLb } from "@/lib/analytics/insights/bodyReadings";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import {
  bodyWeightStat,
  daysTrainedStat,
  latestPrStat,
  progressStat,
  shortDate,
  weightChangeText,
  weightText,
} from "@/lib/analytics/overview";
import { pooledReadings, pooledScanRows } from "@/lib/analytics/weighIns";
import { OVERVIEW_RECENT_DAYS } from "@/lib/analytics/insightConfig";
import { cn } from "@/lib/utils";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { WeighIn } from "@/types/weighIn";
import { BODY_COMP_TAB, LIFTS_TAB, LIFT_HISTORY_TAB } from "./tabs";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";
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
 * the most recent PR, body weight and the Progress headline. The panels below
 * are being rebuilt in the next step; until then the remaining charts read the
 * full history too (`insights.overall`), so nothing on the page follows the
 * date range.
 */
export function OverviewTab({
  insights,
  granularity,
  workouts,
  scans = [],
  weighIns = [],
  asOf,
  onNavigate,
}: {
  insights: Insights;
  granularity: Granularity;
  /** The raw log, for the Progress headline (computed exactly as Progress computes it). */
  workouts: readonly SugarWodRow[];
  scans?: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
  /** Opens another view; a stat with a section behind it links there. */
  onNavigate?: (tab: string) => void;
}) {
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);
  const { dashboard, modality } = insights.overall;
  const noun = GRANULARITY_NOUN[granularity];

  const days = useMemo(() => daysTrainedStat(insights.allRows, today), [insights.allRows, today]);
  const pr = useMemo(() => latestPrStat(insights.allRows, today), [insights.allRows, today]);
  const body = useMemo(
    () => bodyWeightStat(pooledReadings(readingsFromInBody(scans), weighIns), weightBandLb(pooledScanRows(scans, weighIns)), today),
    [scans, weighIns, today]
  );
  const progress = useMemo(
    () => progressStat(classifySubjects(buildProgressSubjects(workouts).subjects, today).headline),
    [workouts, today]
  );

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
            lines={["Upload an InBody export or add a weigh-in"]}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Showing up</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyChart
            buckets={dashboard.buckets}
            granularity={granularity}
            {...(granularity !== "daily" ? { secondaryBuckets: dashboard.days_buckets } : {})}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Where your training went</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              The ten general physical skills as a share of each {noun}'s training.
            </p>
            <StackedShareChart
              data={dashboard.stacked.bucket_shares}
              keys={DOMAIN_LIST}
              config={DOMAIN_CHART_CONFIG}
              label="Normalized stacked area chart of the ten physical skills over time"
              granularity={granularity}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cardio, weights, gymnastics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              How each {noun} split across the three CrossFit modalities.
            </p>
            <StackedShareChart
              data={modality.modality_stacked.bucket_shares as unknown as Record<string, string | number>[]}
              keys={MODALITY_LIST}
              config={MODALITY_FIXED_CHART_CONFIG}
              label="Normalized stacked bar chart of metabolic, weightlifting and gymnastics work over time"
              granularity={granularity}
              variant="bar"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
