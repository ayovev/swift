import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeWithinNoise } from "@/lib/analytics/bodyCompNoise";
import { formatDate, formatSignedDelta } from "./charts/chartUtils";
import { ATTRIBUTION_LABEL } from "./strengthLabels";
import { RS_WINDOW_DAYS } from "@/lib/analytics/insightConfig";
import type { LiftRelativeStrength } from "@/lib/analytics/relativeStrength";
import type { PlateauClassification, PlateauInsight } from "@/types/plateau";

interface PlateauSectionProps {
  plateauInsights: PlateauInsight[];
  /** Each lift's strength read, keyed `name:status`, so a lift's row can carry it beside its own plateau classification. */
  strengthByLift: ReadonlyMap<string, LiftRelativeStrength>;
}

const CLASSIFICATION_LABEL: Record<PlateauClassification, string> = {
  improving: "Improving",
  plateaued_body_comp: "Plateaued — body comp",
  plateaued_other: "Plateaued — other",
  insufficient_data: "Not enough data yet",
};

/**
 * Achromatic except for "improving" — the app's theming is strict
 * black-and-white plus one user-selected accent, and `default` is the one
 * badge variant that already resolves to that accent (bg-primary, which
 * useTheme.ts overwrites with the chosen accent + a contrast-matched
 * foreground). The other three states are informational, not alarms, so
 * they stay achromatic `secondary` — never `destructive`, which is reserved
 * for actual errors.
 */
function ClassificationBadge({ classification }: { classification: PlateauClassification }) {
  return (
    <Badge variant={classification === "improving" ? "default" : "secondary"}>
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  );
}

const DIRECTION_LABEL = { up: "Up", down: "Down", flat: "Flat" } as const;

/** "~220" for an estimated 1RM (never displayed as if it were a logged value), "165" for a raw benchmark score. */
function formatPointValue(value: number, valueKind: "raw" | "estimated_1rm"): string {
  const rounded = Math.round(value);
  return valueKind === "estimated_1rm" ? `~${rounded}` : `${rounded}`;
}

/** Sinks insufficient_data to the bottom; among the rest, the two plateau
 * states surface first since they're the ones worth a second look. */
const CLASSIFICATION_ORDER: Record<PlateauClassification, number> = {
  plateaued_body_comp: 0,
  plateaued_other: 1,
  improving: 2,
  insufficient_data: 3,
};

/**
 * "Has my lift/benchmark performance stalled, and if so, is body composition
 * working against me?" One row per lift or named benchmark. A lift's row also
 * carries its strength read (stronger or just heavier) when it has one, over
 * the last `RS_WINDOW_DAYS` days: the plateau read looks back over a run of
 * sessions and the strength read over a fixed year, so the row names the
 * second window instead of letting the two look like one.
 */
export function PlateauSection({ plateauInsights, strengthByLift }: PlateauSectionProps) {
  const sorted = [...plateauInsights].sort((a, b) => {
    const order = CLASSIFICATION_ORDER[a.classification] - CLASSIFICATION_ORDER[b.classification];
    return order !== 0 ? order : a.subject.name.localeCompare(b.subject.name);
  });
  const hasLiftSubject = sorted.some((i) => i.subject.type === "lift");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Lifts and named benchmarks with enough history to compare, checked against your
            InBody scans over the same window.
          </p>
          {hasLiftSubject ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Lift trends compare an estimated one-rep max (averaging two standard formulas),
              since a 1RM day and a 5RM day for the same lift aren't directly comparable weights.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No lift or named benchmark has enough same-status history to compare yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Body comp</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((insight) => (
                  <TableRow key={`${insight.subject.type}:${insight.subject.name}:${insight.subject.status}`}>
                    <TableCell className="font-medium whitespace-normal">
                      {insight.subject.name} ({insight.subject.status})
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ClassificationBadge classification={insight.classification} />
                      {insight.classification === "insufficient_data" ? (
                        <p className="mt-1 text-xs text-muted-foreground">{insight.reason}</p>
                      ) : null}
                      {(() => {
                        const strength =
                          insight.subject.type === "lift"
                            ? strengthByLift.get(`${insight.subject.name}:${insight.subject.status}`)
                            : undefined;
                        return strength?.status === "ok" && strength.attribution ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Per body mass, last {RS_WINDOW_DAYS} days: {ATTRIBUTION_LABEL[strength.attribution]}
                          </p>
                        ) : null;
                      })()}
                      {insight.tagNotes?.map((note) => (
                        <p key={note} className="mt-1 text-xs text-muted-foreground">
                          {note}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">
                          {DIRECTION_LABEL[insight.performanceTrend.direction]}
                        </span>
                        {insight.performanceTrend.recentPoints.map((p) => (
                          <span key={p.date} className="tabular text-xs text-muted-foreground">
                            {formatDate(p.date)}:{" "}
                            {formatPointValue(p.value, insight.performanceTrend.valueKind)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {insight.bodyCompTrend ? (
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular">
                          <span>Lean {formatSignedDelta(insight.bodyCompTrend.leanMassDelta, " lb")}</span>
                          <span>Fat mass {formatSignedDelta(insight.bodyCompTrend.fatMassDelta, " lb")}</span>
                          <span>Body fat {formatSignedDelta(insight.bodyCompTrend.bodyFatPctDelta, "%")}</span>
                          {describeWithinNoise(insight.bodyCompTrend) ? (
                            <span className="mt-1">{describeWithinNoise(insight.bodyCompTrend)}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">
                        {insight.confidence}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
