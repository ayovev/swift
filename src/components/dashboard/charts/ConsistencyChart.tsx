import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AXIS_PROPS, NUM_AXIS_WIDTH } from "./chartUtils";
import {
  bucketTickInterval,
  formatBucketLabel,
  GRANULARITY_NOUN,
  type Granularity,
} from "@/lib/analytics/granularity";
import type { BucketCount } from "@/types/dashboard";

const CONFIG = { count: { label: "Workouts", color: "var(--primary)" } } as const;

/** Workout frequency over time. */
export function ConsistencyChart({
  buckets,
  granularity,
}: {
  buckets: BucketCount[];
  granularity: Granularity;
}) {
  const data = buckets.map((b) => ({ ...b, label: formatBucketLabel(b.bucket, granularity) }));
  const noun = GRANULARITY_NOUN[granularity];

  return (
    <ChartContainer
      config={CONFIG}
      className="h-[260px] w-full min-w-0"
      role="img"
      aria-label={`Bar chart of workouts logged per ${noun} across ${buckets.length} ${noun}s`}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={bucketTickInterval(data.length)} {...AXIS_PROPS} />
        <YAxis allowDecimals={false} width={NUM_AXIS_WIDTH} {...AXIS_PROPS} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
        <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
