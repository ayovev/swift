import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, PCT_AXIS_WIDTH } from "./chartUtils";
import { bucketTickInterval, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";

interface ShareAreaChartProps {
  data: { bucket: string; value: number }[];
  color: string;
  label: string;
  /** Tooltip/axis wording — domains count workouts, modalities average shares. */
  seriesLabel: string;
  granularity: Granularity;
}

/**
 * A single series' share of training over time — the per-domain and
 * per-modality chart.
 *
 * The Y axis is auto-scaled to the data, not fixed at 0–100: Flexibility
 * rarely exceeds a few percent, and a fixed domain renders it as a flat line
 * along the axis that says nothing.
 */
export function ShareAreaChart({ data, color, label, seriesLabel, granularity }: ShareAreaChartProps) {
  const rows = data.map((d) => ({ ...d, label: formatBucketLabel(d.bucket, granularity) }));
  const peak = Math.max(10, ...rows.map((r) => r.value));
  const config: ChartConfig = { value: { label: seriesLabel, color } };

  return (
    <ChartContainer config={config} className="h-[260px] w-full min-w-0" role="img" aria-label={label}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${seriesLabel.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={bucketTickInterval(rows.length)} {...AXIS_PROPS} />
        <YAxis
          width={PCT_AXIS_WIDTH}
          domain={[0, Math.ceil(peak / 10) * 10]}
          tickFormatter={(v: number) => `${v}%`}
          {...AXIS_PROPS}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="label"
              formatter={(value) => (
                <span className="font-medium tabular">{Number(value).toFixed(1)}%</span>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke={color}
          strokeWidth={2}
          fill={`url(#fill-${seriesLabel.replace(/\W/g, "")})`}
        />
      </AreaChart>
    </ChartContainer>
  );
}
