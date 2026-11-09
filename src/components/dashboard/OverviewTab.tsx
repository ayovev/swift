import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { StackedShareChart } from "./charts/StackedShareChart";
import { DOMAIN_CHART_CONFIG, MODALITY_FIXED_CHART_CONFIG } from "./charts/chartUtils";
import { GRANULARITY_NOUN, type Granularity } from "@/lib/analytics/granularity";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";
import type { Insights } from "@/lib/analytics/buildInsights";

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 py-6 pr-6 sm:[&:not(:first-child)]:pl-6">
      <span className="font-mono text-3xl font-medium tracking-tight tabular sm:text-[44px] sm:leading-none">
        {value}
      </span>
      <span className="mt-1 text-sm">{label}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

/**
 * The Overview tab. Being redesigned as the full-history front door, in the
 * steps listed in docs/overview.md; the lift, benchmark and PR cards have
 * already moved to Training → Lifts (LiftHistoryTab).
 */
export function OverviewTab({
  insights,
  granularity,
}: {
  insights: Insights;
  granularity: Granularity;
}) {
  const { dashboard, modality } = insights;
  const { summary } = dashboard;
  const noun = GRANULARITY_NOUN[granularity];

  const rxShare =
    summary.rx_count + summary.scaled_count > 0
      ? (summary.rx_count / (summary.rx_count + summary.scaled_count)) * 100
      : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Totals read as a ruled row rather than a card: they're the page's
          headline, not one panel among several. */}
      <section
        aria-label="Totals"
        className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border"
      >
        <Stat
          value={summary.total_logged.toLocaleString()}
          label="workouts logged"
          sub={`${summary.avg_per_bucket.toFixed(1)} a ${noun} on average`}
        />
        <Stat
          value={summary.unique_days.toLocaleString()}
          label="days trained"
          {...(granularity !== "daily"
            ? { sub: `${summary.avg_days_per_bucket.toFixed(1)} a ${noun} on average` }
            : {})}
        />
        <Stat value={summary.total_prs.toLocaleString()} label="personal records" />
        <Stat value={`${rxShare.toFixed(0)}%`} label="as prescribed" sub={`${summary.scaled_count.toLocaleString()} scaled`} />
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
