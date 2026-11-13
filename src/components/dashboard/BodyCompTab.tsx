import { useMemo, useRef } from "react";
import inbodyLogo from "@/assets/inbody-logo.png";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InBodyUploadPrompt } from "./InBodyUploadPrompt";
import { BodyCompLineChart } from "./charts/BodyCompLineChart";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { RangeStrip, useRangeDrag } from "./charts/RangeDrag";
import { FilePickerButton } from "./FilePickerButton";
import { ChartViewToggle, DataTable, useChartView } from "./charts/ChartTable";
import { withUnit } from "./charts/BodyCompLineChart";
import { buildBodyCompData, filterInBodyRowsByRange } from "@/lib/analytics/buildBodyCompData";
import type { DateRange } from "@/lib/analytics/dateRange";
import { GRANULARITY_NOUN, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";
import type { BodyCompPoint } from "@/types/bodyComp";
import type { BucketCount, DashboardData } from "@/types/dashboard";
import type { InBodyRow } from "@/types/inbody";
import type { WeighIn } from "@/types/weighIn";
import { readingsFromInBody } from "@/lib/analytics/insights/bodyReadings";
import { longDate } from "@/lib/analytics/insights/display";
import { WeighInsPanel } from "./WeighInsPanel";

export type BodyCompState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: InBodyRow[] };

interface BodyCompTabProps {
  state: BodyCompState;
  granularity: Granularity;
  /** The dashboard's selected date range; scans outside it are left out. `null` is all time. */
  range: DateRange | null;
  /** The days the charts cover, YYYY-MM-DD (the range, or the whole log), so a drag is held inside them. */
  coverage?: { start: string; end: string } | undefined;
  /** Sets the date range from a drag across a chart (see RangeDrag.tsx). */
  onSelectRange?: ((start: string, end: string) => void) | undefined;
  onFile: (file: File) => void;
  /**
   * The SugarWOD dashboard data, used only to look up how many days were
   * trained in each bucket a scan also falls in — see the "Days trained"
   * chart below. Nothing from InBodyRow and nothing from SugarWodRow is ever
   * combined row-for-row; this is the same bucket-key alignment
   * buildBodyCompData's own header comment describes, just read from the
   * other side.
   */
  dashboard: DashboardData;
  /** Manual weigh-ins and how to change them; the panel is hidden when these are not given. */
  weighIns?: readonly WeighIn[];
  onSaveWeighIn?: (weighIn: WeighIn) => void;
  onDeleteWeighIn?: (date: string) => void;
}

