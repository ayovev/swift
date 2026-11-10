import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, NUM_AXIS_WIDTH, niceAxisTicks } from "./chartUtils";
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

/** "181.0 lb", "15.1%", "26.0": a space before a word unit, none before a percent sign. */
export function withUnit(value: string, unit: string): string {
  if (!unit) return value;
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
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
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(worst - pad, best + pad);
  const last = rows[rows.length - 1]!;
  const latest = last.value;
  // Each point is the average of the scans in its bucket (buildBodyCompData), so the header says so: "latest 181.0" beside
  // Overview's "180.9 lb" (the latest single reading) read as two answers to one question.
  const headline = `${last.label} average ${withUnit(latest.toFixed(1), unit)}`;
  const config: ChartConfig = { value: { label: seriesLabel, color: "var(--primary)" } };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{seriesLabel}</h3>
        <span className="text-xs text-muted-foreground tabular">{headline}</span>
      </div>
      <ChartContainer
        config={config}
        className="h-[200px] w-full min-w-0"
        role="img"
        aria-label={`${seriesLabel} over time, ${granularityLabel(granularity).toLowerCase()} by ${granularityLabel(granularity).toLowerCase()}, ${headline}`}
      >
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            interval={bucketTickInterval(rows.length)}
            padding={{ left: 12, right: 12 }}
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
            tickFormatter={(v: number) => withUnit(String(v), unit)}
            {...AXIS_PROPS}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="font-medium tabular">{withUnit(Number(value).toFixed(1), unit)}</span>
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
