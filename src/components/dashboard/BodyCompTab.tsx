import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import { BodyCompLineChart } from "./charts/BodyCompLineChart";
import { buildBodyCompData } from "@/lib/analytics/buildBodyCompData";
import { GRANULARITY_NOUN, type Granularity } from "@/lib/analytics/granularity";
import type { BodyCompPoint } from "@/types/bodyComp";
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
}

const METRICS: { key: Exclude<keyof BodyCompPoint, "bucket">; label: string; unit: string }[] = [
  { key: "weight", label: "Weight", unit: "lb" },
  { key: "bodyFatPct", label: "Body fat", unit: "%" },
  { key: "skeletalMuscleMass", label: "Skeletal muscle mass", unit: "lb" },
  { key: "bmi", label: "BMI", unit: "" },
  { key: "inbodyScore", label: "InBody Score", unit: "" },
];

/**
 * Body composition, from an independently-uploaded InBody export. Fully
 * optional and never joined to the SugarWOD data row-for-row — the two
 * datasets only share a bucketing scheme (bucketKey/Granularity), so a
 * body-comp trend line can sit on the same kind of timeline as the training
 * charts without Swift ever matching a scan to a workout.
 */
export function BodyCompTab({ state, granularity, onFile }: BodyCompTabProps) {
  const data = useMemo(
    () => (state.status === "ready" ? buildBodyCompData(state.rows, granularity) : null),
    [state, granularity]
  );

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Body composition</CardTitle>
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
