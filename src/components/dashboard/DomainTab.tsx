import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareAreaChart } from "./charts/ShareAreaChart";
import { domainColor } from "./charts/chartUtils";
import { TrendStat } from "./TrendStat";
import { WorkoutList } from "./WorkoutList";
import { DOMAIN_BLURBS, type DashboardData, type Domain } from "@/types/dashboard";

/**
 * One GPP domain's tab. A single component drives all ten —
 * the domains differ in data, not in structure.
 */
export function DomainTab({ domain, data }: { domain: Domain; data: DashboardData }) {
  const trend = data.domain_trends[domain];
  const direction = data.trend_direction[domain];
  const overall = data.overall[domain];
  const workouts = data.workout_lists[domain];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{domain}</CardTitle>
        </CardHeader>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Share of training, month by month</CardTitle>
        </CardHeader>
        <CardContent>
          <ShareAreaChart
            data={trend.map((p) => ({ month: p.month, value: p.pct }))}
            color={domainColor(domain)}
            seriesLabel={domain}
            label={`Monthly share of workouts touching ${domain}`}
          />
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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Every workout counted here</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Classified automatically from each workout's name and description. The keyword that
            triggered the match is shown, so you can judge the call yourself.
          </p>
          <WorkoutList
            rows={workouts.map(([date, title, reason]) => ({ date, title, reason }))}
            emptyMessage={`No workouts in this export were classified as ${domain}.`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
