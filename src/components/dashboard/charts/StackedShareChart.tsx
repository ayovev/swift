import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AXIS_PROPS, PCT_AXIS_WIDTH, formatMonth, monthTickInterval } from "./chartUtils";

interface StackedShareChartProps {
  data: Record<string, string | number>[];
  /** Series keys, drawn bottom to top. */
  keys: readonly string[];
  config: ChartConfig;
  label: string;
  className?: string;
}

/**
 * Normalized stacked area — each month sums to 100%, so the chart answers
 * "what share of my training was this?" rather than "how much did I do?".
 * Used for both the 10-domain mix and the M/W/G mix.
 */
export function StackedShareChart({
  data,
  keys,
  config,
  label,
  className = "h-[300px] w-full min-w-0",
}: StackedShareChartProps) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(String(d.month)) }));

  return (
    <ChartContainer config={config} className={className} role="img" aria-label={label}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="expand">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={monthTickInterval(rows.length)} {...AXIS_PROPS} />
        <YAxis
          width={PCT_AXIS_WIDTH}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          {...AXIS_PROPS}
        />
        <ChartTooltip
          content={<ChartTooltipContent labelKey="label" formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-muted-foreground">{config[name as string]?.label ?? name}</span>
              <span className="font-medium tabular">{Number(value).toFixed(1)}%</span>
            </div>
          )} />}
        />
        {keys.map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="monotone"
            stackId="share"
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.85}
            strokeWidth={0}
          />
        ))}
        <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
      </AreaChart>
    </ChartContainer>
  );
}
