import { useRef, useState } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeTag, parseTagsJson, serializeTags, tagLabel } from "@/lib/analytics/contextTags";
import { downloadTextFile } from "@/lib/download";
import { capture } from "@/lib/posthog";
import { TAG_GROUPS, type ContextTag, type TagType } from "@/types/tag";
import type { ExperimentInsight } from "@/types/experiment";
import type { DateWindow } from "@/types/compare";
import type { DataSource } from "@/App";
import { ClassificationBadge } from "./ExperimentVerdict";
import { formatDate } from "./charts/chartUtils";

interface PeriodsTabProps {
  tags: ContextTag[];
  source: DataSource;
  /** null until both a SugarWOD upload and an InBody upload are ready; an experiment's verdict waits on it. */
  experimentInsights: Map<string, ExperimentInsight> | null;
  /** Opens the Compare view on this tag's range. */
  onCompareTag: (tagId: string) => void;
  /** A range dragged out on a chart, to pre-fill the form. */
  initialWindow: DateWindow | null;
  onAdd: (tag: Omit<ContextTag, "id">) => void;
  onUpdate: (tag: ContextTag) => void;
  onDelete: (id: string) => void;
  /** Called with the merged list after an import. */
  onReplace: (tags: ContextTag[]) => void;
}

const TYPE_LABEL: Record<TagType, string> = {
  experiment: "Experiment",
  cut: "Cut",
  bulk: "Bulk",
  maintain: "Maintain",
  injury: "Injury",
  travel: "Travel",
  other: "Other",
};

interface Draft {
  type: TagType;
  label: string;
  startDate: string;
  endDate: string;
  ongoing: boolean;
  note: string;
  baselineStart: string;
}

function emptyDraft(window: DateWindow | null): Draft {
  return {
    type: "experiment",
    label: "",
    startDate: window?.start ?? "",
    endDate: window?.end ?? "",
    ongoing: false,
    note: "",
    baselineStart: "",
  };
}

function draftOf(tag: ContextTag): Draft {
  return {
    type: tag.type,
    label: tag.label ?? "",
    startDate: tag.startDate,
    endDate: tag.endDate ?? "",
    ongoing: tag.endDate === null,
    note: tag.note ?? "",
    baselineStart: tag.baselineStart ?? "",
  };
}

/** The types whose range can be compared with the stretch before it: the ones in "Something you changed". */
const CHANGE_TYPES: readonly TagType[] = TAG_GROUPS[0]?.types ?? [];

/**
 * Stretches of time the two exports can't see: a cut, an injury, a trip,
 * something you tried. Tags shade the time-series charts and are named in any
 * plateau or alignment read they overlap; they never change a number. An
 * experiment is a tag you've asked the app to judge: its row carries the
 * before/after verdict, and any tag in "Something you changed" can be opened
 * on the Compare view. Stored in the browser only, so the export and import
 * here are the backup.
 */
