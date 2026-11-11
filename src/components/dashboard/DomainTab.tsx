import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartViewToggle } from "./charts/ChartTable";
import { DomainStrip } from "./charts/ComparisonStrip";
import { ChartPickNote, scrollToList, useBucketPick } from "./charts/ChartPick";
import { ShareAreaChart } from "./charts/ShareAreaChart";
import { domainColor } from "./charts/chartUtils";
import { TrendStat } from "./TrendStat";
import { WorkoutList } from "./WorkoutList";
import { GRANULARITY_NOUN, granularityLabel, type Granularity } from "@/lib/analytics/granularity";
import { DOMAIN_BLURBS, type DashboardData, type Domain } from "@/types/dashboard";

/**
 * One GPP domain's tab. A single component drives all ten —
 * the domains differ in data, not in structure.
 */
export function DomainTab({
  domain,
  data,
  granularity,
  coverage,
  onOpen = () => {},
  describe,
}: {
  domain: Domain;
  data: DashboardData;
  granularity: Granularity;
  /** The days the data covers (YYYY-MM-DD), so the chart can mark a bucket the range only partly covers. */
  coverage?: { start: string; end: string } | undefined;
  /** Opens another view by its tab id: the comparison strip's bars. Omit to draw the strip without links. */
  onOpen?: ((tab: string) => void) | undefined;
  /** A workout's description by its date and title, so a listed workout opens to it. */
  describe?: ((date: string, title: string) => string | undefined) | undefined;
}) {
  const trend = data.domain_trends[domain];
  const direction = data.trend_direction[domain];
  const overall = data.overall[domain];
  const workouts = data.workout_lists[domain];
  // Picking a month on the chart narrows the list below to it (ChartPick.tsx).
  const { picked, pick, clear, inPicked, label: pickedLabel } = useBucketPick(granularity, `${domain}|${data.summary.total_logged}|${trend.length}`);
  const listRef = useRef<HTMLDivElement>(null);
  const point = picked ? trend.find((p) => p.bucket === picked) : undefined;
  const rows = workouts.map(([date, title, reason]) => ({ date, title, reason, highlight: [reason] }));
  const shown = picked ? rows.filter((r) => inPicked(r.date)) : rows;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {DOMAIN_BLURBS[domain]}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-4">
            <div>
              <span className="text-2xl font-semibold tabular">{overall.pct.toFixed(1)}%</span>
              <span className="ml-2 text-sm text-muted-foreground">of all workouts</span>
            </div>
            <div className="text-sm text-muted-foreground tabular">
              {overall.count.toLocaleString()} of {data.summary.total_logged.toLocaleString()} logged
            </div>
          </div>
          <DomainStrip data={data} current={domain} onOpen={onOpen} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-2">
          <CardTitle className="text-sm font-medium">
            Share of training, {GRANULARITY_NOUN[granularity]} by {GRANULARITY_NOUN[granularity]}
          </CardTitle>
          <ChartViewToggle />
        </CardHeader>
        <CardContent>
          <ShareAreaChart
            data={trend.map((p) => ({ bucket: p.bucket, value: p.pct, total: p.total, basis: `${p.count} of ${p.total} ${p.total === 1 ? "workout" : "workouts"}` }))}
            coverage={coverage}
            color={domainColor(domain)}
            seriesLabel={domain}
            label={`${granularityLabel(granularity)} share of workouts touching ${domain}`}
            granularity={granularity}
            selected={picked}
            onSelect={pick}
          />
          {picked && pickedLabel ? (
            <ChartPickNote
              onClear={clear}
              action={shown.length ? { label: `List ${shown.length === 1 ? "it" : "them"}`, onClick: () => scrollToList(listRef.current) } : undefined}
            >
              <span className="font-medium">{pickedLabel}</span>: {shown.length.toLocaleString()} of {(point?.total ?? 0).toLocaleString()} workouts touched {domain}
            </ChartPickNote>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Then versus now</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendStat
            earlyPct={direction.early_pct}
            latePct={direction.late_pct}
            delta={direction.delta}
            unitLabel={`share of training in ${domain}`}
            halves={data.trend_halves}
          />
        </CardContent>
      </Card>

      <Card ref={listRef}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Every workout counted here</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Classified automatically from each workout's name and description. The keyword that
            triggered the match is shown, so you can judge the call yourself.
          </p>
          <WorkoutList
            rows={shown}
            emptyMessage={picked ? `No workouts in ${pickedLabel} were classified as ${domain}.` : `No workouts in this export were classified as ${domain}.`}
            scope={picked && pickedLabel ? { label: pickedLabel, onClear: clear } : undefined}
            describe={describe}
          />
        </CardContent>
      </Card>
    </div>
  );
}
