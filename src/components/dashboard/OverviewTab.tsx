import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BenchmarkCards } from "./charts/BenchmarkCards";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { LiftGrid } from "./charts/LiftChart";
import { PrTimeline } from "./charts/PrTimeline";
import { StackedShareChart } from "./charts/StackedShareChart";
import { DOMAIN_CHART_CONFIG, MODALITY_CHART_CONFIG } from "./charts/chartUtils";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";
import type { Insights } from "@/lib/analytics/buildInsights";

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular sm:text-3xl">{value}</span>
      <span className="text-sm font-medium">{label}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

/** The Overview tab (FR-4.1–4.6). */
export function OverviewTab({ insights }: { insights: Insights }) {
  const { dashboard, modality } = insights;
  const { summary } = dashboard;

  const rxShare =
    summary.rx_count + summary.scaled_count > 0
      ? (summary.rx_count / (summary.rx_count + summary.scaled_count)) * 100
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid grid-cols-2 gap-6 pt-6 sm:grid-cols-4">
          <Stat
            value={summary.total_logged.toLocaleString()}
            label="workouts logged"
            sub={`${summary.avg_per_month.toFixed(1)} a month on average`}
          />
          <Stat value={summary.total_prs.toLocaleString()} label="personal records" />
          <Stat value={`${rxShare.toFixed(0)}%`} label="as prescribed" sub={`${summary.scaled_count.toLocaleString()} scaled`} />
          <Stat
            value={String(dashboard.monthly.length)}
            label="months of training"
            sub="every one of them counted"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Showing up</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyChart monthly={dashboard.monthly} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Where your training went</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              The ten general physical skills as a share of each month's training.
            </p>
            <StackedShareChart
              data={dashboard.stacked.monthly_shares}
              keys={DOMAIN_LIST}
              config={DOMAIN_CHART_CONFIG}
              label="Normalized stacked area chart of the ten physical skills over time"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cardio, weights, gymnastics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              How each month split across the three CrossFit modalities.
            </p>
            <StackedShareChart
              data={modality.modality_stacked.monthly_shares as unknown as Record<string, string | number>[]}
              keys={MODALITY_LIST}
              config={MODALITY_CHART_CONFIG}
              label="Normalized stacked area chart of metabolic, weightlifting and gymnastics work over time"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">What got heavier</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-sm text-muted-foreground">
            Each point is one logged effort. Rep schemes differ between sessions, so hover to see
            whether a number was a heavy single or the top of a set.
          </p>
          <LiftGrid lifts={dashboard.lifts} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Benchmarks, revisited</CardTitle>
          </CardHeader>
          <CardContent>
            <BenchmarkCards benchmarks={dashboard.benchmarks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Personal records</CardTitle>
          </CardHeader>
          <CardContent>
            <PrTimeline prs={dashboard.pr_timeline} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
