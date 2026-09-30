import { Badge } from "@/components/ui/badge";
import { describeWithinNoise } from "@/lib/analytics/bodyCompNoise";
import { formatSignedDelta } from "./charts/chartUtils";
import type { ExperimentClassification, ExperimentInsight } from "@/types/experiment";

const CLASSIFICATION_LABEL: Record<ExperimentClassification, string> = {
  improved: "Improved",
  declined: "Declined",
  no_change: "No change",
  mixed: "Mixed",
  insufficient_data: "Not enough data yet",
};

/**
 * "improved" reads as a value judgment the others deliberately don't — it's
 * the one clean positive read, same convention as PlateauSection's "improving"
 * and AlignmentSummary's "aligned". `mixed` gets copy that frames it as a real,
 * informative outcome rather than an incomplete one (see the spec's own
 * "an inconclusive result, worth a closer look" framing).
 */
const CLASSIFICATION_COPY: Record<ExperimentClassification, string> = {
  improved: "Performance improved after this started, without body composition working against it.",
  declined: "Performance declined after this started.",
  no_change: "No meaningful change in performance or body composition since this started.",
  mixed: "Performance and body composition moved in different directions — an inconclusive result, worth a closer look.",
  insufficient_data: "",
};

export function ClassificationBadge({ classification }: { classification: ExperimentClassification }) {
  return (
    <Badge variant={classification === "improved" ? "default" : "secondary"}>
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  );
}

/**
 * What a saved experiment's before/after comparison found: the classification,
 * one sentence saying what it means, and the counts and body-comp deltas behind
 * it. An `insufficient_data` verdict shows its own reason and no numbers.
 */
export function ExperimentVerdict({ insight }: { insight: ExperimentInsight }) {
  return (
    <div className="flex flex-col gap-3">
      <ClassificationBadge classification={insight.classification} />
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {insight.classification === "insufficient_data" ? insight.reason : CLASSIFICATION_COPY[insight.classification]}
      </p>
      {insight.classification !== "insufficient_data" ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Improving</dt>
            <dd className="tabular text-lg font-medium">{insight.performanceSummary.improvingCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Declining</dt>
            <dd className="tabular text-lg font-medium">{insight.performanceSummary.decliningCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Flat</dt>
            <dd className="tabular text-lg font-medium">{insight.performanceSummary.flatCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Compared</dt>
            <dd className="tabular text-lg font-medium">{insight.performanceSummary.classifiedCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lean mass</dt>
            <dd className="tabular text-sm">{formatSignedDelta(insight.bodyCompSummary.leanMassDelta, " lb")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fat mass</dt>
            <dd className="tabular text-sm">{formatSignedDelta(insight.bodyCompSummary.fatMassDelta, " lb")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Body fat</dt>
            <dd className="tabular text-sm">{formatSignedDelta(insight.bodyCompSummary.bodyFatPctDelta, "%")}</dd>
          </div>
        </dl>
      ) : null}
      {insight.classification !== "insufficient_data" && describeWithinNoise(insight.bodyCompSummary) ? (
        <p className="text-xs text-muted-foreground">{describeWithinNoise(insight.bodyCompSummary)}</p>
      ) : null}
    </div>
  );
}
