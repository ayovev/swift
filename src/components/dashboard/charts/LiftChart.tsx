import { useMemo } from "react";
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { REP_MAX_BUCKET_LABELS, repMaxBucket } from "@/lib/analytics/repMax";
import { AXIS_PROPS, NUM_AXIS_WIDTH, formatDate } from "./chartUtils";
import type { LiftEntry } from "@/types/dashboard";

const CONFIG = {
  value: { label: "Load", color: "var(--primary)" },
} as const;

/**
 * One lift's progression.
 *
 * Plotted as points rather than a single connected line, because a SugarWOD
 * log mixes rep schemes: a 165 lb 5RM and a 165 lb single are not the same
 * data point, and joining them draws a progression that never happened. The
 * rep scheme is inferred where the workout text allows (see repMax.ts) and
 * shown in the tooltip; points are connected only within the same scheme.
 */
export function LiftChart({ liftName, entries }: { liftName: string; entries: LiftEntry[] }) {
  const data = useMemo(
    () =>
      entries
        .filter((e) => e.value > 0)
        .map((e) => ({
          ...e,
          t: new Date(e.date).getTime(),
          scheme: REP_MAX_BUCKET_LABELS[repMaxBucket(e.repMax)],
        })),
    [entries]
  );

  if (data.length < 2) return null;

  const best = Math.max(...data.map((d) => d.value));
  const worst = Math.min(...data.map((d) => d.value));
  // Auto-scaled from the data — a fixed domain squashes lighter lifts flat.
  const pad = Math.max(5, (best - worst) * 0.15);

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
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => formatDate(new Date(t).toISOString().slice(0, 10))}
            minTickGap={44}
            {...AXIS_PROPS}
          />
          <YAxis
            dataKey="value"
            type="number"
            domain={[Math.max(0, worst - pad), best + pad]}
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
          <Scatter data={data} fill="var(--primary)" fillOpacity={0.75} />
        </ScatterChart>
      </ChartContainer>
    </div>
  );
}

/** Small multiples of the lifts with enough history to say anything. */
export function LiftGrid({ lifts }: { lifts: Record<string, LiftEntry[]> }) {
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

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
      {entries.map(([name, series]) => (
        <LiftChart key={name} liftName={name} entries={series} />
      ))}
    </div>
  );
}

