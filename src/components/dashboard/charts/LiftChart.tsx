import { useMemo, useState } from "react";
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  repMaxCategory,
  repMaxLabel,
  type RepMaxCategory,
  type TrackedRepMaxCategory,
} from "@/lib/analytics/repMax";
import {
  AXIS_PROPS,
  FIXED_REPMAX_COLORS,
  NUM_AXIS_WIDTH,
  REP_MAX_CATEGORY_ORDER,
  formatDate,
  formatTimeTick,
  niceAxisTicks,
  niceTimeTicks,
  TIME_AXIS_PROPS,
  type TimeUnit,
} from "./chartUtils";
import type { LiftEntry } from "@/types/dashboard";
import { ChartPickNote, PickHint, capturePick, usePointPick } from "./ChartPick";
import { DataTable, seriesSummary, useChartView } from "./ChartTable";

const CONFIG = {
  value: { label: "Load", color: "var(--primary)" },
} as const;

/**
 * Which rep scheme each chart highlights: "most" (each lift's own most-logged scheme, the default) or one tracked scheme for every
 * chart. It moves the emphasis and hides nothing: the other efforts stay on the chart in grey.
 */
export type RepMaxHighlight = "most" | TrackedRepMaxCategory;

/** A lift needs this many logged efforts for a chart; fewer go in the "Also logged" line, since 3 to 5 points draw no trend. */
export const MIN_CHART_EFFORTS = 6;

/**
 * The scheme a lift logged most often, tracked schemes winning ties in REP_MAX_CATEGORY_ORDER (1RM first). "Other" (no rep count read
 * from the text, or a scheme like 4RM) is chosen only when the lift has no tracked scheme at all: Front Squat on the sample logged
 * mostly "other" and highlighted it in black, which named nothing anyone trains to.
 */
export function mostLoggedScheme(entries: readonly LiftEntry[]): RepMaxCategory {
  const counts = new Map<RepMaxCategory, number>();
  for (const e of entries) if (e.value > 0) counts.set(repMaxCategory(e.repMax), (counts.get(repMaxCategory(e.repMax)) ?? 0) + 1);
  let best: RepMaxCategory = "other";
  let n = 0;
  for (const c of REP_MAX_CATEGORY_ORDER) {
    const k = counts.get(c) ?? 0;
    if (k > n) [best, n] = [c, k];
  }
  return best;
}

const SHORT_SCHEME: Record<RepMaxCategory, string> = { "1RM": "1RM", "2RM": "2RM", "3RM": "3RM", "5RM": "5RM", other: "Other schemes" };

/** The highlighted scheme's colour; "other" (no rep count read from the text) is the ink, since its fixed colour is the grey of the rest. */
const highlightColor = (c: RepMaxCategory) => (c === "other" ? "var(--foreground)" : FIXED_REPMAX_COLORS[c]);

/**
 * The highlighted scheme's running best as the corners of a step line: flat until a heavier load is logged, then straight up, and on
 * to the scheme's last effort. Joining every effort in date order drew each light day, deload and technique session as a drop, so most
 * charts read as a zigzag of noise; a logged load is not a max attempt. The running best answers the card's question, what got heavier
 * and when, and lines up with the PR diamonds. It never falls, so it cannot show a decline: that is Progress's verdict, not this record's.
 */
export function runningBestSteps(points: readonly { t: number; value: number }[]): { t: number; value: number }[] {
  const out: { t: number; value: number }[] = [];
  let best = -Infinity;
  for (const p of points) {
    if (p.value <= best) continue;
    if (out.length) out.push({ t: p.t, value: best });
    out.push({ t: p.t, value: p.value });
    best = p.value;
  }
  const last = points[points.length - 1];
  if (last && out.length && last.t > out[out.length - 1]!.t) out.push({ t: last.t, value: best });
  return out;
}

interface LiftPoint extends LiftEntry {
  t: number;
  scheme: string;
  category: RepMaxCategory;
  emph: boolean;
}

function LiftDot({
  cx,
  cy,
  payload,
  color,
  picked,
}: {
  cx?: number;
  cy?: number;
  payload?: LiftPoint;
  /** The highlighted scheme's colour; every other effort is grey. */
  color: string;
  /** The picked dot's date (ChartPick.tsx); that dot gets a ring in the foreground ink. */
  picked?: string | null;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const r = payload.emph ? 4 : 3.5;
  const fill = payload.emph ? color : "var(--muted-foreground)";
  const opacity = payload.emph ? 1 : 0.4;
  // A transparent circle 24px across under every dot: the hit target for a finger or a pointer, bigger than the 8px mark (a pinpoint
  // target misses), and the element that names its point for picking (ChartPick.tsx).
  const hit = <circle cx={cx} cy={cy} r={12} fill="transparent" data-pick={payload.date} />;
  // A PR only gets the diamond treatment for the 4 tracked rep-max schemes —
  // an "other" rep scheme (a 4RM, a 6+RM, unspecified) isn't one we claim to
  // track precisely enough to call out as a record shape.
  const isTrackedPr = payload.pr && payload.category !== "other";
  const mark = isTrackedPr ? (
    <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} fill={fill} fillOpacity={opacity} />
  ) : (
    <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={opacity} />
  );
  return (
    <g data-pick={payload.date} data-emph={payload.emph ? "" : undefined}>
      {hit}
      {picked && picked === payload.date ? <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--foreground)" strokeWidth={1.5} /> : null}
      {mark}
    </g>
  );
}

