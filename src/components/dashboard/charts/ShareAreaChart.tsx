import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, PCT_AXIS_WIDTH, niceAxisTicks } from "./chartUtils";
import { PickHint, usePointPick } from "./ChartPick";
import { bucketTickInterval, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";

interface ShareAreaChartProps {
  data: { bucket: string; value: number }[];
  color: string;
  label: string;
  /** Tooltip/axis wording — domains count workouts, modalities average shares. */
  seriesLabel: string;
  granularity: Granularity;
  /** The picked bucket's key, marked on the chart (see ChartPick.tsx). */
  selected?: string | null;
  /** Called with a bucket's key when it is clicked, tapped or picked with Enter, and with null to clear. Omit for a chart without picking. */
  onSelect?: (bucket: string | null) => void;
}

/**
 * A single series' share of training over time — the per-domain and
 * per-modality chart.
 *
 * The Y axis is auto-scaled to the data, not fixed at 0–100: Flexibility
 * rarely exceeds a few percent, and a fixed domain renders it as a flat line
 * along the axis that says nothing.
 */
export function ShareAreaChart({ data, color, label, seriesLabel, granularity, selected = null, onSelect }: ShareAreaChartProps) {
  const rows = data.map((d) => ({ ...d, label: formatBucketLabel(d.bucket, granularity) }));
  const peak = Math.max(10, ...rows.map((r) => r.value));
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(0, peak);
  const config: ChartConfig = { value: { label: seriesLabel, color } };
  const { track, onPointerUp, onKeyDown } = usePointPick(onSelect, selected);
  const pickedLabel = selected ? rows.find((r) => r.bucket === selected)?.label : undefined;

  return (
    <div onPointerUp={onPointerUp} onKeyDown={onKeyDown} className={onSelect ? "[&_.recharts-surface]:cursor-pointer" : undefined}>
    <ChartContainer config={config} className="h-[260px] w-full min-w-0" role="img" aria-label={label}>
      <AreaChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={`fill-${seriesLabel.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          interval={bucketTickInterval(rows.length)}
          angle={-35}
          textAnchor="end"
          height={50}
          {...AXIS_PROPS}
        />
        <YAxis
          width={PCT_AXIS_WIDTH}
          domain={yDomain}
          ticks={yTicks}
          interval={0} // see niceAxisTicks() in chartUtils.ts for why
          tickFormatter={(v: number) => `${v}%`}
          {...AXIS_PROPS}
        />
        <ChartTooltip
          content={(props: TooltipContentProps) => {
            // Whatever the tooltip shows is what Enter picks (useKeyboardPick).
            track(props.active ? ((props.payload?.[0]?.payload as (typeof rows)[number] | undefined)?.bucket ?? null) : null);
            return (
              <ChartTooltipContent
                active={props.active}
                payload={props.payload}
                label={props.label}
                formatter={(value) => (
                  <div>
                    <span className="font-medium tabular">{Number(value).toFixed(1)}%</span>
                    {onSelect ? <PickHint /> : null}
                  </div>
                )}
              />
            );
          }}
        />
        {pickedLabel ? <ReferenceLine x={pickedLabel} stroke="var(--foreground)" strokeWidth={1.5} ifOverflow="extendDomain" /> : null}
        <Area
          dataKey="value"
          type="monotone"
          stroke={color}
          strokeWidth={2}
          fill={`url(#fill-${seriesLabel.replace(/\W/g, "")})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
    </div>
  );
}
