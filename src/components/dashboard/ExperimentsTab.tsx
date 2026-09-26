import { useState } from "react";
import dayjs from "dayjs";
import { AlertCircle, CalendarIcon, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadDropzone } from "@/components/landing/UploadDropzone";
import { formatDate } from "./charts/chartUtils";
import type { BodyCompState } from "./BodyCompTab";
import type { Experiment, ExperimentClassification, ExperimentInsight } from "@/types/experiment";

interface ExperimentsTabProps {
  experiments: Experiment[];
  /** null until both a SugarWOD upload and an InBody upload are ready, same gate as PlateauTab/AlignmentTab. */
  experimentInsights: Map<string, ExperimentInsight> | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  onAddExperiment: (label: string, date: string, endDate?: string) => void;
  onDeleteExperiment: (id: string) => void;
}

const CLASSIFICATION_LABEL: Record<ExperimentClassification, string> = {
  improved: "Improved",
  declined: "Declined",
  no_change: "No change",
  mixed: "Mixed",
  insufficient_data: "Not enough data yet",
};

/**
 * "improved" reads as a value judgment the others deliberately don't — it's
 * the one clean positive read, same convention as PlateauTab's "improving"
 * and AlignmentTab's "aligned". `mixed` gets copy that frames it as a real,
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

function ClassificationBadge({ classification }: { classification: ExperimentClassification }) {
  return (
    <Badge variant={classification === "improved" ? "default" : "secondary"}>
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  );
}

function formatDelta(delta: number | null, unit: string): string {
  if (delta === null) return "no data";
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function AddExperimentForm({ onAdd }: { onAdd: (label: string, date: string, endDate?: string) => void }) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const canSubmit = label.trim() !== "" && date !== undefined;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !date) return;
    onAdd(label.trim(), dayjs(date).format("YYYY-MM-DD"), endDate ? dayjs(endDate).format("YYYY-MM-DD") : undefined);
    setLabel("");
    setDate(undefined);
    setEndDate(undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="experiment-date">Started</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="experiment-date"
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-48 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {date ? formatDate(dayjs(date).format("YYYY-MM-DD")) : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setOpen(false);
                // A start date moved past the current end date would leave an
                // inverted range; clearing it is simpler than clamping, and
                // this is a rare edit (both fields default unset).
                if (d && endDate && dayjs(endDate).isBefore(dayjs(d), "day")) setEndDate(undefined);
              }}
              disabled={{ after: new Date() }}
              defaultMonth={date ?? new Date()}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="experiment-end-date">Ended (optional)</Label>
        <div className="flex items-center gap-1">
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger asChild>
              <Button
                id="experiment-end-date"
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-48 justify-start gap-2 font-normal"
              >
                <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {endDate ? formatDate(dayjs(endDate).format("YYYY-MM-DD")) : "Still ongoing"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(d) => {
                  setEndDate(d);
                  setEndOpen(false);
                }}
                disabled={{ before: date ?? new Date(0), after: new Date() }}
                defaultMonth={endDate ?? date ?? new Date()}
              />
            </PopoverContent>
          </Popover>
          {endDate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 font-normal"
              onClick={() => setEndDate(undefined)}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="experiment-label">What did you try?</Label>
        <Input
          id="experiment-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Started 5/3/1 cycle"
          maxLength={200}
        />
      </div>

      <Button type="submit" size="sm" disabled={!canSubmit} className="h-9">
        Add experiment
      </Button>
    </form>
  );
}

function ExperimentCard({
  experiment,
  insight,
  onDelete,
}: {
  experiment: Experiment;
  insight: ExperimentInsight | undefined;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base">{experiment.label}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Started {formatDate(experiment.date)}
            {experiment.endDate ? ` · Ended ${formatDate(experiment.endDate)}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete "${experiment.label}"`}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {insight ? (
          <>
            <ClassificationBadge classification={insight.classification} />
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {insight.classification === "insufficient_data"
                ? insight.reason
                : CLASSIFICATION_COPY[insight.classification]}
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
                  <dd className="tabular text-sm">{formatDelta(insight.bodyCompSummary.leanMassDelta, " lb")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fat mass</dt>
                  <dd className="tabular text-sm">{formatDelta(insight.bodyCompSummary.fatMassDelta, " lb")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Body fat</dt>
                  <dd className="tabular text-sm">{formatDelta(insight.bodyCompSummary.bodyFatPctDelta, "%")}</dd>
                </div>
              </dl>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Logs a user-marked intervention date ("Started 5/3/1 cycle") and, once
 * both datasets are loaded, re-anchors the Plateau Detector's before/after
 * comparison around it instead of a recent/prior rolling window — "since
 * starting this, has my performance and/or body composition actually
 * changed?" Needs both datasets the same way Plateaus/Alignment do, so this
 * stays a static empty state (reusing BodyCompTab's own upload entry point)
 * until InBody data is loaded, same treatment as those two tabs. Adding,
 * listing and deleting experiments is otherwise independent of #1/#2 — each
 * experiment is analyzed in isolation, v1 has no cross-experiment view.
 */
export function ExperimentsTab({
  experiments,
  experimentInsights,
  bodyComp,
  onBodyCompFile,
  onAddExperiment,
  onDeleteExperiment,
}: ExperimentsTabProps) {
  if (!experimentInsights) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Experiments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark when you tried something — a new program, a strength cycle, a diet change — and
            see whether your performance and body composition actually shifted afterward. Needs
            an InBody export in addition to the SugarWOD log already loaded.
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

  const sorted = [...experiments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Experiments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark when you tried something, and see whether your lifts, named benchmarks and body
            composition actually changed after that date compared to before it.
          </p>
          <AddExperimentForm onAdd={onAddExperiment} />
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No experiments logged yet.</p>
          </CardContent>
        </Card>
      ) : (
        sorted.map((experiment) => (
          <ExperimentCard
            key={experiment.id}
            experiment={experiment}
            insight={experimentInsights.get(experiment.id)}
            onDelete={() => onDeleteExperiment(experiment.id)}
          />
        ))
      )}
    </div>
  );
}