export function LiftChart({
  liftName,
  entries,
  highlight,
  xDomain,
  xTicks,
  xTickUnit,
  onOpenDay,
}: {
  liftName: string;
  entries: LiftEntry[];
  highlight: RepMaxHighlight;
  // Shared across every chart in the grid (see LiftGrid) so the same
  // calendar date lands at the same horizontal position in every small
  // multiple — each chart auto-scaling to its own tight date range instead
  // made otherwise-identical-looking ticks (e.g. "Jan 1, 2024") sit at a
  // different pixel offset per chart, which reads as misaligned even though
  // each individual axis was internally correct.
  xDomain: [number, number];
  xTicks: number[];
  // The calendar unit niceTimeTicks() chose xTicks in — see formatTimeTick().
  xTickUnit: TimeUnit;
  /** Opens Workouts for a picked dot's day (YYYY-MM-DD). Omit for a chart without picking. */
  onOpenDay?: ((date: string) => void) | undefined;
}) {
  // One logged effort picked (ChartPick.tsx): the dot gets a ring, and the note under the chart offers its workout.
  const [picked, setPicked] = useState<string | null>(null);
  const pick = onOpenDay
    ? (date: string | null) => {
        setPicked(date);
        if (date) capturePick("selected");
      }
    : undefined;
  const { track, onPointerUp, onKeyDown } = usePointPick(pick, picked);
  const [view] = useChartView();
  const emphCategory: RepMaxCategory = highlight === "most" ? mostLoggedScheme(entries) : highlight;
  const color = highlightColor(emphCategory);
  const data = useMemo(() => {
    const rows = entries
      .filter((e) => e.value > 0)
      .map((e) => ({ ...e, t: new Date(e.date).getTime(), scheme: repMaxLabel(e.repMax), category: repMaxCategory(e.repMax) }))
      .map((e) => ({ ...e, emph: e.category === emphCategory }))
      .sort((a, b) => a.t - b.t);
    return rows satisfies LiftPoint[];
  }, [entries, emphCategory]);
  const emph = data.filter((d) => d.emph);
  const latest = emph[emph.length - 1];
  const steps = runningBestSteps(emph);
  const rest = data.filter((d) => !d.emph);

  if (data.length < 2) return null;
  const pickedPoint = picked ? data.find((d) => d.date === picked) : undefined;
  const summary = seriesSummary(`${liftName}, logged loads`, data.map((d) => ({ label: formatDate(d.date), value: d.value })), (v) => `${v.toLocaleString()} lb`);

  const best = Math.max(...data.map((d) => d.value));
  const worst = Math.min(...data.map((d) => d.value));
  // Auto-scaled from the data — a fixed domain squashes lighter lifts flat.
  const pad = Math.max(5, (best - worst) * 0.15);
  const { domain: yDomain, ticks: yTicks } = niceAxisTicks(Math.max(0, worst - pad), best + pad);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-sm font-medium">{liftName}</h3>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular" data-direct-label>
          {latest ? (
            <>
              {/* The highlighted scheme named next to its colour, in the header rather than at the line's end, where it landed on dots. */}
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>
                <span className="text-foreground">{SHORT_SCHEME[emphCategory]}</span>, latest {latest.value.toLocaleString()} lb
              </span>
            </>
          ) : (
            <span>No {SHORT_SCHEME[emphCategory]} logged</span>
          )}
          <span aria-hidden="true">·</span>
          <span>best {best.toLocaleString()} lb</span>
        </span>
      </div>
      {view === "table" ? (
        <DataTable
          caption={summary}
          columns={[{ label: "Date" }, { label: "Load", numeric: true }, { label: "Rep scheme" }, { label: "PR" }]}
          rows={[...data].reverse().map((d) => [formatDate(d.date), `${d.value.toLocaleString()} lb`, d.scheme, d.pr ? "PR" : ""])}
        />
      ) : (
      <>
      <div onPointerUp={onPointerUp} onKeyDown={onKeyDown} className={onOpenDay ? "[&_.recharts-symbols]:cursor-pointer" : undefined}>
      <ChartContainer
        config={CONFIG}
        className="h-[180px] w-full min-w-0"
        role="img"
        aria-label={summary}
      >
        <ScatterChart margin={{ top: 8, right: 10, bottom: 0, left: 0 }} title={summary}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={xDomain}
            ticks={xTicks}
            interval={0} // see niceAxisTicks() in chartUtils.ts for why
            tickFormatter={(t: number) => formatTimeTick(t, xTickUnit)}
            {...TIME_AXIS_PROPS}
            {...AXIS_PROPS}
          />
          <YAxis
            dataKey="value"
            type="number"
            domain={yDomain}
            ticks={yTicks}
            interval={0} // see niceAxisTicks() in chartUtils.ts for why
            width={NUM_AXIS_WIDTH}
            // The unit once, on the top tick: every tick saying "lb" would crowd the axis.
            tickFormatter={(v: number) => (v === yTicks[yTicks.length - 1] ? `${v.toLocaleString()} lb` : v.toLocaleString())}
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
              track(active ? ((filtered[0]?.payload as (typeof data)[number] | undefined)?.date ?? null) : null);
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
                        <span className="font-medium tabular">{p.value.toLocaleString()} lb</span>
                        <span className="text-muted-foreground">{formatDate(p.date)}</span>
                        <span className="text-muted-foreground">{p.scheme}</span>
                        {p.pr ? <span className="text-accent-link">Personal record</span> : null}
                        {onOpenDay ? <PickHint>Select to see this workout</PickHint> : null}
                      </div>
                    );
                  }}
                />
              );
            }}
          />
          {/* Grey first, so the highlighted scheme and its line draw on top. */}
          {/* The running best under the dots: a step line with invisible corners and no tooltip of its own. */}
          {steps.length > 1 ? (
            <Scatter data={steps} line={{ stroke: color, strokeWidth: 1.5, strokeOpacity: 0.7 }} lineJointType="linear" shape={() => <g />} tooltipType="none" isAnimationActive={false} />
          ) : null}
          <Scatter data={rest} shape={<LiftDot color={color} picked={picked} />} isAnimationActive={false} />
          <Scatter data={emph} shape={<LiftDot color={color} picked={picked} />} isAnimationActive={false} />
        </ScatterChart>
      </ChartContainer>
      </div>
      </>
      )}
      {pickedPoint && onOpenDay ? (
        <ChartPickNote onClear={() => setPicked(null)} action={{ label: "See this workout", onClick: () => onOpenDay(pickedPoint.date) }}>
          <span className="font-medium">{formatDate(pickedPoint.date)}</span>: {pickedPoint.value.toLocaleString()} lb, {pickedPoint.scheme}
          {pickedPoint.pr ? ", a PR" : ""}
        </ChartPickNote>
      ) : null}
    </div>
  );
}

