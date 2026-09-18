import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BenchmarkCards } from "./charts/BenchmarkCards";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { LiftGrid, type RepMaxColorMode, type RepMaxFilter } from "./charts/LiftChart";
import { PrTimeline } from "./charts/PrTimeline";
import { RepMaxPrTable } from "./charts/RepMaxPrTable";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { StackedShareChart } from "./charts/StackedShareChart";
import {
  DOMAIN_CHART_CONFIG,
  FIXED_REPMAX_COLORS,
  MODALITY_CHART_CONFIG,
  REP_MAX_CATEGORY_ORDER,
  accentRepMaxColors,
} from "./charts/chartUtils";
import { GRANULARITY_NOUN, type Granularity } from "@/lib/analytics/granularity";
import { getSwatch } from "@/lib/theme/palette";
import { useTheme } from "@/lib/theme/useTheme";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";
import type { Insights } from "@/lib/analytics/buildInsights";

const REP_MAX_CATEGORY_LABELS = {
  "1RM": "1-rep max",
  "2RM": "2-rep max",
  "3RM": "3-rep max",
  "5RM": "5-rep max",
} as const;

const REP_MAX_FILTER_OPTIONS: readonly SegmentedControlOption<RepMaxFilter>[] = [
  { id: "all", label: "All" },
  ...REP_MAX_CATEGORY_ORDER.map((category) => ({ id: category, label: category })),
];

const REP_MAX_COLOR_MODE_OPTIONS: readonly SegmentedControlOption<RepMaxColorMode>[] = [
  { id: "fixed", label: "Fixed colors" },
  { id: "accent", label: "Accent-derived" },
];

/**
 * Temporary side-by-side comparison of two rep-max coloring approaches: fixed
 * literal colors vs. colors derived from the athlete's own accent hue. Not a
 * permanent setting — once one wins, this toggle and the losing color path
 * get deleted (see CLAUDE.md's theming section before making a choice final).
 */
function RepMaxLegend({
  colorMode,
  onColorModeChange,
  repMaxFilter,
  onRepMaxFilterChange,
}: {
  colorMode: RepMaxColorMode;
  onColorModeChange: (mode: RepMaxColorMode) => void;
  repMaxFilter: RepMaxFilter;
  onRepMaxFilterChange: (filter: RepMaxFilter) => void;
}) {
  const { accent, resolvedMode } = useTheme();
  const colors = useMemo(
    () =>
      colorMode === "fixed" ? FIXED_REPMAX_COLORS : accentRepMaxColors(getSwatch(accent), resolvedMode),
    [colorMode, accent, resolvedMode]
  );

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={repMaxFilter}
          onChange={onRepMaxFilterChange}
          options={REP_MAX_FILTER_OPTIONS}
          ariaLabel="Filter by rep-max scheme"
        />
        <div className="ml-auto">
          <SegmentedControl
            value={colorMode}
            onChange={onColorModeChange}
            options={REP_MAX_COLOR_MODE_OPTIONS}
            ariaLabel="Rep-max color mode"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {REP_MAX_CATEGORY_ORDER.map((category) => (
          <span key={category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colors[category] }}
            />
            {REP_MAX_CATEGORY_LABELS[category]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: colors.other }}
          />
          other
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rotate-45 bg-muted-foreground" />
          personal record
        </span>
      </div>
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular sm:text-3xl">{value}</span>
      <span className="text-sm font-medium">{label}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

/** The Overview tab. */
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
  const [repMaxColorMode, setRepMaxColorMode] = useState<RepMaxColorMode>("fixed");
  const [repMaxFilter, setRepMaxFilter] = useState<RepMaxFilter>("all");

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
            sub={`${summary.avg_per_bucket.toFixed(1)} a ${noun} on average`}
          />
          <Stat value={summary.total_prs.toLocaleString()} label="personal records" />
          <Stat value={`${rxShare.toFixed(0)}%`} label="as prescribed" sub={`${summary.scaled_count.toLocaleString()} scaled`} />
          <Stat
            value={String(dashboard.buckets.length)}
            label={`${noun}s of training`}
            sub="every one of them counted"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Showing up</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyChart buckets={dashboard.buckets} granularity={granularity} />
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
              config={MODALITY_CHART_CONFIG}
              label="Normalized stacked area chart of metabolic, weightlifting and gymnastics work over time"
              granularity={granularity}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">What got heavier</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Each point is one logged effort, colored by rep scheme; a diamond marks a personal
            record.
          </p>
          <RepMaxPrTable lifts={dashboard.lifts} />
          <RepMaxLegend
            colorMode={repMaxColorMode}
            onColorModeChange={setRepMaxColorMode}
            repMaxFilter={repMaxFilter}
            onRepMaxFilterChange={setRepMaxFilter}
          />
          <LiftGrid lifts={dashboard.lifts} colorMode={repMaxColorMode} repMaxFilter={repMaxFilter} />
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
