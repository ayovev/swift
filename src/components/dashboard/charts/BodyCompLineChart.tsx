import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, NUM_AXIS_WIDTH } from "./chartUtils";
import {
  bucketTickInterval,
  formatBucketLabel,
  granularityLabel,
  type Granularity,
} from "@/lib/analytics/granularity";

interface BodyCompLineChartProps {
  data: { bucket: string; value: number | null }[];
  seriesLabel: string;
  /** e.g. "lb" or "%" — appended to axis ticks and the tooltip value. */
  unit: string;
  granularity: Granularity;
}

/**
 * One body-composition metric's trend over time — small multiples, one chart
 * per metric, same reasoning as LiftGrid: weight, body fat %, and skeletal
 * muscle mass live on incomparable scales, so one shared axis would flatten
 * whichever metric has the smaller range. Each chart auto-scales to its own
 * data instead.
 *
 * A bucket a scan didn't measure is `null`, not zero (buildBodyCompData
 * already excludes it from the average); `connectNulls={false}` draws a gap
 * there instead of a false zero dip.
 */
export function BodyCompLineChart({ data, seriesLabel, unit, granularity }: BodyCompLineChartProps) {
  const rows = data
    .filter((d): d is { bucket: string; value: number } => d.value !== null)
    .map((d) => ({ ...d, label: formatBucketLabel(d.bucket, granularity) }));

  if (rows.length < 2) return null;

  const best = Math.max(...rows.map((r) => r.value));
  const worst = Math.min(...rows.map((r) => r.value));
  const pad = Math.max(1, (best - worst) * 0.15);
  const latest = rows[rows.length - 1]!.value;
  const config: ChartConfig = { value: { label: seriesLabel, color: "var(--primary)" } };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{seriesLabel}</h3>
        <span className="text-xs text-muted-foreground tabular">
          latest {latest.toFixed(1)}
          {unit}
        </span>
      </div>
      <ChartContainer
        config={config}
        className="h-[200px] w-full min-w-0"
        role="img"
        aria-label={`${seriesLabel} over time, ${granularityLabel(granularity).toLowerCase()} by ${granularityLabel(granularity).toLowerCase()}, latest ${latest.toFixed(1)}${unit}`}
      >
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            interval={bucketTickInterval(rows.length)}
            padding={{ left: 12, right: 12 }}
            {...AXIS_PROPS}
          />
          <YAxis
            width={NUM_AXIS_WIDTH}
            domain={[Math.floor(worst - pad), Math.ceil(best + pad)]}
            tickFormatter={(v: number) => `${v}${unit}`}
            {...AXIS_PROPS}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="label"
                formatter={(value) => (
                  <span className="font-medium tabular">
                    {Number(value).toFixed(1)}
                    {unit}
                  </span>
                )}
              />
            }
          />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--primary)" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
