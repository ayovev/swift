import { useId, useState } from "react";
import dayjs from "dayjs";
import { CalendarIcon, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeWithinNoise } from "@/lib/analytics/bodyCompNoise";
import { formatDate, formatSignedDelta } from "./charts/chartUtils";
import type { BodyCompState } from "./BodyCompTab";
import { InBodyUploadPrompt } from "./InBodyUploadPrompt";
import type { Experiment, ExperimentClassification, ExperimentFields, ExperimentInsight } from "@/types/experiment";

interface ExperimentsTabProps {
  experiments: Experiment[];
  /** null until both a SugarWOD upload and an InBody upload are ready, same gate as PlateauTab/AlignmentTab. */
  experimentInsights: Map<string, ExperimentInsight> | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  onAddExperiment: (fields: ExperimentFields) => void;
  /** Replaces everything but the id. An unset `endDate` means ongoing, an unset `baselineStart` means all earlier history. */
  onUpdateExperiment: (id: string, fields: ExperimentFields) => void;
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

/** "YYYY-MM-DD" to a local-midnight Date, which is what the calendar picker works in. */
function isoToDate(iso: string | undefined): Date | undefined {
  return iso ? dayjs(iso).toDate() : undefined;
}

/**
 * The one form for adding an experiment and editing one. With `initial` it
 * starts filled in, keeps its values after submit (the caller closes it), and
 * offers Cancel; without, it's the add form and clears itself after submit.
 */
function ExperimentForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Experiment;
  submitLabel: string;
  onSubmit: (fields: ExperimentFields) => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const uid = useId();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [date, setDate] = useState<Date | undefined>(isoToDate(initial?.date));
  const [endDate, setEndDate] = useState<Date | undefined>(isoToDate(initial?.endDate));
  const [baselineStart, setBaselineStart] = useState<Date | undefined>(isoToDate(initial?.baselineStart));
  const [open, setOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);

  const canSubmit = label.trim() !== "" && date !== undefined;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !date) return;
    const iso = (d: Date) => dayjs(d).format("YYYY-MM-DD");
    onSubmit({
      label: label.trim(),
      date: iso(date),
      ...(endDate ? { endDate: iso(endDate) } : {}),
      ...(baselineStart ? { baselineStart: iso(baselineStart) } : {}),
    });
    if (!editing) {
      setLabel("");
      setDate(undefined);
      setEndDate(undefined);
      setBaselineStart(undefined);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-date`}>Started</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={`${uid}-date`}
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
                // Same for the earlier range: it has to start before the experiment does.
                if (d && baselineStart && !dayjs(baselineStart).isBefore(dayjs(d), "day")) setBaselineStart(undefined);
              }}
              disabled={{ after: new Date() }}
              defaultMonth={date ?? new Date()}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-end-date`}>Ended (optional)</Label>
        <div className="flex items-center gap-1">
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${uid}-end-date`}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-baseline`}>Compare against (optional)</Label>
        <div className="flex items-center gap-1">
          <Popover open={baselineOpen} onOpenChange={setBaselineOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${uid}-baseline`}
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-48 justify-start gap-2 font-normal"
              >
                <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {baselineStart ? `From ${formatDate(dayjs(baselineStart).format("YYYY-MM-DD"))}` : "All earlier history"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={baselineStart}
                onSelect={(d) => {
                  setBaselineStart(d);
                  setBaselineOpen(false);
                }}
                disabled={{ after: date ? dayjs(date).subtract(1, "day").toDate() : new Date() }}
                defaultMonth={baselineStart ?? date ?? new Date()}
              />
            </PopoverContent>
          </Popover>
          {baselineStart ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 font-normal"
              onClick={() => setBaselineStart(undefined)}
            >
              All history
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`${uid}-label`}>What did you try?</Label>
        <Input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Started 5/3/1 cycle"
          maxLength={200}
        />
      </div>

      <Button type="submit" size="sm" disabled={!canSubmit} className="h-9">
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  );
}

function ExperimentCard({
  experiment,
  insight,
  onUpdate,
  onDelete,
}: {
  experiment: Experiment;
  insight: ExperimentInsight | undefined;
  onUpdate: (fields: ExperimentFields) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardContent>
          <ExperimentForm
            initial={experiment}
            submitLabel="Save changes"
            onSubmit={(fields) => {
              onUpdate(fields);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base">{experiment.label}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Started {formatDate(experiment.date)}
            {experiment.endDate ? ` · Ended ${formatDate(experiment.endDate)}` : ""}
            {experiment.baselineStart
              ? ` · Compared with ${formatDate(experiment.baselineStart)} – ${formatDate(dayjs(experiment.date).subtract(1, "day").format("YYYY-MM-DD"))}`
              : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            aria-label={`Edit "${experiment.label}"`}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete "${experiment.label}"`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
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
  onUpdateExperiment,
  onDeleteExperiment,
}: ExperimentsTabProps) {
  if (!experimentInsights) {
    return (
      <InBodyUploadPrompt state={bodyComp} onFile={onBodyCompFile}>
        Mark when you tried something — a new program, a strength cycle, a diet change — and
            see whether your performance and body composition actually shifted afterward. Needs
            an InBody export in addition to the SugarWOD log already loaded.
      </InBodyUploadPrompt>
    );
  }

  const sorted = [...experiments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark when you tried something, and see whether your lifts, named benchmarks and body
            composition actually changed after that date compared to before it.
          </p>
          <ExperimentForm submitLabel="Add experiment" onSubmit={onAddExperiment} />
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
            onUpdate={(fields) => onUpdateExperiment(experiment.id, fields)}
            onDelete={() => onDeleteExperiment(experiment.id)}
          />
        ))
      )}
    </div>
  );
}
