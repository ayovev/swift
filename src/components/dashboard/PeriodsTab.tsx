import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBodyCompNoiseBands } from "@/lib/analytics/bodyCompNoise";
import {
  compareWindows,
  defaultWindowA,
  windowAIsContiguous,
  windowsToExperimentFields,
} from "@/lib/analytics/compareWindows";
import { customCycle, getCycleReport, getCycles } from "@/lib/analytics/cycleReport";
import { capture } from "@/lib/posthog";
import type { DateWindow } from "@/types/compare";
import type { Experiment, ExperimentFields, ExperimentInsight } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";
import type { BodyCompState } from "./BodyCompTab";
import { ComparisonTables } from "./ComparisonTables";
import { CycleReportBody } from "./CycleReportBody";
import { ExperimentForm } from "./ExperimentForm";
import { ClassificationBadge, ExperimentVerdict } from "./ExperimentVerdict";
import { InBodyUploadPrompt } from "./InBodyUploadPrompt";
import { formatDate } from "./charts/chartUtils";

interface PeriodsTabProps {
  workouts: SugarWodRow[];
  /** Empty when no InBody file is loaded — body composition then reports why it can't be compared. */
  scans: InBodyRow[];
  tags: ContextTag[];
  experiments: Experiment[];
  /** null until both a SugarWOD upload and an InBody upload are ready, same gate as LiftsTab. */
  experimentInsights: Map<string, ExperimentInsight> | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  /** Window B from a drag on a chart, if that's how the athlete got here. */
  initialWindowB: DateWindow | null;
  onAddExperiment: (fields: ExperimentFields) => void;
  /** Replaces everything but the id. An unset `endDate` means ongoing, an unset `baselineStart` means all earlier history. */
  onUpdateExperiment: (id: string, fields: ExperimentFields) => void;
  onDeleteExperiment: (id: string) => void;
}

/** What filled the range in, when it wasn't typed: a saved experiment or a training block. */
type Source = { kind: "experiment"; id: string } | { kind: "block"; key: string };

const ISO = "YYYY-MM-DD";
const today = () => dayjs().format(ISO);

function defaultWindowB(): DateWindow {
  const end = dayjs();
  return { start: end.subtract(89, "day").format(ISO), end: end.format(ISO) };
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} max={today()} onChange={(e) => onChange(e.target.value)} className="h-9 w-44" />
    </div>
  );
}

/**
 * One view for "what changed over this stretch of time". The range is the
 * only input: typed here, dragged out on a chart, or filled in from a saved
 * experiment or a training block. Whatever the range is, it gets the same
 * report — what it did to volume and lifts, and how it compares with the
 * stretch before it — and a saved experiment adds its own verdict on top.
 * Experiments and blocks are two ways to name a range, not two reports, and
 * saving a comparison writes the same `Experiment` the list below holds.
 */