const METRICS: { key: Exclude<keyof BodyCompPoint, "bucket">; label: string; unit: string }[] = [
  { key: "weight", label: "Weight", unit: "lb" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
  { key: "skeletalMuscleMass", label: "Skeletal muscle mass", unit: "lb" },
  { key: "bmi", label: "BMI", unit: "" },
  { key: "inbodyScore", label: "InBody Score", unit: "" },
];

/**
 * The data source's own mark, not Swift's — kept in its native colour on a
 * fixed white chip in both themes, the usual treatment for a partner's
 * trademark (it isn't ours to recolour into the accent system).
 */
function InBodySourceMark() {
  return (
    <div className="flex h-8 shrink-0 items-center rounded-md border border-border bg-white px-2.5 shadow-sm">
      <img src={inbodyLogo} alt="InBody" className="h-4 w-auto" />
    </div>
  );
}

/**
 * Body composition, from an independently-uploaded InBody export. Fully
 * optional and never joined to the SugarWOD data row-for-row — the two
 * datasets only share a bucketing scheme (bucketKey/Granularity), so a
 * body-comp trend line can sit on the same kind of timeline as the training
 * charts without Swift ever matching a scan to a workout. The "Days trained"
 * chart below applies the same bucket-key alignment in the other direction:
 * it reads `dashboard.days_buckets` for the same bucket keys the scan data
 * already uses, never a specific InBody row against a specific workout row.
 */
export function BodyCompTab({ state, granularity, range, coverage, onSelectRange, onFile, dashboard, weighIns, onSaveWeighIn, onDeleteWeighIn }: BodyCompTabProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const scanReadings = useMemo(() => (state.status === "ready" ? readingsFromInBody(state.rows) : []), [state]);
  const [view] = useChartView();
  const weighInsPanel =
    weighIns && onSaveWeighIn && onDeleteWeighIn ? <WeighInsPanel scans={scanReadings} weighIns={weighIns} onSave={onSaveWeighIn} onDelete={onDeleteWeighIn} /> : null;
  const data = useMemo(
    () =>
      state.status === "ready"
        ? buildBodyCompData(filterInBodyRowsByRange(state.rows, range), granularity)
        : null,
    [state, granularity, range]
  );

  // One strip for the trend charts on a touch screen. Its buckets are every bucket with a scan, which is what the bar chart draws in
  // equal bands; the line charts skip a bucket a scan did not measure, so they take mouse drags of their own.
  const strip = useRangeDrag({
    containerRef: gridRef,
    hostRef: stripRef,
    buckets: data?.points.map((p) => p.bucket) ?? [],
    granularity,
    coverage,
    layout: { kind: "bands" },
    onSelect: onSelectRange,
  });

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <InBodyUploadPrompt state={state} onFile={onFile}
          header={<InBodySourceMark />}>
          Add your InBody export to see weight, body fat, and skeletal muscle mass trends
              alongside your training. This is entirely separate from your SugarWOD log — nothing
              is matched between the two files, they just share the same kind of timeline.
        </InBodyUploadPrompt>
        {weighInsPanel}
      </div>
    );
  }

  // The newest scan inside the range, as a date: the bucket key ("2026-11") read as a code, not a day.
  const latestScan = readingsFromInBody(filterInBodyRowsByRange(state.status === "ready" ? state.rows : [], range)).reduce<string | null>(
    (max, r) => (max === null || r.date > max ? r.date : max),
    null
  );
  const hasEnoughHistory = data.points.length >= 2;

  // Days trained in the same buckets the scan history covers — aligned by
  // bucket key only (see the component doc comment above), falling back to 0
  // for a scan bucket with no matching training bucket at all.
  const dayCountByBucket = new Map(dashboard.days_buckets.map((b) => [b.bucket, b.count]));
  const trainingDayBuckets: BucketCount[] = data.points.map((p) => ({
    bucket: p.bucket,
    count: dayCountByBucket.get(p.bucket) ?? 0,
  }));
  const totalTrainingDays = trainingDayBuckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <InBodySourceMark />
          <FilePickerButton onFile={onFile}>Replace file</FilePickerButton>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            From your InBody export, tracked {GRANULARITY_NOUN[granularity]} by{" "}
            {GRANULARITY_NOUN[granularity]} — never matched to any individual workout.
          </p>
          <p className="text-sm text-muted-foreground tabular">
            {data.points.length.toLocaleString()} {GRANULARITY_NOUN[granularity]}
            {data.points.length === 1 ? "" : "s"} with a scan
            {latestScan ? `, most recent ${longDate(latestScan)}` : ""}
          </p>
        </CardContent>
      </Card>

      {/* Trends before the reading list: overview first, the 100-odd rows behind it after. */}
      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-2">
          <CardTitle className="text-sm font-medium">Trends</CardTitle>
          {hasEnoughHistory ? <ChartViewToggle /> : null}
        </CardHeader>
        <CardContent>
          {hasEnoughHistory && view === "table" ? (
            // Every trend's buckets in one table, most recent first: each chart above is one column of it.
            <DataTable
              caption={`Days trained and body composition, ${GRANULARITY_NOUN[granularity]} by ${GRANULARITY_NOUN[granularity]}, each a ${GRANULARITY_NOUN[granularity]}'s average of its scans`}
              columns={[{ label: GRANULARITY_NOUN[granularity][0]!.toUpperCase() + GRANULARITY_NOUN[granularity].slice(1) }, { label: "Days trained", numeric: true }, ...METRICS.map((m) => ({ label: m.label, numeric: true }))]}
              rows={[...data.points].reverse().map((p) => [
                formatBucketLabel(p.bucket, granularity),
                dayCountByBucket.get(p.bucket) ?? 0,
                ...METRICS.map((m) => (p[m.key] === null ? "—" : withUnit(Number(p[m.key]).toFixed(1), m.unit))),
              ])}
            />
          ) : hasEnoughHistory ? (
            <>
            {strip.enabled ? (
              <div className="mb-4">
                <RangeStrip handlers={strip.strip} stripRef={stripRef} drag={strip.drag} />
                <p className="hidden text-xs text-muted-foreground pointer-fine:block">Drag across a chart to set the date range.</p>
              </div>
            ) : null}
            <div ref={gridRef} className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">Days trained</h2>
                  {/* Only the buckets with a scan are charted, so this is not the all-time count on Overview; it says which it is. */}
                  <span className="text-xs text-muted-foreground tabular">
                    {totalTrainingDays.toLocaleString()} in {GRANULARITY_NOUN[granularity]}s with a scan
                  </span>
                </div>
                <ConsistencyChart
                  buckets={trainingDayBuckets}
                  granularity={granularity}
                  seriesLabel="Days trained"
                  className="h-[200px] w-full min-w-0"
                  coverage={coverage}
                  onRangeSelect={onSelectRange}
                />
              </div>
              {METRICS.map((m) => (
                <BodyCompLineChart
                  key={m.key}
                  seriesLabel={m.label}
                  unit={m.unit}
                  granularity={granularity}
                  coverage={coverage}
                  onRangeSelect={onSelectRange}
                  data={data.points.map((p) => ({ bucket: p.bucket, value: p[m.key] }))}
                />
              ))}
            </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {range
                ? "Fewer than two scans fall in this date range. Widen the range to chart a trend."
                : "Not enough scans yet to chart a trend — add a few more InBody exports over time."}
            </p>
          )}
        </CardContent>
      </Card>

      {weighInsPanel}
    </div>
  );
}
