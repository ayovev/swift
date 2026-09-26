import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import inbodyLogo from "@/assets/inbody-logo.png";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import { BodyCompLineChart } from "./charts/BodyCompLineChart";
import { ConsistencyChart } from "./charts/ConsistencyChart";
import { FilePickerButton } from "./FilePickerButton";
import { buildBodyCompData } from "@/lib/analytics/buildBodyCompData";
import { GRANULARITY_NOUN, type Granularity } from "@/lib/analytics/granularity";
import type { BodyCompPoint } from "@/types/bodyComp";
import type { BucketCount, DashboardData } from "@/types/dashboard";
import type { InBodyRow } from "@/types/inbody";

export type BodyCompState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: InBodyRow[] };

interface BodyCompTabProps {
  state: BodyCompState;
  granularity: Granularity;
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
export function BodyCompTab({ state, granularity, onFile, dashboard }: BodyCompTabProps) {
  const data = useMemo(
    () => (state.status === "ready" ? buildBodyCompData(state.rows, granularity) : null),
    [state, granularity]
  );

  if (!data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <InBodySourceMark />
          <CardTitle className="text-base">Body composition</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Add your InBody export to see weight, body fat, and skeletal muscle mass trends
            alongside your training. This is entirely separate from your SugarWOD log — nothing
            is matched between the two files, they just share the same kind of timeline.
          </p>

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>That file didn't work</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <UploadDropzone
            loading={state.status === "loading"}
            onFile={onFile}
            ariaLabel="Upload your InBody CSV export"
            loadingLabel="Reading your body composition history…"
            loadingHint="This only takes a moment."
            hint="The .csv file the InBody app gives you from Export"
          />
          <p className="text-xs text-muted-foreground">Your file never leaves this browser.</p>
        </CardContent>
      </Card>
    );
  }

  const latest = data.points[data.points.length - 1];
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
          <div className="flex flex-row items-center gap-3">
            <InBodySourceMark />
            <CardTitle className="text-base">Body composition</CardTitle>
          </div>
          <FilePickerButton onFile={onFile}>Replace file</FilePickerButton>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            From your InBody export, tracked {GRANULARITY_NOUN[granularity]} by{" "}
            {GRANULARITY_NOUN[granularity]} — never matched to any individual workout.
          </p>
          <p className="text-sm text-muted-foreground tabular">
            {data.points.length.toLocaleString()} {GRANULARITY_NOUN[granularity]}
            {data.points.length === 1 ? "" : "s"} of scans
            {latest ? `, most recent in ${latest.bucket}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {hasEnoughHistory ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">Days trained</h3>
                  <span className="text-xs text-muted-foreground tabular">
                    {totalTrainingDays.toLocaleString()} total
                  </span>
                </div>
                <ConsistencyChart
                  buckets={trainingDayBuckets}
                  granularity={granularity}
                  seriesLabel="Days trained"
                  className="h-[200px] w-full min-w-0"
                />
              </div>
              {METRICS.map((m) => (
                <BodyCompLineChart
                  key={m.key}
                  seriesLabel={m.label}
                  unit={m.unit}
                  granularity={granularity}
                  data={data.points.map((p) => ({ bucket: p.bucket, value: p[m.key] }))}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough scans yet to chart a trend — add a few more InBody exports over time.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
