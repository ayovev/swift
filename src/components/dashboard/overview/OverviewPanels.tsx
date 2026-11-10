import { useId } from "react";
import dayjs from "dayjs";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, AXIS_TICK_COUNT, FIXED_MODALITY_COLORS, MODALITY_DRAW_ORDER, MODALITY_FIXED_CHART_CONFIG, NUM_AXIS_WIDTH, niceAxisTicks } from "../charts/chartUtils";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import { displayName, moveUpText, verdictText } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import {
  OVERVIEW_CHART_MONTHS,
  shortDate,
  weightText,
  type LatestEntry,
  type MonthDays,
  type MonthMix,
} from "@/lib/analytics/overview";
import { entryName, entrySpanText } from "@/lib/analytics/timeline";
import { cn } from "@/lib/utils";
import { MODALITY_SHORT_LABELS } from "@/types/modality";
import { AREA_LABEL } from "@/types/timeline";

/**
 * Overview's three panels (docs/overview.md). Each is the evidence behind one
 * stat in the totals row, as one visual and one link into its section, and
 * never repeats that stat's number. Most recent PR has no panel: its evidence
 * is the PR timeline on Training → Lifts.
 */

function PanelLink({ label, onClick }: { label: string; onClick?: (() => void) | undefined }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 self-start text-sm text-accent-link underline-offset-2 hover:underline"
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden />
    </button>
  );
}

function PanelHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
    </CardHeader>
  );
}

// ── Training ──────────────────────────────────────────────────────────────

/**
 * Widest a month's bar gets, on both Training charts. A full year gives each
 * month about 90px on a desktop; a log two months old would otherwise stretch
 * each bar across half the card. The same cap on both keeps the columns lined up.
 */
const MAX_BAR_PX = 72;

/**
 * The ink for the days-trained bars: the achromatic foreground, not the accent. The M/W/G chart sits in the same card in fixed
 * red, green and blue, and an accent fill there matched one of them for half the swatches (blue is G, green is W, red and magenta
 * read as M), which told the reader two different series were one (Gestalt similarity). A neutral bar can match none of them.
 */
const DAYS_INK = "var(--foreground)";
/** How strongly a full month's bar is filled: dark enough to read as a solid bar (well over 3:1 on the card in both modes), light enough not to shout. */
const DAYS_FILL_OPACITY = 0.7;

/**
 * The fill that marks a month still under way: a single-direction 45° hatch in the
 * same ink as the full months, over a faint wash of it. A pattern rather than a lighter shade, so
 * "in progress" reads as a different kind of bar, not a smaller amount, and
 * survives without colour. One direction of lines rather than a cross-hatch: it is
 * the usual chart mark for "not final", it leaves the bar's top edge easy to
 * read, and its stripes stay distinct at phone width and in a 12px key, where
 * finer pinstripes blurred into a flat tint (compared side by side). One definition serves the bar and its key; `id`
 * comes from useId with the colons React puts in it stripped, since they are
 * awkward inside `url(#...)`.
 */
function InProgressPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={DAYS_INK} fillOpacity={0.08} />
      <path d="M0 0V6" stroke={DAYS_INK} strokeOpacity={DAYS_FILL_OPACITY} strokeWidth="2" />
    </pattern>
  );
}

function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The key under the chart: a swatch of the in-progress fill and what it means. */
function InProgressKey() {
  const id = useSvgId("in-progress-key");
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <svg width="12" height="12" aria-hidden className="shrink-0">
        <defs>
          <InProgressPattern id={id} />
        </defs>
        <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={`url(#${id})`} stroke={DAYS_INK} strokeOpacity={DAYS_FILL_OPACITY} strokeWidth="1" />
      </svg>
      This month so far
    </span>
  );
}

/**
 * Days trained per month over the last 12 months. The current month is drawn
 * with a diagonal hatch (InProgressPattern) and its tooltip says "so far",
 * so a partial month doesn't read as a drop. No 90-day marker: 90 days rarely falls on a month boundary, so shading
 * whole bars would mark a different period from the one the totals count.
 */
