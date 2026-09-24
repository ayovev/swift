import { useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AXIS_PROPS, PCT_AXIS_WIDTH, niceAxisTicks } from "./chartUtils";
import { bucketTickInterval, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";

const DIMMED_OPACITY = 0.2;
const DIM_TRANSITION = { transition: "fill-opacity 150ms" } as const;

interface StackedShareChartProps {
  data: Record<string, string | number>[];
  /** Series keys, drawn bottom to top. */
  keys: readonly string[];
  config: ChartConfig;
  label: string;
  granularity: Granularity;
  className?: string;
  /**
   * "area" reads as a continuous trend (the 10-domain mix); "bar" reads as
   * discrete per-bucket composition (the M/W/G mix) — same normalized-stack
   * data and axes either way, just the mark. Defaults to "area" since that's
   * the more common caller.
   */
  variant?: "area" | "bar";
}

/**
 * Normalized stacked area/bar — each bucket sums to 100%, so the chart
 * answers "what share of my training was this?" rather than "how much did I
 * do?". Used for both the 10-domain mix (area) and the M/W/G mix (bar).
 * ComposedChart lets both variants share one set of axes/tooltip/legend
 * rather than duplicating that setup per geometry.
 */
export function StackedShareChart({
  data,
  keys,
  config,
  label,
  granularity,
  className = "h-[300px] w-full min-w-0",
  variant = "area",
}: StackedShareChartProps) {
  const rows = data.map((d) => ({ ...d, label: formatBucketLabel(String(d.bucket), granularity) }));
  // stackOffset="expand" always normalizes each bucket to sum to exactly 1.
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(0, 1);
  const lastKey = keys[keys.length - 1];
  // Series hovered in the legend; every other series dims while it's set.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const dimmed = (key: string) => activeKey !== null && activeKey !== key;

  return (
    <ChartContainer config={config} className={className} role="img" aria-label={label}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="expand">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={bucketTickInterval(rows.length)} {...AXIS_PROPS} />
        <YAxis
          width={PCT_AXIS_WIDTH}
          domain={yDomain}
          ticks={yTicks}
          interval={0} // see niceAxisTicks() in chartUtils.ts for why
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          {...AXIS_PROPS}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-muted-foreground">{config[name as string]?.label ?? name}</span>
              <span className="font-medium tabular">{Number(value).toFixed(1)}%</span>
            </div>
          )} />}
        />
        {keys.map((key) =>
          variant === "bar" ? (
            <Bar
              key={key}
              dataKey={key}
              stackId="share"
              fill={`var(--color-${key})`}
              fillOpacity={dimmed(key) ? DIMMED_OPACITY : 1}
              style={DIM_TRANSITION}
              {...(key === lastKey ? { radius: [3, 3, 0, 0] as [number, number, number, number] } : {})}
            />
          ) : (
            <Area
              key={key}
              dataKey={key}
              type="monotone"
              stackId="share"
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={dimmed(key) ? DIMMED_OPACITY : 0.85}
              style={DIM_TRANSITION}
              strokeWidth={0}
            />
          )
        )}
        <ChartLegend content={<ChartLegendContent className="flex-wrap" onActiveKeyChange={setActiveKey} />} />
      </ComposedChart>
    </ChartContainer>
  );
}