export function PeriodsTab({
  workouts,
  scans,
  tags,
  experiments,
  experimentInsights,
  bodyComp,
  onBodyCompFile,
  initialWindowB,
  onAddExperiment,
  onUpdateExperiment,
  onDeleteExperiment,
}: PeriodsTabProps) {
  const [b, setB] = useState<DateWindow>(initialWindowB ?? defaultWindowB());
  const [customA, setCustomA] = useState<DateWindow | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const bands = useMemo(() => getBodyCompNoiseBands(scans), [scans]);
  const blocks = useMemo(
    () =>
      getCycles(workouts, tags, { asOfDate: new Date() })
        .map((cycle) => ({ cycle, key: cycle.tagId ?? `${cycle.start}:${cycle.end}` }))
        .reverse(),
    [workouts, tags]
  );
  const sortedExperiments = useMemo(() => [...experiments].sort((x, y) => y.date.localeCompare(x.date)), [experiments]);

  const a = customA ?? defaultWindowA(b);
  const windowsValid = b.start !== "" && b.end !== "" && b.end >= b.start;

  const selectedExperiment = source?.kind === "experiment" ? experiments.find((e) => e.id === source.id) : undefined;
  const selectedBlock = source?.kind === "block" ? blocks.find((x) => x.key === source.key) : undefined;
  const rangeLabel = selectedBlock?.cycle.label ?? selectedExperiment?.label ?? "Range";

  const comparison = useMemo(
    () => compareWindows(workouts, scans, a, b, { noiseBands: bands, tags }),
    [workouts, scans, a, b, bands, tags]
  );
  const rangeReport = useMemo(
    () =>
      windowsValid
        ? getCycleReport(customCycle(workouts, b.start, b.end, rangeLabel), workouts, scans, { noiseBands: bands, tags })
        : null,
    [windowsValid, workouts, scans, b, rangeLabel, bands, tags]
  );

  // Typing a date means the range is no longer the saved thing it was filled in from.
  const editB = (field: keyof DateWindow, v: string) => {
    setSaved(false);
    setSource(null);
    setB((prev) => ({ ...prev, [field]: v }));
  };
  const editA = (next: DateWindow | null) => {
    setSaved(false);
    setSource(null);
    setCustomA(next);
  };

  const showExperiment = (e: Experiment) => {
    setSaved(false);
    setSource({ kind: "experiment", id: e.id });
    setB({ start: e.date, end: e.endDate ?? today() });
    setCustomA(
      e.baselineStart ? { start: e.baselineStart, end: dayjs(e.date).subtract(1, "day").format(ISO) } : null
    );
  };
  const showBlock = (key: string, window: DateWindow) => {
    setSaved(false);
    setSource({ kind: "block", key });
    setB(window);
    setCustomA(null);
  };

  const suggested = windowsValid ? `${formatDate(b.start)} – ${formatDate(b.end)}` : "";
  const save = () => {
    onAddExperiment({
      label: (name.trim() || `Comparison, ${suggested}`).slice(0, 200),
      ...windowsToExperimentFields(a, b),
    });
    capture({ name: "interaction_used", props: { interaction: "compare_saved_as_experiment" } });
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            What changed over a range: your lifts, named benchmarks and body composition, set against
            the stretch before it. Drag across a chart to fill the range in, type the dates, or pick a
            saved experiment or training block below.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <DateField id="periods-b-start" label="Range starts" value={b.start} onChange={(v) => editB("start", v)} />
            <DateField id="periods-b-end" label="Range ends" value={b.end} onChange={(v) => editB("end", v)} />
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-sm">
              Compared with{" "}
              <span className="tabular font-medium">
                {formatDate(a.start)} – {formatDate(a.end)}
              </span>
              {customA ? "" : ", the same number of days immediately before"}.
            </p>
            {customA ? (
              <div className="flex flex-wrap items-end gap-4">
                <DateField id="periods-a-start" label="Earlier range starts" value={customA.start} onChange={(v) => editA({ ...customA, start: v })} />
                <DateField id="periods-a-end" label="Earlier range ends" value={customA.end} onChange={(v) => editA({ ...customA, end: v })} />
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => editA(null)}>
                  Use the days immediately before
                </Button>
              </div>
            ) : (
              <div>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => editA(defaultWindowA(b))}>
                  Choose the earlier range
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedExperiment ? (
        experimentInsights ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{selectedExperiment.label}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compared with{" "}
                {selectedExperiment.baselineStart
                  ? `${formatDate(selectedExperiment.baselineStart)} – ${formatDate(dayjs(selectedExperiment.date).subtract(1, "day").format(ISO))}`
                  : `all history before ${formatDate(selectedExperiment.date)}`}
              </p>
            </CardHeader>
            <CardContent>
              {experimentInsights.get(selectedExperiment.id) ? (
                <ExperimentVerdict insight={experimentInsights.get(selectedExperiment.id)!} />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <InBodyUploadPrompt state={bodyComp} onFile={onBodyCompFile}>
            A verdict on whether your performance and body composition shifted after this started needs an
            InBody export in addition to the SugarWOD log already loaded.
          </InBodyUploadPrompt>
        )
      ) : null}

      {rangeReport ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selectedBlock ? selectedBlock.cycle.label : "In this range"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatDate(b.start)} – {formatDate(b.end)}
              {rangeReport.cycle.focusLifts.length > 0 ? ` · Focus: ${rangeReport.cycle.focusLifts.join(", ")}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            <CycleReportBody report={rangeReport} />
          </CardContent>
        </Card>
      ) : null}

      <ComparisonTables result={comparison} />

      {windowsValid ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Save this range as an experiment to keep it in the list below, compared with the earlier
              range shown above.{" "}
              {windowAIsContiguous(a, b)
                ? ""
                : "A saved experiment's earlier range runs up to its start date, so the days between these two ranges will be included."}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="periods-experiment-label">Name</Label>
                <Input
                  id="periods-experiment-label"
                  value={name}
                  onChange={(e) => {
                    setSaved(false);
                    setName(e.target.value);
                  }}
                  placeholder={`Comparison, ${suggested}`}
                  maxLength={200}
                />
              </div>
              <Button type="button" size="sm" className="h-9" onClick={save} disabled={saved}>
                {saved ? "Saved as experiment" : "Save as experiment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Experiments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark when you tried something, and see whether your lifts, named benchmarks and body
            composition changed after that date compared to before it.
          </p>
          <ExperimentForm submitLabel="Add experiment" onSubmit={onAddExperiment} />
          {sortedExperiments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No experiments logged yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {sortedExperiments.map((experiment) => {
                const insight = experimentInsights?.get(experiment.id);
                if (editingId === experiment.id) {
                  return (
                    <li key={experiment.id} className="py-3">
                      <ExperimentForm
                        initial={experiment}
                        submitLabel="Save changes"
                        onSubmit={(fields) => {
                          onUpdateExperiment(experiment.id, fields);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={experiment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">{experiment.label}</span>
                      <span className="text-xs text-muted-foreground">
                        Started {formatDate(experiment.date)}
                        {experiment.endDate ? ` · Ended ${formatDate(experiment.endDate)}` : ""}
                        {experiment.baselineStart
                          ? ` · Compared with ${formatDate(experiment.baselineStart)} – ${formatDate(dayjs(experiment.date).subtract(1, "day").format(ISO))}`
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {insight ? <ClassificationBadge classification={insight.classification} /> : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        aria-pressed={selectedExperiment?.id === experiment.id}
                        aria-label={`Show "${experiment.label}"`}
                        onClick={() => showExperiment(experiment)}
                      >
                        Show
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingId(experiment.id)}
                        aria-label={`Edit "${experiment.label}"`}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDeleteExperiment(experiment.id)}
                        aria-label={`Delete "${experiment.label}"`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Training blocks</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Blocks come from tags of type bulk, cut, maintain or other on the Tags view.
          </p>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No blocks yet. Tag a bulk, cut or maintain phase on the Tags view to see it here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {blocks.map(({ cycle, key }) => (
                <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{cycle.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(cycle.start)} – {formatDate(cycle.end)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    aria-pressed={selectedBlock?.key === key}
                    aria-label={`Show "${cycle.label}"`}
                    onClick={() => showBlock(key, { start: cycle.start, end: cycle.end })}
                  >
                    Show
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
