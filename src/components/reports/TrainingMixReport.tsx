import dayjs from "dayjs";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DataTable, seriesSummary, type ChartView } from "@/components/dashboard/charts/ChartTable";
import { FIXED_MODALITY_COLORS, MODALITY_DRAW_ORDER, TIME_AXIS_PROPS, modalityKeyLabel, splitText } from "@/components/dashboard/charts/chartUtils";
import type { TrainingMixData } from "@/lib/analytics/trainingMix";
import { DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_NAMES } from "@/types/modality";

/** Which sections of the Training mix report are printed (docs/reports.md, R-3). The summary line is always there. */
export interface TrainingMixSections {
  days: boolean;
  mix: boolean;
  domains: boolean;
  movements: boolean;
}

export const monthLabel = (month: string): string => dayjs(`${month}-01`).format("MMM YY");
export const monthName = (month: string, partial: boolean): string => `${monthLabel(month)}${partial ? " (part)" : ""}`;
export const pct = (v: number): string => `${v.toFixed(0)}%`;

/** A chart as the report prints it: the chart with its summary as its name, or its table twin, and the summary sentence after either (R-6). */
export function ChartBlock({ title, summary, view, table, children }: { title: string; summary: string; view: ChartView; table: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="report-card">
      <h3 className="report-heading text-lg font-semibold">{title}</h3>
      <div className="mt-2">{view === "table" ? table : <div role="img" aria-label={summary}>{children}</div>}</div>
      <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
    </section>
  );
}

/** Days trained per month as a chart, or its table twin, with its summary sentence. Shared by the Training mix and Body and training reports. */
export function DaysTrainedBlock({ months, view }: { months: TrainingMixData["months"]; view: ChartView }) {
  const points = months.map((m) => ({ label: monthName(m.month, m.partial), value: m.days }));
  const summary = seriesSummary("Days trained per month", points, (v) => `${v} ${v === 1 ? "day" : "days"}`);
  return (
    <div data-testid="mix-days">
      <ChartBlock
        title="Days trained per month"
        summary={summary}
        view={view}
        table={
          <DataTable
            caption="Days trained per month"
            columns={[{ label: "Month" }, { label: "Days trained", numeric: true }]}
            rows={[...months].reverse().map((m) => [monthName(m.month, m.partial), m.days])}
          />
        }
      >
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" {...TIME_AXIS_PROPS} interval={0} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Bar dataKey="value" name="Days trained" fill="var(--primary)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartBlock>
    </div>
  );
}

/**
 * The Training mix report's body: how much was trained, and what it was made of. Every figure is the Training views' own for the period
 * (`trainingMix.ts`). The domains and the modalities keep their two forms, because they mean different things: the ten domains are tags
 * a workout can carry many of (shares overlap and add to well over 100%), the three modalities are one workout's split (they add to 100).
 */