function MonthlyDaysChart({ months }: { months: MonthDays[] }) {
  const patternId = useSvgId("in-progress");
  const data = months.map((m) => ({ ...m, label: dayjs(`${m.month}-01`).format("MMM") }));
  const best = Math.max(1, ...months.map((m) => m.days));
  const { domain, ticks } = niceAxisTicks(0, best, AXIS_TICK_COUNT, true);
  const config: ChartConfig = { days: { label: "Days trained", color: DAYS_INK } };
  const first = months[0];
  const last = months[months.length - 1];
  const aria =
    first && last
      ? `Bar chart of days trained per month, ${dayjs(`${first.month}-01`).format("MMM YYYY")} to ${dayjs(`${last.month}-01`).format("MMM YYYY")}`
      : "Bar chart of days trained per month";
  return (
    <ChartContainer config={config} className="h-[200px] w-full min-w-0" role="img" aria-label={aria}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} maxBarSize={MAX_BAR_PX}>
        <defs>
          <InProgressPattern id={patternId} />
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={8} {...AXIS_PROPS} />
        <YAxis width={NUM_AXIS_WIDTH} domain={domain} ticks={ticks} interval={0} {...AXIS_PROPS} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (MonthDays & { label: string }) | undefined;
            if (!active || !p) return null;
            return (
              <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                <div className="font-medium">{dayjs(`${p.month}-01`).format("MMMM YYYY")}</div>
                <div className="text-muted-foreground tabular">
                  {p.days} {p.days === 1 ? "day" : "days"} trained{p.partial ? " so far" : ""}
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="days" fill={DAYS_INK} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((m) => (
            <Cell
              key={m.month}
              fill={m.partial ? `url(#${patternId})` : DAYS_INK}
              fillOpacity={m.partial ? 1 : DAYS_FILL_OPACITY}
              stroke={m.partial ? DAYS_INK : "none"}
              strokeOpacity={DAYS_FILL_OPACITY}
              strokeWidth={m.partial ? 1 : 0}
              data-partial={m.partial ? "true" : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * The M/W/G split per month, on the same 12 months, margins and axis width as
 * MonthlyDaysChart above it, so each month's column lines up under its days
 * bar. Each bar is that month's share of cardio, weightlifting and gymnastics,
 * summing to 100; a month with no classified workout has no bar. The current
 * month is a share, not an amount, so it is not hatched: a partial month's
 * split is as valid as a full one's, and its tooltip still says "so far".
 */
function MonthlyMixChart({ mix }: { mix: MonthMix[] }) {
  const data = mix.map((m) => ({
    month: m.month,
    label: dayjs(`${m.month}-01`).format("MMM"),
    partial: m.partial,
    workouts: m.workouts,
    M: m.split?.M ?? 0,
    W: m.split?.W ?? 0,
    G: m.split?.G ?? 0,
  }));
  const first = mix[0];
  const last = mix[mix.length - 1];
  const aria =
    first && last
      ? `Stacked bar chart of each month's cardio, weightlifting and gymnastics share, ${dayjs(`${first.month}-01`).format("MMM YYYY")} to ${dayjs(`${last.month}-01`).format("MMM YYYY")}`
      : "Stacked bar chart of each month's cardio, weightlifting and gymnastics share";
  return (
    <ChartContainer config={MODALITY_FIXED_CHART_CONFIG} className="h-[160px] w-full min-w-0" role="img" aria-label={aria}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} maxBarSize={MAX_BAR_PX}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={8} {...AXIS_PROPS} />
        <YAxis
          width={NUM_AXIS_WIDTH}
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          interval={0}
          tickFormatter={(v: number) => `${v}%`}
          {...AXIS_PROPS}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !p) return null;
            return (
              <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                <div className="font-medium">
                  {dayjs(`${p.month}-01`).format("MMMM YYYY")}
                  {p.partial ? " so far" : ""}
                </div>
                {p.workouts ? (
                  <div className="text-muted-foreground tabular">
                    {MODALITY_DRAW_ORDER.map((m) => `${MODALITY_SHORT_LABELS[m]} ${Math.round(p[m])}%`).join(" · ")}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No classified workouts</div>
                )}
              </div>
            );
          }}
        />
        {/* Drawn W, G, M from the baseline (MODALITY_DRAW_ORDER), with a 2px card-coloured stroke as the gap between segments,
            so two segments never read as one block. */}
        {MODALITY_DRAW_ORDER.map((m, i) => (
          <Bar
            key={m}
            dataKey={m}
            stackId="mix"
            fill={FIXED_MODALITY_COLORS[m]}
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === MODALITY_DRAW_ORDER.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function TrainingPanel({
  months,
  mix,
  onSeeWorkouts,
}: {
  months: MonthDays[];
  mix: MonthMix[];
  onSeeWorkouts?: (() => void) | undefined;
}) {
  const anyMix = mix.some((m) => m.split);
  return (
    <Card>
      <PanelHeader title="Showing up" caption={`Last ${OVERVIEW_CHART_MONTHS} months, by month`} />
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {months.some((m) => m.days > 0) ? (
            <>
              <MonthlyDaysChart months={months} />
              {months.some((m) => m.partial && m.days > 0) ? <InProgressKey /> : null}
            </>
          ) : (
            // Twelve empty months on a 0 to 1 axis say nothing a sentence doesn't.
            // The scope line above already names the last logged workout.
            <p className="text-sm text-muted-foreground">No workouts in the last {OVERVIEW_CHART_MONTHS} months.</p>
          )}
        </div>
        <section aria-label="What it was made of" className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Cardio, weightlifting, gymnastics</h3>
          {anyMix ? (
            <>
              <MonthlyMixChart mix={mix} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {MODALITY_DRAW_ORDER.map((m) => (
                  <span key={m} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: FIXED_MODALITY_COLORS[m] }} aria-hidden />
                    {MODALITY_SHORT_LABELS[m]}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No classified workouts in the last {OVERVIEW_CHART_MONTHS} months.</p>
          )}
        </section>
        <PanelLink label="See workouts" onClick={onSeeWorkouts} />
      </CardContent>
    </Card>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────

const VERDICT_PILL = {
  up: { label: "Up", className: "bg-accent-subtle text-accent-link" },
  down: { label: "Down", className: "bg-destructive/10 text-destructive" },
} as const;

/** The change in Progress's own words: the verdict's change, or the move up to RX. */
function movedText(row: ProgressRow): string {
  if (row.verdict) return verdictText(row.subject, row.verdict).change;
  if (row.moveUp) return moveUpText(row.moveUp);
  return "";
}

export function InsightsPanel({
  moved,
  moreDown = 0,
  emptyText = "No lift or benchmark has changed enough to call.",
  latest,
  today,
  onOpenSubject,
  onSeeProgress,
  onSeeTimeline,
}: {
  moved: ProgressRow[];
  /** Downs that didn't fit in the list (whatMoved), so the panel never shows fewer downs than Progress counts. */
  moreDown?: number;
  /** Why nothing is listed (whatMovedEmptyText): nothing moved, or nothing could be compared yet. */
  emptyText?: string;
  latest: LatestEntry | null;
  today: string;
  onOpenSubject?: ((key: string) => void) | undefined;
  onSeeProgress?: (() => void) | undefined;
  onSeeTimeline?: (() => void) | undefined;
}) {
  return (
    <Card>
      <PanelHeader title="What moved" />
      <CardContent className="flex flex-col gap-4">
        {moved.length ? (
          <ul className="flex flex-col">
            {moved.map((r) => {
              const pill = VERDICT_PILL[r.group as "up" | "down"];
              const body = (
                <>
                  <span className="text-sm font-medium">
                    {displayName(r.subject)}
                    <span className={cn("ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold", pill.className)}>
                      {pill.label}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{movedText(r)}</span>
                </>
              );
              return (
                <li key={r.subject.key} className="border-t border-border first:border-t-0">
                  {onOpenSubject ? (
                    <button
                      type="button"
                      onClick={() => onOpenSubject(r.subject.key)}
                      className="flex w-full flex-col gap-0.5 py-2.5 text-left hover:bg-muted/40"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-0.5 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        {moreDown > 0 ? (
          onSeeProgress ? (
            <button type="button" onClick={onSeeProgress} className="-mt-2 self-start text-xs text-accent-link underline-offset-2 hover:underline">
              and {moreDown} more down
            </button>
          ) : (
            <p className="-mt-2 text-xs text-muted-foreground">and {moreDown} more down</p>
          )
        ) : null}

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <span className="text-xs font-semibold tracking-[0.08em] uppercase">Timeline</span>
          {latest ? (
            <p className="text-sm">
              {latest.entry.endDate === null
                ? `Ongoing since ${shortDate(latest.entry.startDate, today)}`
                : entrySpanText(latest.entry)}
              : {entryName(latest.entry)}
              {latest.entry.name?.trim() ? `, ${AREA_LABEL[latest.entry.area]}` : ""}
              {latest.moreOngoing ? `, and ${latest.moreOngoing} more ongoing` : ""}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
          )}
          <PanelLink label="See timeline" onClick={onSeeTimeline} />
        </div>

        <PanelLink label="See progress" onClick={onSeeProgress} />
      </CardContent>
    </Card>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────

function WeightChart({ readings }: { readings: BodyReading[] }) {
  const data = readings.map((r) => ({ date: r.date, weight: r.weightLb, t: dayjs(r.date).valueOf() }));
  const lo = Math.min(...data.map((d) => d.weight));
  const hi = Math.max(...data.map((d) => d.weight));
  const pad = Math.max(1, (hi - lo) * 0.15);
  const { domain, ticks } = niceAxisTicks(lo - pad, hi + pad);
  const config: ChartConfig = { weight: { label: "Body weight", color: "var(--primary)" } };
  const first = data[0]!;
  const last = data[data.length - 1]!;
  return (
    <ChartContainer
      config={config}
      className="h-[200px] w-full min-w-0"
      role="img"
      aria-label={`Line chart of body weight, ${dayjs(first.date).format("MMM YYYY")} to ${dayjs(last.date).format("MMM YYYY")}, latest ${weightText(last.weight)}`}
    >
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[first.t, last.t]}
          tickFormatter={(t: number) => dayjs(t).format("MMM 'YY")}
          tickCount={4}
          {...AXIS_PROPS}
        />
        <YAxis width={NUM_AXIS_WIDTH} domain={domain} ticks={ticks} interval={0} {...AXIS_PROPS} />
        <ChartTooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !p) return null;
            return (
              <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                <div className="font-medium">{dayjs(p.date).format("MMM D, YYYY")}</div>
                <div className="text-muted-foreground tabular">{weightText(p.weight)}</div>
              </div>
            );
          }}
        />
        <Line dataKey="weight" type="linear" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}

/** What the weight line is drawn from, named only as far as it is true: "InBody scans", "Weigh-ins" or both. */
export function bodySourcesCaption(fromScans: number, fromWeighIns: number): string | null {
  if (fromScans && fromWeighIns) return "InBody scans and weigh-ins";
  if (fromScans) return "InBody scans";
  if (fromWeighIns) return "Weigh-ins";
  return null;
}

export function BodyPanel({
  readings,
  sources = null,
  onSeeBody,
}: {
  readings: BodyReading[];
  /** The caption naming what the line is drawn from (bodySourcesCaption). */
  sources?: string | null;
  onSeeBody?: (() => void) | undefined;
}) {
  return (
    <Card>
      <PanelHeader title="Body weight" {...(readings.length > 1 && sources ? { caption: sources } : {})} />
      <CardContent className="flex flex-col gap-4">
        {readings.length > 1 ? (
          <WeightChart readings={readings} />
        ) : readings.length === 1 ? (
          <p className="text-sm">
            One reading so far. A second draws the line.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Upload an InBody export or add a weigh-in.</p>
        )}
        <PanelLink label="See body composition" onClick={onSeeBody} />
      </CardContent>
    </Card>
  );
}
