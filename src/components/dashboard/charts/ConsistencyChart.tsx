import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AXIS_PROPS, AXIS_TICK_COUNT, NUM_AXIS_WIDTH, mergeBucketCounts, niceAxisTicks } from "./chartUtils";
import {
  bucketTickInterval,
  formatBucketLabel,
  GRANULARITY_NOUN,
  type Granularity,
} from "@/lib/analytics/granularity";
import type { BucketCount } from "@/types/dashboard";

interface ConsistencyChartProps {
  buckets: BucketCount[];
  granularity: Granularity;
  /**
   * Tooltip/aria wording for the bar series — defaults to "Workouts" for the
   * Overview "Showing up" chart; the Body Comp tab's training-days-during-
   * your-scan-history chart passes "Days trained" so its count reads as days,
   * not raw workout rows.
   */
  seriesLabel?: string;
  /**
   * An optional second series sharing `buckets`' bucket keys — draws a
   * grouped (not stacked) second bar per bucket alongside the first. Omit it
   * to get today's single-bar chart, which is what the Body Comp tab still
   * does, and what the Overview tab does at daily granularity (see
   * OverviewTab.tsx — a per-day "days attended" count is always 1 or 0, so
   * showing it alongside the workout count would be meaningless there).
   */
  secondaryBuckets?: BucketCount[];
  secondaryLabel?: string;
  className?: string;
}

/** Bar-chart frequency over time — how many `count` (and optionally a second series) per bucket. */
export function ConsistencyChart({
  buckets,
  granularity,
  seriesLabel = "Workouts",
  secondaryBuckets,
  secondaryLabel = "Days trained",
  className = "h-[260px] w-full min-w-0",
}: ConsistencyChartProps) {
  const noun = GRANULARITY_NOUN[granularity];
  const dual = secondaryBuckets !== undefined;
  // Series hovered in the legend; the other series dims while it's set.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const barOpacity = (key: string) => (activeKey !== null && activeKey !== key ? 0.2 : 1);
  const barStyle = { transition: "fill-opacity 150ms" } as const;

  const merged = dual ? mergeBucketCounts(buckets, secondaryBuckets) : null;
  const data = (merged ?? buckets).map((b) => ({
    ...b,
    label: formatBucketLabel(b.bucket, granularity),
  }));

  const best = Math.max(
    1,
    ...buckets.map((b) => b.count),
    ...(dual ? secondaryBuckets.map((b) => b.count) : [])
  );
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(0, best, AXIS_TICK_COUNT, true);

  const config: ChartConfig = {
    count: { label: seriesLabel, color: "var(--primary)" },
    ...(dual ? { secondaryCount: { label: secondaryLabel, color: "var(--muted-foreground)" } } : {}),
  };

  const ariaLabel = dual
    ? `Grouped bar chart of ${seriesLabel.toLowerCase()} and ${secondaryLabel.toLowerCase()} per ${noun} across ${buckets.length} ${noun}s`
    : `Bar chart of ${seriesLabel.toLowerCase()} per ${noun} across ${buckets.length} ${noun}s`;

  return (
    <ChartContainer config={config} className={className} role="img" aria-label={ariaLabel}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          interval={bucketTickInterval(data.length)}
          angle={-35}
          textAnchor="end"
          height={50}
          {...AXIS_PROPS}
        />
        <YAxis
          width={NUM_AXIS_WIDTH}
          domain={yDomain}
          ticks={yTicks}
          interval={0} // see niceAxisTicks() in chartUtils.ts for why
          {...AXIS_PROPS}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="count"
          fill="var(--primary)"
          fillOpacity={barOpacity("count")}
          style={barStyle}
          radius={[3, 3, 0, 0]}
        />
        {dual ? (
          <Bar
            dataKey="secondaryCount"
            fill="var(--muted-foreground)"
            fillOpacity={barOpacity("secondaryCount")}
            style={barStyle}
            radius={[3, 3, 0, 0]}
          />
        ) : null}
        {dual ? <ChartLegend content={<ChartLegendContent onActiveKeyChange={setActiveKey} />} /> : null}
      </BarChart>
    </ChartContainer>
  );
}