export function TrainingMixReport({ data, sections, view }: { data: TrainingMixData; sections: TrainingMixSections; view: ChartView }) {
  const span = data.start ? `${dayjs(data.start).format("MMM D, YYYY")} to ${dayjs(data.end).format("MMM D, YYYY")}` : `through ${dayjs(data.end).format("MMM D, YYYY")}`;

  if (data.workouts === 0) {
    return (
      <section className="report-card" data-testid="mix-empty">
        <p className="text-sm">No workouts were logged in this period.</p>
      </section>
    );
  }

  const mixRows = data.mix.map((m) => ({ label: monthName(m.month, m.partial), split: m.split, workouts: m.workouts }));
  const mixSummary = data.split
    ? `Average split of a classified workout, ${span}: ${splitText(data.split)}. Each month adds to 100.`
    : "No workout in this period had a recognized movement, so there is no M/W/G split.";

  const top = data.domains[0]!;
  const bottom = data.domains[data.domains.length - 1]!;
  const domainSummary = `Share of workouts touching each domain, ${span}. Highest ${DOMAIN_SHORT_LABELS[top.domain]} ${pct(top.pct)}, lowest ${DOMAIN_SHORT_LABELS[bottom.domain]} ${pct(bottom.pct)}. A workout counts in every domain it touches, so the shares add up to more than 100%.`;

  return (
    <>
      <section className="report-card" data-testid="mix-summary">
        <p className="text-sm">
          <span className="font-medium">{data.workouts.toLocaleString()}</span> {data.workouts === 1 ? "workout" : "workouts"} on <span className="font-medium">{data.days.toLocaleString()}</span> training {data.days === 1 ? "day" : "days"}, {span}.
        </p>
      </section>

      {sections.days ? <DaysTrainedBlock months={data.months} view={view} /> : null}

      {sections.mix ? (
        <div data-testid="mix-modalities">
          <ChartBlock
            title="M/W/G split per month"
            summary={mixSummary}
            view={view}
            table={
              <DataTable
                caption="M/W/G split per month"
                columns={[{ label: "Month" }, ...MODALITY_DRAW_ORDER.map((m) => ({ label: modalityKeyLabel(m), numeric: true })), { label: "Workouts", numeric: true }]}
                rows={[...mixRows].reverse().map((r) => [r.label, ...MODALITY_DRAW_ORDER.map((m) => (r.split ? r.split[m].toFixed(1) : "none")), r.workouts])}
              />
            }
          >
            <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {MODALITY_DRAW_ORDER.map((m) => (
                <li key={m} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: FIXED_MODALITY_COLORS[m] }} />
                  {modalityKeyLabel(m)} <span className="sr-only">({MODALITY_NAMES[m]})</span>
                </li>
              ))}
            </ul>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mixRows.map((r) => ({ label: r.label, W: r.split?.W ?? 0, G: r.split?.G ?? 0, M: r.split?.M ?? 0 }))}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" {...TIME_AXIS_PROPS} interval={0} tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} width={42} />
                  {MODALITY_DRAW_ORDER.map((m) => (
                    <Bar key={m} dataKey={m} name={modalityKeyLabel(m)} stackId="mix" fill={FIXED_MODALITY_COLORS[m]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartBlock>
        </div>
      ) : null}

      {sections.domains ? (
        <div data-testid="mix-domains">
          <ChartBlock
            title="The ten domains"
            summary={domainSummary}
            view={view}
            table={
              <DataTable
                caption="Share of workouts touching each domain"
                columns={[{ label: "Domain" }, { label: "Workouts", numeric: true }, { label: "Share", numeric: true }]}
                rows={data.domains.map((d) => [DOMAIN_SHORT_LABELS[d.domain], d.count, pct(d.pct)])}
              />
            }
          >
            <ul className="flex flex-col gap-1 text-sm">
              {data.domains.map((d) => (
                <li key={d.domain} className="report-row grid grid-cols-[7.5rem_1fr_3rem] items-center gap-x-3">
                  <span>{DOMAIN_SHORT_LABELS[d.domain]}</span>
                  <span className="relative h-2 rounded-full bg-muted" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${d.pct}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{pct(d.pct)}</span>
                </li>
              ))}
            </ul>
          </ChartBlock>
        </div>
      ) : null}

      {sections.movements && data.movements.length > 0 ? (
        <section data-testid="mix-movements" className="report-card">
          <h3 className="report-heading text-lg font-semibold">Most-used movements</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.movements.map((m) => (
              <li key={m.id} className="report-row flex items-baseline justify-between gap-4 py-1.5">
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {m.count} {m.count === 1 ? "workout" : "workouts"} · {m.pct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Workouts that include the movement, out of all workouts in the period. A workout can include several.</p>
        </section>
      ) : null}

      {data.unclassified > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="mix-unclassified">
          {data.unclassified.toLocaleString()} of {data.workouts.toLocaleString()} entries had no recognized movement and sit outside the M/W/G split.
        </p>
      ) : null}
    </>
  );
}
