import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, PCT_AXIS_WIDTH, THIN_BUCKET_WORKOUTS, formatDate, niceAxisTicks } from "./chartUtils";
import { PickHint, usePointPick } from "./ChartPick";
import { DataTable, seriesSummary, useChartView } from "./ChartTable";
import { GRANULARITY_NOUN, bucketBounds, bucketTickInterval, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";

/** One bucket of a share chart: its share, and the workouts behind it. */
export interface SharePoint {
  bucket: string;
  /** The share, 0 to 100. */
  value: number;
  /** Workouts that bucket (the denominator), so a share of 2 and a share of 30 don't look alike. */
  total: number;
  /** The tooltip's line saying what the share is of ("9 of 15 workouts"); the chart supplies none of its own. */
  basis: string;
}

interface ShareAreaChartProps {
  data: SharePoint[];
  color: string;
  label: string;
  /** Tooltip/axis wording — domains count workouts, modalities average shares. */
  seriesLabel: string;
  granularity: Granularity;
  /**
   * The days the chart's data covers (the date range, or the whole log at all time), YYYY-MM-DD. A first or last bucket that reaches
   * past either end is only partly covered and is drawn as such. Omit to draw every bucket as whole.
   */
  coverage?: { start: string; end: string } | undefined;
  /** The picked bucket's key, marked on the chart (see ChartPick.tsx). */
  selected?: string | null;
  /** Called with a bucket's key when it is clicked, tapped or picked with Enter, and with null to clear. Omit for a chart without picking. */
  onSelect?: (bucket: string | null) => void;
}

/**
 * The rows a share chart draws, one per bucket: what kind of bucket it is (thin, partial at either end) and the value each drawn
 * series takes there. `solid` feeds the area and is null for a thin or partial bucket, so the area breaks there; `edge` is a partial
 * bucket and its whole neighbour, for the dashed segment; `thinValue` is a thin bucket's hollow dot; `lone` is a whole bucket with no
 * whole neighbour, which an area can't draw, as a filled dot. Pure, so the rules are tested without a chart.
 */
export function shareRows(data: readonly SharePoint[], granularity: Granularity, coverage?: { start: string; end: string }) {
  const base = data.map((d) => {
    const b = bucketBounds(d.bucket, granularity);
    const from = coverage && b.start < coverage.start ? coverage.start : null;
    const to = coverage && b.end > coverage.end ? coverage.end : null;
    const thin = d.total < THIN_BUCKET_WORKOUTS;
    return { ...d, label: formatBucketLabel(d.bucket, granularity), from, to, partial: from !== null || to !== null, thin };
  });
  const solidAt = (i: number) => base[i] !== undefined && !base[i]!.thin && !base[i]!.partial;
  const rows = base.map((r, i) => {
    const solid = solidAt(i) ? r.value : null;
    // A whole bucket with no whole neighbour draws no area of its own (an area needs two points), so it gets a filled dot.
    const lone = solid !== null && !solidAt(i - 1) && !solidAt(i + 1) ? r.value : null;
    return { ...r, solid, lone, thinValue: r.thin ? r.value : null, edge: null as number | null };
  });
  // A partial bucket joins its whole neighbour with a dashed segment: the edge series holds just those two points.
  rows.forEach((r, i) => {
    if (!r.partial || r.thin) return;
    r.edge = r.value;
    const n = i === 0 ? rows[1] : i === rows.length - 1 ? rows[i - 1] : undefined;
    if (n && n.solid !== null) n.edge = n.value;
  });
  return rows;
}

/** Fewer buckets than this and a line would only join two points, which says nothing about a trend. */
const MIN_BUCKETS = 3;

/**
 * A single series' share of training over time — the per-domain, per-modality and per-movement chart.
 *
 * The Y axis is auto-scaled to the data, not fixed at 0–100: Flexibility rarely exceeds a few percent, and a fixed domain renders it
 * as a flat line along the axis that says nothing.
 *
 * Every bucket is drawn for what it is, not as one more point on a smooth curve:
 * - a bucket with fewer than THIN_BUCKET_WORKOUTS workouts is a hollow dot, not joined to the line: a share of three workouts swings by
 *   a third with one workout, and drawn into the line it made weekly grouping a 0 to 100% sawtooth;
 * - a first or last bucket only partly inside `coverage` (a log that began on the 21st, the month under way) is joined by a dashed
 *   segment and ends in a hollow dot, and its tooltip says from or to which day, as Overview's "so far" month does;
 * - the line is straight between buckets (a monotone spline drew curves between months that never happened);
 * - every tooltip names its denominator;
 * - with fewer than MIN_BUCKETS buckets there is no chart, only a sentence saying so.
 * A key under the chart names the hollow and dashed marks whenever either is drawn.
 */
export function ShareAreaChart({ data, color, label, seriesLabel, granularity, coverage, selected = null, onSelect }: ShareAreaChartProps) {
  const { track, onPointerUp, onKeyDown } = usePointPick(onSelect, selected);
  const [view] = useChartView();
  const noun = GRANULARITY_NOUN[granularity];

  if (data.length < MIN_BUCKETS) {
    return (
      <p className="text-sm text-muted-foreground">
        {data.length === 0 ? `No ${noun}s` : `Only ${data.length} ${data.length === 1 ? noun : `${noun}s`}`} in this range, too few to show a trend.{" "}
        {granularity === "daily" || granularity === "weekly" ? "Widen the date range to see more." : "Group by week, or widen the date range, to see more."}
      </p>
    );
  }

  const rows = shareRows(data, granularity, coverage);
  const summary = seriesSummary(label, rows, (v) => `${v.toFixed(1)}%`);
  const periodText = (r: (typeof rows)[number]) =>
    `${r.label}${r.from ? `, from ${formatDate(r.from).replace(/, \d{4}$/, "")}` : ""}${r.to ? `, to ${formatDate(r.to).replace(/, \d{4}$/, "")}` : ""}`;

  if (view === "table") {
    return (
      <DataTable
        caption={summary}
        columns={[{ label: noun[0]!.toUpperCase() + noun.slice(1) }, { label: "Share", numeric: true }, { label: "Of" }]}
        rows={[...rows].reverse().map((r) => [
          periodText(r),
          `${r.value.toFixed(1)}%`,
          <span className="text-muted-foreground">
            {r.basis}
            {r.thin ? ", too few to join the line" : ""}
          </span>,
        ])}
      />
    );
  }
  const anyThin = rows.some((r) => r.thin);
  const anyPartial = rows.some((r) => r.partial && !r.thin);

  const peak = Math.max(10, ...rows.map((r) => r.value));
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(0, peak);
  const config: ChartConfig = { solid: { label: seriesLabel, color } };
  const pickedLabel = selected ? rows.find((r) => r.bucket === selected)?.label : undefined;
  const gradientId = `fill-${seriesLabel.replace(/\W/g, "")}`;
  const hollow = (props: { cx?: number; cy?: number; payload?: { partial?: boolean } }, onlyPartial: boolean) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || (onlyPartial && !payload?.partial)) return <g />;
    return <circle cx={cx} cy={cy} r={3.5} fill="var(--card)" stroke={color} strokeWidth={1.5} />;
  };

  return (
    <div>
      <div onPointerUp={onPointerUp} onKeyDown={onKeyDown} className={onSelect ? "[&_.recharts-surface]:cursor-pointer" : undefined}>
        <ChartContainer config={config} className="h-[260px] w-full min-w-0" role="img" aria-label={summary}>
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} title={summary}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" interval={bucketTickInterval(rows.length)} angle={-35} textAnchor="end" height={50} {...AXIS_PROPS} />
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
                const p = props.payload?.[0]?.payload as (typeof rows)[number] | undefined;
                // Whatever the tooltip shows is what Enter picks (usePointPick).
                track(props.active ? (p?.bucket ?? null) : null);
                if (!props.active || !p) return null;
                return (
                  <div className="grid min-w-[9rem] gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    <span className="font-medium">{periodText(p)}</span>
                    <span className="font-medium tabular">{p.value.toFixed(1)}%</span>
                    <span className="text-muted-foreground tabular">{p.basis}</span>
                    {p.thin ? <span className="text-muted-foreground">Too few workouts to join the line</span> : null}
                    {onSelect ? <PickHint /> : null}
                  </div>
                );
              }}
            />
            <Area dataKey="solid" type="linear" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="edge" type="linear" stroke={color} strokeWidth={2} strokeDasharray="4 3" connectNulls={false} dot={(p) => hollow(p, true)} activeDot={false} isAnimationActive={false} />
            <Line dataKey="thinValue" stroke="none" dot={(p) => hollow(p, false)} activeDot={false} legendType="none" isAnimationActive={false} />
            <Line dataKey="lone" stroke="none" dot={{ r: 3, fill: color, stroke: color }} activeDot={false} legendType="none" isAnimationActive={false} />
            {pickedLabel ? <ReferenceLine x={pickedLabel} stroke="var(--foreground)" strokeWidth={1.5} ifOverflow="extendDomain" /> : null}
          </AreaChart>
        </ChartContainer>
      </div>
      {anyThin || anyPartial ? (
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-share-key>
          {anyThin ? (
            <span className="inline-flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden>
                <circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1.5" />
              </svg>
              Fewer than {THIN_BUCKET_WORKOUTS} workouts, not joined to the line
            </span>
          ) : null}
          {anyPartial ? (
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="10" aria-hidden>
                <line x1="1" y1="5" x2="17" y2="5" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
              </svg>
              Part of a {noun} only: the range or the log starts or ends inside it
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
