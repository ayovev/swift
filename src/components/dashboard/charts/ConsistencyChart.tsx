import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, AXIS_TICK_COUNT, NUM_AXIS_WIDTH, niceAxisTicks } from "./chartUtils";
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
  className?: string;
}

/** Bar-chart frequency over time — how many `count` per bucket. */
export function ConsistencyChart({
  buckets,
  granularity,
  seriesLabel = "Workouts",
  className = "h-[260px] w-full min-w-0",
}: ConsistencyChartProps) {
  const data = buckets.map((b) => ({ ...b, label: formatBucketLabel(b.bucket, granularity) }));
  const noun = GRANULARITY_NOUN[granularity];
  const best = Math.max(1, ...data.map((d) => d.count));
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(0, best, AXIS_TICK_COUNT, true);
  const config: ChartConfig = { count: { label: seriesLabel, color: "var(--primary)" } };

  return (
    <ChartContainer
      config={config}
      className={className}
      role="img"
      aria-label={`Bar chart of ${seriesLabel.toLowerCase()} per ${noun} across ${buckets.length} ${noun}s`}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={bucketTickInterval(data.length)} {...AXIS_PROPS} />
        <YAxis
          width={NUM_AXIS_WIDTH}
          domain={yDomain}
          ticks={yTicks}
          interval={0} // see niceAxisTicks() in chartUtils.ts for why
          {...AXIS_PROPS}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
