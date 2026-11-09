import { useId } from "react";
import dayjs from "dayjs";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { AXIS_PROPS, AXIS_TICK_COUNT, NUM_AXIS_WIDTH, niceAxisTicks } from "../charts/chartUtils";
import { ModalityBar } from "../charts/ModalityBar";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import { displayName, moveUpText, verdictText } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import { OVERVIEW_RECENT_DAYS } from "@/lib/analytics/insightConfig";
import {
  OVERVIEW_CHART_MONTHS,
  shortDate,
  weightText,
  type LatestEntry,
  type MonthDays,
  type TrainingMix,
} from "@/lib/analytics/overview";
import { entryName, entrySpanText } from "@/lib/analytics/timeline";
import { cn } from "@/lib/utils";
import { DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";
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
 * The fill that marks a month still under way: a diamond cross-hatch in the
 * accent over a faint wash of it. A pattern rather than a lighter shade, so
 * "in progress" reads as a different kind of bar, not a smaller amount, and
 * survives without colour. One definition serves the bar and its key; `id`
 * comes from useId with the colons React puts in it stripped, since they are
 * awkward inside `url(#...)`.
 */
function InProgressPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--primary)" fillOpacity={0.12} />
      <path d="M0 0H6M0 0V6" stroke="var(--primary)" strokeWidth="1.5" />
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
        <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={`url(#${id})`} stroke="var(--primary)" strokeWidth="1" />
      </svg>
      This month so far
    </span>
  );
}

/**
 * Days trained per month over the last 12 months. The current month is drawn
 * with a diamond cross-hatch (InProgressPattern) and its tooltip says "so far",
 * so a partial month doesn't read as a drop. No 90-day marker: 90 days rarely falls on a month boundary, so shading
 * whole bars would mark a different period from the one the totals count.
 */
function MonthlyDaysChart({ months }: { months: MonthDays[] }) {
  const patternId = useSvgId("in-progress");
  const data = months.map((m) => ({ ...m, label: dayjs(`${m.month}-01`).format("MMM") }));
  const best = Math.max(1, ...months.map((m) => m.days));
  const { domain, ticks } = niceAxisTicks(0, best, AXIS_TICK_COUNT, true);
  const config: ChartConfig = { days: { label: "Days trained", color: "var(--primary)" } };
  const first = months[0];
  const last = months[months.length - 1];
  const aria =
    first && last
      ? `Bar chart of days trained per month, ${dayjs(`${first.month}-01`).format("MMM YYYY")} to ${dayjs(`${last.month}-01`).format("MMM YYYY")}`
      : "Bar chart of days trained per month";
  return (
    <ChartContainer config={config} className="h-[200px] w-full min-w-0" role="img" aria-label={aria}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
        <Bar dataKey="days" fill="var(--primary)" radius={[3, 3, 0, 0]}>
          {data.map((m) => (
            <Cell
              key={m.month}
              fill={m.partial ? `url(#${patternId})` : "var(--primary)"}
              stroke={m.partial ? "var(--primary)" : "none"}
              strokeWidth={m.partial ? 1 : 0}
              data-partial={m.partial ? "true" : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function MixRow({ label, mix }: { label: string; mix: TrainingMix["recent"] }) {
  if (!mix) return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ModalityBar split={mix.split} classified />
    </div>
  );
}

export function TrainingPanel({
  months,
  mix,
  onSeeWorkouts,
}: {
  months: MonthDays[];
  mix: TrainingMix;
  onSeeWorkouts?: (() => void) | undefined;
}) {
  const recentLabel = `Last ${OVERVIEW_RECENT_DAYS} days`;
  return (
    <Card>
      <PanelHeader title="Showing up" caption={`Last ${OVERVIEW_CHART_MONTHS} months, by month`} />
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <MonthlyDaysChart months={months} />
          {months.some((m) => m.partial && m.days > 0) ? <InProgressKey /> : null}
        </div>
        <section aria-label="What it was made of" className="flex flex-col gap-3 border-t border-border pt-4">
          {mix.recent ? (
            <>
              <div className="flex flex-col gap-2">
                <MixRow label={recentLabel} mix={mix.recent} />
                <MixRow label={`The ${OVERVIEW_RECENT_DAYS} before`} mix={mix.prior} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {MODALITY_LIST.map((m) => (
                    <span key={m} className="text-xs text-muted-foreground tabular">
                      {MODALITY_SHORT_LABELS[m]} {Math.round(mix.recent!.split[m])}%
                    </span>
                  ))}
                </div>
                {mix.mostTrained.length ? (
                  <p className="text-sm">Most trained: {mix.mostTrained.map((d) => DOMAIN_SHORT_LABELS[d]).join(", ")}.</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No workouts in the last {OVERVIEW_RECENT_DAYS} days.</p>
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
  latest,
  today,
  onOpenSubject,
  onSeeProgress,
  onSeeTimeline,
}: {
  moved: ProgressRow[];
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
          <p className="text-sm text-muted-foreground">No lift or benchmark has changed enough to call.</p>
        )}

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

export function BodyPanel({
  readings,
  today,
  onSeeBody,
}: {
  readings: BodyReading[];
  today: string;
  onSeeBody?: (() => void) | undefined;
}) {
  return (
    <Card>
      <PanelHeader title="Body weight" {...(readings.length > 1 ? { caption: "Scans and weigh-ins" } : {})} />
      <CardContent className="flex flex-col gap-4">
        {readings.length > 1 ? (
          <WeightChart readings={readings} />
        ) : readings.length === 1 ? (
          <p className="text-sm">
            {weightText(readings[0]!.weightLb)} on {shortDate(readings[0]!.date, today)}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Upload an InBody export or add a weigh-in.</p>
        )}
        <PanelLink label="See body composition" onClick={onSeeBody} />
      </CardContent>
    </Card>
  );
}