export function PeriodsTab({
  tags,
  source,
  experimentInsights,
  onCompareTag,
  initialWindow,
  onAdd,
  onUpdate,
  onDelete,
  onReplace,
}: PeriodsTabProps) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialWindow));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const endOk = draft.ongoing || (draft.endDate !== "" && draft.endDate >= draft.startDate);
  const baselineOk = draft.baselineStart === "" || draft.baselineStart < draft.startDate;
  const canSubmit = draft.startDate !== "" && endOk && baselineOk;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const fields = {
      type: draft.type,
      ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
      startDate: draft.startDate,
      endDate: draft.ongoing ? null : draft.endDate,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      ...(draft.baselineStart ? { baselineStart: draft.baselineStart } : {}),
    };
    if (editingId) {
      onUpdate({ id: editingId, ...fields });
      capture({ name: "interaction_used", props: { interaction: "tag_edited" } });
    } else {
      onAdd(fields);
      capture({ name: "interaction_used", props: { interaction: "tag_created" } });
    }
    setEditingId(null);
    setDraft(emptyDraft(null));
  };

  const exportTags = () => {
    downloadTextFile("swift-periods.json", serializeTags(tags));
    capture({ name: "interaction_used", props: { interaction: "tags_exported" } });
  };

  const importTags = async (file: File) => {
    const result = parseTagsJson(await file.text());
    if (result.status === "invalid") {
      setImportMessage(`Nothing was imported. ${result.reason}`);
      return;
    }
    const incoming = new Map(result.tags.map((t) => [t.id, t]));
    const kept = tags.filter((t) => !incoming.has(t.id));
    onReplace([...kept, ...result.tags]);
    setImportMessage(`Imported ${result.tags.length} ${result.tags.length === 1 ? "period" : "periods"}. Periods you already had were updated.`);
    capture({ name: "interaction_used", props: { interaction: "tags_imported" } });
  };

  const sorted = [...tags].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark a stretch of time — a cut, an injury, a trip, something you tried — so a plateau or
            alignment read that overlaps it says so. Periods shade the charts and are named where they
            apply; they never change a number. Mark something you tried as an experiment to see
            whether your lifts and body composition moved after it. You can also drag across a chart
            and choose Save as a period.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Periods are stored in this browser only. Clearing site data or using Start over deletes
            them, so export a copy if you want to keep them.
            {source === "sample" ? " Periods added while sample data is showing are not stored." : ""}
          </p>

          <form onSubmit={submit} className="flex flex-col gap-3" aria-label={editingId ? "Edit period" : "Add a period"}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-type">Type</Label>
                <select
                  id="period-type"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value as TagType)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TAG_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.types.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-start">Starts</Label>
                <Input id="period-start" type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-9 w-44" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-end">Ends</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={draft.ongoing ? "" : draft.endDate}
                  disabled={draft.ongoing}
                  min={draft.startDate || undefined}
                  onChange={(e) => set("endDate", e.target.value)}
                  className="h-9 w-44"
                />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.ongoing} onChange={(e) => set("ongoing", e.target.checked)} />
                Still going
              </label>
              {draft.type === "experiment" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="period-baseline">Compare against (optional)</Label>
                  <Input
                    id="period-baseline"
                    type="date"
                    value={draft.baselineStart}
                    max={draft.startDate ? dayjs(draft.startDate).subtract(1, "day").format("YYYY-MM-DD") : undefined}
                    onChange={(e) => set("baselineStart", e.target.value)}
                    className="h-9 w-44"
                    aria-describedby="period-baseline-hint"
                  />
                </div>
              ) : null}
            </div>
            {draft.type === "experiment" ? (
              <p id="period-baseline-hint" className="text-xs text-muted-foreground">
                The before side starts here and runs up to the day before the experiment. Leave it empty to
                compare against all earlier history.
                {baselineOk ? "" : " This date has to be before the experiment starts."}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="period-label">Name (optional)</Label>
                <Input id="period-label" value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={draft.type === "experiment" ? "Started 5/3/1 cycle" : "Spring cut"}
                maxLength={80} />
              </div>
              <div className="flex flex-[2] flex-col gap-1.5">
                <Label htmlFor="period-note">Note (optional)</Label>
                <Input id="period-note" value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={300} />
              </div>
              <Button type="submit" size="sm" className="h-9" disabled={!canSubmit}>
                {editingId ? "Save changes" : "Add period"}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(emptyDraft(null));
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No periods yet.</p>
          </CardContent>
        </Card>
      ) : (
        sorted.map((tag) => (
          <Card key={tag.id}>
            <CardHeader className="flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">{tagLabel(tag)}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{describeTag(tag)}</p>
                {tag.type === "experiment" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compared with{" "}
                    {tag.baselineStart
                      ? `${formatDate(tag.baselineStart)} – ${formatDate(dayjs(tag.startDate).subtract(1, "day").format("YYYY-MM-DD"))}`
                      : `all history before ${formatDate(tag.startDate)}`}
                  </p>
                ) : null}
                {tag.note ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{tag.note}</p> : null}
              </div>
              <div className="flex items-center gap-1">
                {tag.type === "experiment" && experimentInsights?.get(tag.id) ? (
                  <ClassificationBadge classification={experimentInsights.get(tag.id)!.classification} />
                ) : null}
                {CHANGE_TYPES.includes(tag.type) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    aria-label={`Compare ${tagLabel(tag)}`}
                    onClick={() => onCompareTag(tag.id)}
                  >
                    Compare
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${tagLabel(tag)}`}
                  onClick={() => {
                    setEditingId(tag.id);
                    setDraft(draftOf(tag));
                    window.scrollTo({ top: 0 });
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${tagLabel(tag)}`} onClick={() => onDelete(tag.id)}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={exportTags} disabled={tags.length === 0}>
              Export periods
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Import periods
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import periods from a JSON file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importTags(file);
              }}
            />
          </div>
          {importMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {importMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
