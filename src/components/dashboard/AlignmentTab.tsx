import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import { formatDate } from "./charts/chartUtils";
import type { BodyCompState } from "./BodyCompTab";
import type { AlignmentClassification, AlignmentResult } from "@/types/alignment";

interface AlignmentTabProps {
  alignment: AlignmentResult | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
}

/**
 * Deliberately no good/bad framing (see the spec's copy notes): "aligned"
 * states the two signals agree, "tension" states they don't — neither is a
 * value judgment on whether the athlete's trajectory is desirable.
 */
const CLASSIFICATION_COPY: Record<AlignmentClassification, string> = {
  aligned: "Your performance and body composition are telling a consistent story right now.",
  tension: "Your performance and body composition are moving in different directions — might be worth understanding why.",
  insufficient_data: "",
};

const CLASSIFICATION_LABEL: Record<AlignmentClassification, string> = {
  aligned: "Aligned",
  tension: "Tension",
  insufficient_data: "Not enough data yet",
};

/** Same convention as PlateauTab's ClassificationBadge: achromatic except for the one state that reads as a positive read on the accent. */
function ClassificationBadge({ classification }: { classification: AlignmentClassification }) {
  return (
    <Badge variant={classification === "aligned" ? "default" : "secondary"}>
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  );
}

function formatDelta(delta: number | null, unit: string): string {
  if (delta === null) return "no data";
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

/**
 * Whole-athlete rollup of the Plateau Detector (PlateauTab) plus the same
 * InBody history — "are performance and body composition telling a
 * consistent story, or are they in tension?" Needs both datasets, so this
 * stays a static empty state (reusing BodyCompTab's own upload entry point)
 * until InBody data is loaded, same treatment as PlateauTab.
 */
export function AlignmentTab({ alignment, bodyComp, onBodyCompFile }: AlignmentTabProps) {
  if (!alignment) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alignment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Rolls up the plateau detector's per-lift and per-benchmark reads into one
            whole-athlete view: whether performance and body composition are telling the
            same story right now. Needs an InBody export in addition to the SugarWOD log
            already loaded.
          </p>

          {bodyComp.status === "error" ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>That file didn't work</AlertTitle>
              <AlertDescription>{bodyComp.message}</AlertDescription>
            </Alert>
          ) : null}

          <UploadDropzone
            loading={bodyComp.status === "loading"}
            onFile={onBodyCompFile}
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

  const { classification, reason, performanceSummary, bodyCompSummary } = alignment;
  const hasWindow = bodyCompSummary.windowStart !== "" && bodyCompSummary.windowEnd !== "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alignment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ClassificationBadge classification={classification} />
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {classification === "insufficient_data" ? reason : CLASSIFICATION_COPY[classification]}
          </p>
          {hasWindow ? (
            <p className="text-xs text-muted-foreground">
              Comparison window: {formatDate(bodyCompSummary.windowStart)} —{" "}
              {formatDate(bodyCompSummary.windowEnd)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Improving</dt>
              <dd className="tabular text-lg font-medium">{performanceSummary.improvingCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Plateaued</dt>
              <dd className="tabular text-lg font-medium">{performanceSummary.plateauedCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Classified lifts/WODs</dt>
              <dd className="tabular text-lg font-medium">{performanceSummary.classifiedCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Body composition</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Lean mass</dt>
              <dd className="tabular text-lg font-medium">
                {formatDelta(bodyCompSummary.leanMassDelta, " lb")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fat mass</dt>
              <dd className="tabular text-lg font-medium">
                {formatDelta(bodyCompSummary.fatMassDelta, " lb")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Body fat</dt>
              <dd className="tabular text-lg font-medium">
                {formatDelta(bodyCompSummary.bodyFatPctDelta, "%")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
