import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useChartInteraction } from "./chartInteraction";
import { AXIS_PROPS, CHART_MARGIN, NUM_AXIS_WIDTH, formatDate, niceAxisTicks } from "./chartUtils";
import type { RelativeStrengthPoint } from "@/lib/analytics/relativeStrength";

export type StrengthView = "raw" | "perBodyweight" | "perLeanMass";

const VIEW_META: Record<StrengthView, { label: string; decimals: number }> = {
  raw: { label: "Estimated 1RM", decimals: 0 },
  perBodyweight: { label: "Estimated 1RM per lb of bodyweight", decimals: 2 },
  perLeanMass: { label: "Estimated 1RM per lb of lean mass", decimals: 2 },
};

function valueForView(point: RelativeStrengthPoint, view: StrengthView): number | null {
  return view === "raw" ? point.e1rm : view === "perBodyweight" ? point.perBodyweight : point.perLeanMass;
}

/**
 * One lift's estimated 1RM per session, raw or divided by body mass. A
 * session with no matching InBody reading has no normalised value and is
 * left out of the normalised views rather than drawn at zero — the caption
 * says how many were left out.
 */
export function RelativeStrengthChart({
  liftName,
  points,
  view,
}: {
  liftName: string;
  points: RelativeStrengthPoint[];
  view: StrengthView;
}) {
  const { label, decimals } = VIEW_META[view];
  const rows = points
    .map((p) => ({ date: p.date, label: formatDate(p.date), value: valueForView(p, view) }))
    .filter((r): r is { date: string; label: string; value: number } => r.value !== null);
  const omitted = points.length - rows.length;
  const interaction = useChartInteraction(
    rows.map((r) => ({ label: r.label, start: r.date, end: r.date })),
    "points"
  );

  if (rows.length < 2) {
    return <p className="text-sm text-muted-foreground">Fewer than two sessions have a value for this view.</p>;
  }

  const best = Math.max(...rows.map((r) => r.value));
  const worst = Math.min(...rows.map((r) => r.value));
  const pad = Math.max(decimals === 0 ? 5 : 0.02, (best - worst) * 0.15);
  const { domain, ticks } = niceAxisTicks(worst - pad, best + pad);
  const config: ChartConfig = { value: { label, color: "var(--primary)" } };
  const latest = rows[rows.length - 1]!.value;

  return (
    <div>
      <ChartContainer
        config={config}
        className="h-[200px] w-full min-w-0"
        role="img"
        aria-label={`${liftName}, ${label.toLowerCase()}, latest ${latest.toFixed(decimals)}`}
      >
        <LineChart data={rows} margin={CHART_MARGIN} {...interaction.handlers}>
          {interaction.overlays}
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" padding={{ left: 12, right: 12 }} angle={-35} textAnchor="end" height={60} minTickGap={16} {...AXIS_PROPS} />
          <YAxis
            width={NUM_AXIS_WIDTH}
            domain={domain}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => v.toFixed(decimals)}
            {...AXIS_PROPS}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                renderFooter={interaction.tooltipFooter}
                formatter={(value) => <span className="font-medium tabular">{Number(value).toFixed(decimals)}</span>}
              />
            }
          />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--primary)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      {interaction.track}
      {interaction.footer}
      {omitted > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {omitted} {omitted === 1 ? "session has" : "sessions have"} no InBody reading close enough to use and{" "}
          {omitted === 1 ? "is" : "are"} left out.
        </p>
      ) : null}
    </div>
  );
}
