import dayjs from "dayjs";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { headlineLabelClass } from "@/components/dashboard/progress/verdictMark";
import { DataTable, seriesSummary, type ChartView } from "@/components/dashboard/charts/ChartTable";
import { TIME_AXIS_PROPS, formatTimeTick, niceAxisTicks, niceTimeTicks } from "@/components/dashboard/charts/chartUtils";
import { bandSentence, weightChangeSentence, type BodyTrainingData } from "@/lib/analytics/bodyTraining";
import { noHeadlineText } from "@/lib/analytics/insights/display";
import { headlineSentence } from "@/lib/analytics/insights/headline";
import { entryName, entrySpanText } from "@/lib/analytics/timeline";
import { AREA_LABEL, INITIATION_LABEL, type TimelineEntry } from "@/types/timeline";
import { ChartBlock, DaysTrainedBlock } from "./TrainingMixReport";

/** Which sections of the Body and training report are printed (docs/reports.md, R-3). */
export interface BodyTrainingSections {
  weight: boolean;
  /** Lean and fat mass: scans only; starts on when the athlete has scans. */
  leanFat: boolean;
  days: boolean;
  headline: boolean;
  entries: boolean;
}

const lb = (x: number): string => String(Number(x.toFixed(1)));
const day = (iso: string): string => dayjs(iso).format("MMM D, YYYY");
const ms = (iso: string): number => dayjs(iso).valueOf();

interface SeriesSpec {
  key: "weightLb" | "leanLb" | "fatLb";
  label: string;
  /** Solid or dashed, so two lines never rest on color. */
  dashed?: boolean;
  stroke: string;
}

/**
 * Body readings over time on a real date axis (a gap in the readings is a gap on the chart, never closed up), with each Timeline entry that
 * touches the period shaded and numbered, the numbers matching the list under the chart. Every reading is a dot: nothing is smoothed.
 */
