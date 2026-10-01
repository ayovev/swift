import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBodyCompNoiseBands } from "@/lib/analytics/bodyCompNoise";
import {
  compareWindows,
  defaultWindowA,
  windowAIsContiguous,
  windowsToPeriodFields,
} from "@/lib/analytics/compareWindows";
import { VERDICT_NOTE, hasVerdict, tagLabel } from "@/lib/analytics/contextTags";
import { customCycle, getCycleReport, getCycles } from "@/lib/analytics/cycleReport";
import { capture } from "@/lib/posthog";
import type { DateWindow } from "@/types/compare";
import type { PeriodVerdict } from "@/types/verdict";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import { TAG_GROUPS, TAG_TYPE_LABEL, type ContextTag, type TagType } from "@/types/tag";
import type { BodyCompState } from "./BodyCompTab";
import { ComparisonTables } from "./ComparisonTables";
import { CycleReportBody } from "./CycleReportBody";
import { VerdictBadge, VerdictSummary } from "./VerdictSummary";
import { InBodyUploadPrompt } from "./InBodyUploadPrompt";
import { formatDate } from "./charts/chartUtils";

interface CompareTabProps {
  workouts: SugarWodRow[];
  /** Empty when no InBody file is loaded — body composition then reports why it can't be compared. */
  scans: InBodyRow[];
  tags: ContextTag[];
  /** Keyed by tag id, for the periods that have a verdict (the ones in "Something you changed"). null until both a SugarWOD upload and an InBody upload are ready, same gate as LiftsTab. */
  verdicts: Map<string, PeriodVerdict> | null;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  /** Window B from a drag on a chart, if that's how the athlete got here. */
  initialWindowB: DateWindow | null;
  /** A tag opened from its row on the Tags view, if that's how the athlete got here. */
  initialTagId: string | null;
  /** Saves the current range as a tag. */
  onAddTag: (tag: Omit<ContextTag, "id">) => void;
}

/** The two windows a saved tag stands for: its own range, and the earlier range it was saved with (null: the days immediately before). */
function windowsOfTag(tag: ContextTag): { b: DateWindow; a: DateWindow | null } {
  const b = { start: tag.startDate, end: tag.endDate ?? dayjs().format(ISO_FORMAT) };
  const a =
    tag.baselineStart && tag.baselineStart < tag.startDate
      ? { start: tag.baselineStart, end: dayjs(tag.startDate).subtract(1, "day").format(ISO_FORMAT) }
      : null;
  return { b, a };
}

const ISO = "YYYY-MM-DD";
const ISO_FORMAT = ISO;
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
 * One view for "what changed over this stretch of time". The range is the only
 * input: typed here, dragged out on a chart, or filled in from a saved tag.
 * Whatever the range is, it gets the same report — what it did to volume and
 * lifts, and how it compares with the stretch before it — and a saved
 * experiment adds its own verdict on top. Experiments, cuts and bulks are all
 * tags, so there is one list of saved ranges and one way to save a new one.
 */
