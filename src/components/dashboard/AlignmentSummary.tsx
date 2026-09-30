import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeWithinNoise } from "@/lib/analytics/bodyCompNoise";
import { formatDate, formatSignedDelta } from "./charts/chartUtils";
import type { AlignmentClassification, AlignmentResult } from "@/types/alignment";

interface AlignmentSummaryProps {
  alignment: AlignmentResult;
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

/** Same convention as PlateauSection's ClassificationBadge: achromatic except for the one state that reads as a positive read on the accent. */
function ClassificationBadge({ classification }: { classification: AlignmentClassification }) {
  return (
    <Badge variant={classification === "aligned" ? "default" : "secondary"}>
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  );
}

/**
 * Whole-athlete rollup of the per-lift reads on the Plateaus view, shown above
 * them — "are performance and body composition telling a consistent story, or
 * are they in tension?" It has no empty state of its own: it renders only once
 * LiftsTab has both datasets, which is the same gate `getAlignment` sits behind.
 */
export function AlignmentSummary({ alignment }: AlignmentSummaryProps) {
  const { classification, reason, performanceSummary, bodyCompSummary, tagNotes } = alignment;
  const hasWindow = bodyCompSummary.windowStart !== "" && bodyCompSummary.windowEnd !== "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <ClassificationBadge classification={classification} />
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {classification === "insufficient_data" ? reason : CLASSIFICATION_COPY[classification]}
          </p>
          {tagNotes?.map((note) => (
            <p key={note} className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {note}
            </p>
          ))}
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
                {formatSignedDelta(bodyCompSummary.leanMassDelta, " lb")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fat mass</dt>
              <dd className="tabular text-lg font-medium">
                {formatSignedDelta(bodyCompSummary.fatMassDelta, " lb")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Body fat</dt>
              <dd className="tabular text-lg font-medium">
                {formatSignedDelta(bodyCompSummary.bodyFatPctDelta, "%")}
              </dd>
            </div>
          </dl>
          {describeWithinNoise(bodyCompSummary) ? (
            <p className="mt-3 text-xs text-muted-foreground">{describeWithinNoise(bodyCompSummary)}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