function BodyLines({ data, series }: { data: BodyTrainingData; series: SeriesSpec[] }) {
  const rows = data.readings.map((r) => ({ t: ms(r.date), weightLb: r.weightLb, leanLb: r.leanLb ?? null, fatLb: r.fatLb ?? null }));
  const t0 = rows[0]!.t;
  const t1 = Math.max(rows.at(-1)!.t, t0 + 86_400_000);
  const values = rows.flatMap((r) => series.map((s) => r[s.key]).filter((v): v is number => typeof v === "number"));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const y = niceAxisTicks(lo - pad, hi + pad);
  const x = niceTimeTicks(t0, t1);
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="t"
            domain={[t0, t1]}
            ticks={x.ticks}
            interval={0}
            tickFormatter={(t: number) => formatTimeTick(t, x.unit)}
            tick={{ fontSize: 10 }}
            {...TIME_AXIS_PROPS}
          />
          <YAxis domain={y.domain} ticks={y.ticks} tick={{ fontSize: 11 }} width={42} />
          {data.entries.map((e, i) => (
            <ReferenceArea
              key={e.id}
              x1={Math.max(ms(e.startDate), t0)}
              x2={Math.min(e.endDate ? ms(e.endDate) : ms(data.end), t1)}
              fill="var(--muted-foreground)"
              fillOpacity={0.12}
              label={{ value: String(i + 1), position: "insideTop", fontSize: 10, fill: "var(--muted-foreground)" }}
              ifOverflow="hidden"
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.label}
              stroke={s.stroke}
              strokeWidth={2}
              {...(s.dashed ? { strokeDasharray: "6 4" } : {})}
              dot={{ r: 3, fill: s.stroke }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EntryList({ entries }: { entries: readonly TimelineEntry[] }) {
  return (
    <ol className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground" data-testid="body-entry-key">
      {entries.map((e, i) => (
        <li key={e.id}>
          <span className="font-medium text-foreground">{i + 1}. {entryName(e)}</span> · {INITIATION_LABEL[e.initiation]} · {AREA_LABEL[e.area]} · {entrySpanText(e)}
        </li>
      ))}
    </ol>
  );
}

/**
 * The Body and training report's body: body weight (with its noise band), lean and fat mass from scans, days trained per month, and the
 * Progress headline as of the end, side by side. Nothing relates one to the other: body composition feeds no verdict, and the report says
 * no sentence about one changing the other.
 */
export function BodyTrainingReport({ data, sections, view }: { data: BodyTrainingData; sections: BodyTrainingSections; view: ChartView }) {
  const span = data.start ? `${day(data.start)} to ${day(data.end)}` : `through ${day(data.end)}`;
  const weightPoints = data.readings.map((r) => ({ label: day(r.date), value: r.weightLb }));
  const changeText = weightChangeSentence(data);
  const marked = data.entries.length > 0;

  return (
    <>
      {sections.weight ? (
        <div data-testid="body-weight">
          {data.readings.length === 0 ? (
            <section className="report-card">
              <h3 className="report-heading text-lg font-semibold">Body weight</h3>
              <p className="mt-1 text-sm">No body readings fall in this period.</p>
            </section>
          ) : (
            <>
              <ChartBlock
                title="Body weight"
                summary={`${seriesSummary(`Body weight, ${data.readings.length} ${data.readings.length === 1 ? "reading" : "readings"} (${data.scanReadings} from scans, ${data.weighInReadings} from weigh-ins)`, weightPoints, (v) => `${lb(v)} lb`)}${changeText ? ` ${changeText}` : ""} ${bandSentence(data.bandLb)}`}
                view={view}
                table={
                  <DataTable
                    caption="Body weight readings"
                    columns={[{ label: "Date" }, { label: "Weight (lb)", numeric: true }]}
                    rows={[...data.readings].reverse().map((r) => [day(r.date), lb(r.weightLb)])}
                  />
                }
              >
                <BodyLines data={data} series={[{ key: "weightLb", label: "Body weight (lb)", stroke: "var(--primary)" }]} />
                {marked ? <p className="mt-1 text-xs text-muted-foreground">Shaded bands are Timeline entries that touch the period, numbered as listed below.</p> : null}
              </ChartBlock>
              {marked && view === "chart" ? <EntryList entries={data.entries} /> : null}
            </>
          )}
        </div>
      ) : null}

      {sections.leanFat && data.hasLeanFat ? (
        <div data-testid="body-leanfat">
          <ChartBlock
            title="Lean and fat mass"
            summary={`Lean mass and fat mass from InBody scans, ${span}. Weigh-ins do not report them.`}
            view={view}
            table={
              <DataTable
                caption="Lean and fat mass from scans"
                columns={[{ label: "Date" }, { label: "Lean mass (lb)", numeric: true }, { label: "Fat mass (lb)", numeric: true }]}
                rows={[...data.readings].filter((r) => r.leanLb !== undefined || r.fatLb !== undefined).reverse().map((r) => [day(r.date), r.leanLb !== undefined ? lb(r.leanLb) : "none", r.fatLb !== undefined ? lb(r.fatLb) : "none"])}
              />
            }
          >
            {/* Two charts, each on its own scale: lean and fat mass differ several times over, so one shared axis would flatten the smaller line. */}
            {(
              [
                { key: "leanLb", title: "Lean mass (lb)", dashed: false },
                { key: "fatLb", title: "Fat mass (lb)", dashed: true },
              ] as const
            ).map(({ key, title, dashed }) => {
              const readings = data.readings.filter((r) => r[key] !== undefined);
              return readings.length > 0 ? (
                <div key={key} className="mb-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
                  <BodyLines data={{ ...data, readings }} series={[{ key, label: title, stroke: dashed ? "var(--foreground)" : "var(--primary)", dashed }]} />
                </div>
              ) : null;
            })}
          </ChartBlock>
        </div>
      ) : null}

      {sections.days && data.mix.months.length > 0 ? <DaysTrainedBlock months={data.mix.months} view={view} /> : null}

      {sections.headline ? (
        <section className="report-card" data-testid="body-headline">
          <h3 className="report-heading text-lg font-semibold">
            Progress as of {day(data.end)}: <span className={data.headline.label ? headlineLabelClass(data.headline.label) : ""}>{data.headline.label ?? "No headline yet"}</span>
          </h3>
          <p className="mt-1 text-sm">
            {data.headline.label ? headlineSentence(data.headline.label, data.headline.up, data.headline.down, data.headline.noClearChange) : noHeadlineText(data.headline)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Shown beside the body data. This report does not relate them.</p>
        </section>
      ) : null}

      {sections.entries && marked && (view === "table" || !sections.weight || data.readings.length === 0) ? (
        <section className="report-card" data-testid="body-entries">
          <h3 className="report-heading text-lg font-semibold">Timeline entries in this period</h3>
          <EntryList entries={data.entries} />
        </section>
      ) : null}
    </>
  );
}