export function CompareTab({
  workouts,
  scans,
  tags,
  verdicts,
  bodyComp,
  onBodyCompFile,
  initialWindowB,
  initialTagId,
  onAddTag,
}: CompareTabProps) {
  const initialTag = initialTagId ? tags.find((t) => t.id === initialTagId) : undefined;
  const initialWindows = initialTag ? windowsOfTag(initialTag) : null;
  const [b, setB] = useState<DateWindow>(initialWindows?.b ?? initialWindowB ?? defaultWindowB());
  const [customA, setCustomA] = useState<DateWindow | null>(initialWindows?.a ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTag?.id ?? null);
  const [name, setName] = useState("");
  const [saveType, setSaveType] = useState<TagType>("experiment");
  const [saved, setSaved] = useState(false);

  const bands = useMemo(() => getBodyCompNoiseBands(scans), [scans]);
  const blocks = useMemo(
    () =>
      getCycles(workouts, tags, { asOfDate: new Date() })
        .map((cycle) => ({ cycle, tag: tags.find((t) => t.id === cycle.tagId) }))
        .reverse(),
    [workouts, tags]
  );

  const a = customA ?? defaultWindowA(b);
  const windowsValid = b.start !== "" && b.end !== "" && b.end >= b.start;

  const selectedTag = selectedId ? tags.find((t) => t.id === selectedId) : undefined;
  const selectedJudged = selectedTag && hasVerdict(selectedTag) ? selectedTag : undefined;
  const rangeLabel = selectedTag ? tagLabel(selectedTag) : "Range";

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
    setSelectedId(null);
    setB((prev) => ({ ...prev, [field]: v }));
  };
  const editA = (next: DateWindow | null) => {
    setSaved(false);
    setSelectedId(null);
    setCustomA(next);
  };

  const showTag = (tag: ContextTag) => {
    const windows = windowsOfTag(tag);
    setSaved(false);
    setSelectedId(tag.id);
    setB(windows.b);
    setCustomA(windows.a);
  };

  const suggested = windowsValid ? `${formatDate(b.start)} – ${formatDate(b.end)}` : "";
  const save = () => {
    const fields = windowsToPeriodFields(a, b);
    onAddTag({
      type: saveType,
      label: (name.trim() || `Comparison, ${suggested}`).slice(0, 80),
      startDate: fields.startDate,
      endDate: fields.endDate,
      baselineStart: fields.baselineStart,
    });
    capture({ name: "interaction_used", props: { interaction: "compare_saved_as_tag" } });
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            What changed over a range: your lifts, named benchmarks and body composition, set against
            the stretch before it. Drag across a chart to fill the range in, type the dates, or pick a
            saved period below.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <DateField id="compare-b-start" label="Range starts" value={b.start} onChange={(v) => editB("start", v)} />
            <DateField id="compare-b-end" label="Range ends" value={b.end} onChange={(v) => editB("end", v)} />
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
                <DateField id="compare-a-start" label="Earlier range starts" value={customA.start} onChange={(v) => editA({ ...customA, start: v })} />
                <DateField id="compare-a-end" label="Earlier range ends" value={customA.end} onChange={(v) => editA({ ...customA, end: v })} />
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

      {selectedJudged ? (
        verdicts ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tagLabel(selectedJudged)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compared with{" "}
                {selectedJudged.baselineStart
                  ? `${formatDate(selectedJudged.baselineStart)} – ${formatDate(dayjs(selectedJudged.startDate).subtract(1, "day").format(ISO))}`
                  : `all history before ${formatDate(selectedJudged.startDate)}`}
              </p>
            </CardHeader>
            <CardContent>
              {verdicts.get(selectedJudged.id) ? (
                <VerdictSummary insight={verdicts.get(selectedJudged.id)!} />
              ) : null}
              {VERDICT_NOTE[selectedJudged.type] ? (
                <p className="mt-3 text-xs text-muted-foreground">{VERDICT_NOTE[selectedJudged.type]}</p>
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
            <CardTitle className="text-base">{selectedTag && !selectedJudged ? tagLabel(selectedTag) : "In this range"}</CardTitle>
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
              Save this range as a period to keep it in the list below, compared with the earlier range
              shown above.{" "}
              {windowAIsContiguous(a, b)
                ? ""
                : "A saved period's earlier range runs up to its start date, so the days between these two ranges will be included."}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="compare-save-type">Type</Label>
                <select
                  id="compare-save-type"
                  value={saveType}
                  onChange={(e) => {
                    setSaved(false);
                    setSaveType(e.target.value as TagType);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TAG_GROUPS[0]?.categories.map((category) => {
                    const options = category.types.map((t) => (
                      <option key={t} value={t}>
                        {TAG_TYPE_LABEL[t]}
                      </option>
                    ));
                    return category.label ? (
                      <optgroup key={category.label} label={category.label}>
                        {options}
                      </optgroup>
                    ) : (
                      options
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="compare-save-label">Name</Label>
                <Input
                  id="compare-save-label"
                  value={name}
                  onChange={(e) => {
                    setSaved(false);
                    setName(e.target.value);
                  }}
                  placeholder={`Comparison, ${suggested}`}
                  maxLength={80}
                />
              </div>
              <Button type="button" size="sm" className="h-9" onClick={save} disabled={saved}>
                {saved ? "Saved as period" : "Save as period"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saved periods</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Periods for something you changed: nutrition, programming, recovery and the like. Add and edit
            them on the Periods view.
          </p>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved periods yet. Add something you changed on the Periods view, or save a range above.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {blocks.map(({ cycle, tag }) => {
                const insight = tag && hasVerdict(tag) ? verdicts?.get(tag.id) : undefined;
                return (
                  <li key={cycle.tagId ?? `${cycle.start}:${cycle.end}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">{cycle.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {tag ? `${TAG_TYPE_LABEL[tag.type]} · ` : ""}
                        {formatDate(cycle.start)} – {formatDate(cycle.end)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {insight ? <VerdictBadge classification={insight.classification} /> : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        aria-pressed={selectedId !== null && selectedId === cycle.tagId}
                        aria-label={`Show "${cycle.label}"`}
                        disabled={!tag}
                        onClick={() => tag && showTag(tag)}
                      >
                        Show
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
