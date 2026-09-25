import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import { formatDate } from "./charts/chartUtils";
import type { BodyCompState } from "./BodyCompTab";
import type { PlateauClassification, PlateauInsight } from "@/types/plateau";

interface PlateauTabProps {
  plateauInsights: PlateauInsight[] | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
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

function formatDelta(delta: number | null, unit: string): string {
  if (delta === null) return "no data";
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

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
 * Combines the SugarWOD log with an InBody export to answer "has my
 * lift/benchmark performance stalled, and if so, is body composition working
 * against me?" — needs both datasets, so this stays a static empty state
 * (reusing BodyCompTab's own upload entry point) until InBody data is
 * loaded, the same way BodyCompTab itself is always in the nav before any
 * InBody data exists.
 */
export function PlateauTab({ plateauInsights, bodyComp, onBodyCompFile }: PlateauTabProps) {
  if (!plateauInsights) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plateau detector</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Checks your lifts and named benchmarks against your InBody history, so a stalled
            number can be told apart from a body-composition one. Needs an InBody export in
            addition to the SugarWOD log already loaded.
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

  const sorted = [...plateauInsights].sort((a, b) => {
    const order = CLASSIFICATION_ORDER[a.classification] - CLASSIFICATION_ORDER[b.classification];
    return order !== 0 ? order : a.subject.name.localeCompare(b.subject.name);
  });
  const hasLiftSubject = sorted.some((i) => i.subject.type === "lift");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plateau detector</CardTitle>
        </CardHeader>
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
                        <p className="mt-1 text-xs text-muted-foreground">
                          Needs at least 3 logged entries and 2 InBody scans in the comparison
                          window.
                        </p>
                      ) : null}
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
                          <span>Lean {formatDelta(insight.bodyCompTrend.leanMassDelta, " lb")}</span>
                          <span>Fat mass {formatDelta(insight.bodyCompTrend.fatMassDelta, " lb")}</span>
                          <span>Body fat {formatDelta(insight.bodyCompTrend.bodyFatPctDelta, "%")}</span>
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