/**
 * Small multiples of the lifts with enough history to say anything: at least MIN_CHART_EFFORTS logged efforts each. A lift with 3 to
 * 5 got the same chart as Back Squat with about 40; those are named in one line under the grid instead.
 */
export function LiftGrid({
  lifts,
  highlight,
  onOpenDay,
}: {
  lifts: Record<string, LiftEntry[]>;
  highlight: RepMaxHighlight;
  /** Opens Workouts for a picked dot's day; passed to every chart. */
  onOpenDay?: ((date: string) => void) | undefined;
}) {
  const logged = (v: readonly LiftEntry[]) => v.filter((e) => e.value > 0).length;
  const all = useMemo(() => Object.entries(lifts).filter(([, v]) => logged(v) > 0).sort((a, b) => logged(b[1]) - logged(a[1])), [lifts]);
  const charted = all.filter(([, v]) => logged(v) >= MIN_CHART_EFFORTS);
  const listed = all.filter(([, v]) => logged(v) < MIN_CHART_EFFORTS);

  if (charted.length === 0 && listed.length === 0) {
    return <p className="text-sm text-muted-foreground">No barbell lifts in this export had a load logged.</p>;
  }

  // One shared time domain and tick set for every chart below — see the
  // xDomain/xTicks comment on LiftChart for why per-chart auto-scaling
  // makes identical-looking dates land at different pixel positions.
  const times = charted.flatMap(([, series]) => series.filter((e) => e.value > 0).map((e) => new Date(e.date).getTime()));
  const xDomain: [number, number] = times.length ? [Math.min(...times), Math.max(...times)] : [0, 0];
  const { ticks: xTicks, unit: xTickUnit } = niceTimeTicks(xDomain[0], xDomain[1]);

  return (
    <div className="flex flex-col gap-6">
      {charted.length ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {charted.map(([name, series]) => (
            <LiftChart
              key={name}
              liftName={name}
              entries={series}
              highlight={highlight}
              xDomain={xDomain}
              xTicks={xTicks}
              xTickUnit={xTickUnit}
              onOpenDay={onOpenDay}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No lift in this range has {MIN_CHART_EFFORTS} logged efforts, enough to chart.</p>
      )}
      {listed.length ? (
        <p className="text-sm text-muted-foreground" data-also-logged>
          <span className="font-medium text-foreground">Also logged</span>, too few efforts to chart:{" "}
          {listed.map(([name, v]) => `${name} (${logged(v)})`).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
