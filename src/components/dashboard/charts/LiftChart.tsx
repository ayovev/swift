import { useMemo } from "react";
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  repMaxCategory,
  repMaxLabel,
  type TrackedRepMaxCategory,
} from "@/lib/analytics/repMax";
import {
  AXIS_PROPS,
  FIXED_REPMAX_COLORS,
  NUM_AXIS_WIDTH,
  formatDate,
  niceAxisTicks,
  niceTimeTicks,
} from "./chartUtils";
import type { LiftEntry } from "@/types/dashboard";

const CONFIG = {
  value: { label: "Load", color: "var(--primary)" },
} as const;

/** Which rep-max scheme's points to show — "all" or exactly one tracked scheme. */
export type RepMaxFilter = "all" | TrackedRepMaxCategory;

function LiftDot({
  cx,
  cy,
  payload,
  colorFor,
}: {
  cx?: number;
  cy?: number;
  payload?: { pr: boolean; repMax: number | null };
  colorFor: (repMax: number | null) => string;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const r = 4;
  const fill = colorFor(payload.repMax);
  // A PR only gets the diamond treatment for the 4 tracked rep-max schemes —
  // an "other" rep scheme (a 4RM, a 6+RM, unspecified) isn't one we claim to
  // track precisely enough to call out as a record shape.
  const isTrackedPr = payload.pr && repMaxCategory(payload.repMax) !== "other";
  if (isTrackedPr) {
    return (
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={fill}
        fillOpacity={0.85}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.85} />;
}

/**
 * One lift's progression.
 *
 * Plotted as points rather than a single connected line, because a SugarWOD
 * log mixes rep schemes: a 165 lb 5RM and a 165 lb single are not the same
 * data point, and joining them draws a progression that never happened. The
 * rep scheme is inferred where the workout text allows (see repMax.ts) and
 * shown in the tooltip; points are connected only within the same scheme.
 */
export function LiftChart({
  liftName,
  entries,
  repMaxFilter,
  xDomain,
  xTicks,
}: {
  liftName: string;
  entries: LiftEntry[];
  repMaxFilter: RepMaxFilter;
  // Shared across every chart in the grid (see LiftGrid) so the same
  // calendar date lands at the same horizontal position in every small
  // multiple — each chart auto-scaling to its own tight date range instead
  // made otherwise-identical-looking ticks (e.g. "Jan 1, 2024") sit at a
  // different pixel offset per chart, which reads as misaligned even though
  // each individual axis was internally correct.
  xDomain: [number, number];
  xTicks: number[];
}) {
  const allData = useMemo(
    () =>
      entries
        .filter((e) => e.value > 0)
        .map((e) => ({
          ...e,
          t: new Date(e.date).getTime(),
          scheme: repMaxLabel(e.repMax),
          category: repMaxCategory(e.repMax),
        })),
    [entries]
  );

  const data = useMemo(
    () =>
      repMaxFilter === "all" ? allData : allData.filter((d) => d.category === repMaxFilter),
    [allData, repMaxFilter]
  );

  const colorFor = (repMax: number | null) => FIXED_REPMAX_COLORS[repMaxCategory(repMax)];

  if (data.length < 2) return null;

  const best = Math.max(...data.map((d) => d.value));
  const worst = Math.min(...data.map((d) => d.value));
  // Auto-scaled from the data — a fixed domain squashes lighter lifts flat.
  const pad = Math.max(5, (best - worst) * 0.15);
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(Math.max(0, worst - pad), best + pad);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{liftName}</h3>
        <span className="text-xs text-muted-foreground tabular">
          best {best.toLocaleString()}
        </span>
      </div>
      <ChartContainer
        config={CONFIG}
        className="h-[180px] w-full min-w-0"
        role="img"
        aria-label={`${liftName} progression: ${data.length} logged efforts, best ${best}`}
      >
        <ScatterChart margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={xDomain}
            ticks={xTicks}
            interval={0} // see niceAxisTicks() in chartUtils.ts for why
            tickFormatter={(t: number) => formatDate(new Date(t).toISOString().slice(0, 10))}
            angle={-35}
            textAnchor="end"
            height={50}
            {...AXIS_PROPS}
          />
          <YAxis
            dataKey="value"
            type="number"
            domain={yDomain}
            ticks={yTicks}
            interval={0} // see niceAxisTicks() in chartUtils.ts for why
            width={NUM_AXIS_WIDTH}
            {...AXIS_PROPS}
          />
          <ZAxis range={[36, 36]} />
          <ChartTooltip
            content={({ active, payload, label }: TooltipContentProps) => {
              // A Scatter point reports two tooltip payload entries, one for
              // its x value and one for its y value (Recharts always splits
              // them this way), both carrying the same row as `.payload`.
              // Keep only the y entry or the row renders twice.
              const filtered = payload.filter((item) => item.dataKey === "value");
              return (
                <ChartTooltipContent
                  active={active}
                  payload={filtered}
                  label={label}
                  hideLabel
                  formatter={(_value, _name, item) => {
                    const p = item?.payload as (typeof data)[number] | undefined;
                    if (!p) return null;
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium tabular">{p.value.toLocaleString()}</span>
                        <span className="text-muted-foreground">{formatDate(p.date)}</span>
                        <span className="text-muted-foreground">{p.scheme}</span>
                        {p.pr ? <span className="text-accent-link">Personal record</span> : null}
                      </div>
                    );
                  }}
                />
              );
            }}
          />
          <Scatter data={data} shape={<LiftDot colorFor={colorFor} />} />
        </ScatterChart>
      </ChartContainer>
    </div>
  );
}

/** Small multiples of the lifts with enough history to say anything. */
export function LiftGrid({
  lifts,
  repMaxFilter,
}: {
  lifts: Record<string, LiftEntry[]>;
  repMaxFilter: RepMaxFilter;
}) {
  const entries = useMemo(
    () =>
      Object.entries(lifts)
        .filter(([, v]) => v.filter((e) => e.value > 0).length >= 3)
        .sort((a, b) => b[1].length - a[1].length),
    [lifts]
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No barbell lifts in this export had enough logged sessions to chart a progression.
      </p>
    );
  }

  // Mirrors LiftChart's own "at least 2 points" cutoff, filtered the same way,
  // so an empty result here means every chart below would render nothing.
  const visible = entries.filter(
    ([, series]) =>
      series.filter(
        (e) =>
          e.value > 0 && (repMaxFilter === "all" || repMaxCategory(e.repMax) === repMaxFilter)
      ).length >= 2
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No lift has at least two logged efforts at that rep scheme.
      </p>
    );
  }

  // One shared time domain and tick set for every chart below — see the
  // xDomain/xTicks comment on LiftChart for why per-chart auto-scaling
  // makes identical-looking dates land at different pixel positions.
  const times = visible.flatMap(([, series]) =>
    series
      .filter((e) => e.value > 0 && (repMaxFilter === "all" || repMaxCategory(e.repMax) === repMaxFilter))
      .map((e) => new Date(e.date).getTime())
  );
  const xDomain: [number, number] = [Math.min(...times), Math.max(...times)];
  const xTicks = niceTimeTicks(xDomain[0], xDomain[1]);

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
      {visible.map(([name, series]) => (
        <LiftChart
          key={name}
          liftName={name}
          entries={series}
          repMaxFilter={repMaxFilter}
          xDomain={xDomain}
          xTicks={xTicks}
        />
      ))}
    </div>
  );
}

