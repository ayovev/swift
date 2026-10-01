import { useState } from "react";
import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeTag, hasVerdict, tagLabel } from "@/lib/analytics/contextTags";
import { capture } from "@/lib/posthog";
import { TAG_GROUPS, TAG_TYPE_LABEL, groupOfType, isChangeType, type ContextTag, type TagType } from "@/types/tag";
import type { PeriodVerdict } from "@/types/verdict";
import type { DateWindow } from "@/types/compare";
import type { DataSource } from "@/App";
import { VerdictBadge } from "./VerdictSummary";
import { DatePickerField } from "./DatePickerField";
import { SegmentedControl } from "./SegmentedControl";
import { formatDate } from "./charts/chartUtils";

interface PeriodsTabProps {
  tags: ContextTag[];
  source: DataSource;
  /** null until both a SugarWOD upload and an InBody upload are ready; a period's verdict waits on it. */
  verdicts: Map<string, PeriodVerdict> | null;
  /** Opens the Compare view on this tag's range. */
  onCompareTag: (tagId: string) => void;
  /** A range dragged out on a chart, to pre-fill the form. */
  initialWindow: DateWindow | null;
  onAdd: (tag: Omit<ContextTag, "id">) => void;
  onUpdate: (tag: ContextTag) => void;
  onDelete: (id: string) => void;
}

/** What a name might look like for each type, as the placeholder. A hint, never a default. */
const EXAMPLE_NAME: Record<TagType, string> = {
  nutrition: "Added creatine",
  cut: "Spring cut",
  bulk: "Spring bulk",
  maintain: "Maintenance block",
  programming: "Switched to own programming",
  cycle: "5/3/1, cycle 3",
  deload: "Deload week",
  recovery: "Started tracking sleep",
  experiment: "Started 5/3/1 cycle",
  other: "Something else I changed",
  injury: "Shoulder tweak",
  travel: "Two weeks abroad",
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

/**
 * Stretches of time the two exports can't see: a cut, an injury, a trip,
 * something you tried. Periods shade the time-series charts and are named in
 * any plateau or alignment read they overlap; they never change a number. The
 * form picks a kind first (something you changed, or something that happened),
 * then a type grouped by domain. A period in "Something you changed" carries a
 * before/after verdict on its row and can be opened on the Compare view.
 * Stored in the browser only; Settings → Backup saves them with everything
 * else.
 */
export function PeriodsTab({
  tags,
  source,
  verdicts,
  onCompareTag,
  initialWindow,
  onAdd,
  onUpdate,
  onDelete,
}: PeriodsTabProps) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialWindow));
  const [editingId, setEditingId] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const group = groupOfType(draft.type);
  const judged = isChangeType(draft.type);
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

  const sorted = [...tags].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark a stretch of time — a cut, an injury, a trip, something you tried — so a plateau or
            alignment read that overlaps it says so. Periods shade the charts and are named where they
            apply; they never change a number. Mark something you changed — your food, your programming,
            your sleep — to see whether your lifts and body composition moved after it. You can also
            drag across a chart and choose Save as a period.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Periods are stored in this browser only. Clearing site data or using Start over deletes
            them. Download a backup from Settings to keep a copy.
            {source === "sample" ? " Periods added while sample data is showing are not stored." : ""}
          </p>

          <form onSubmit={submit} className="flex flex-col gap-3" aria-label={editingId ? "Edit period" : "Add a period"}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm leading-none font-medium select-none">Kind</span>
                <SegmentedControl
                  ariaLabel="Kind of period"
                  value={group.id}
                  options={TAG_GROUPS.map((g) => ({ id: g.id, label: g.label }))}
                  onChange={(id) => {
                    const next = TAG_GROUPS.find((g) => g.id === id);
                    if (next && next.id !== group.id) set("type", next.defaultType);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-type">Type</Label>
                <select
                  id="period-type"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value as TagType)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {group.categories.map((category) => {
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-start">Starts</Label>
                <DatePickerField id="period-start" value={draft.startDate} onChange={(v) => set("startDate", v)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-end">Ends</Label>
                <DatePickerField
                  id="period-end"
                  value={draft.ongoing ? "" : draft.endDate}
                  disabled={draft.ongoing}
                  min={draft.startDate || undefined}
                  onChange={(v) => set("endDate", v)}
                />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.ongoing} onChange={(e) => set("ongoing", e.target.checked)} />
                Still going
              </label>
              {judged ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="period-baseline">Compare against (optional)</Label>
                  <DatePickerField
                    id="period-baseline"
                    value={draft.baselineStart}
                    max={draft.startDate ? dayjs(draft.startDate).subtract(1, "day").format("YYYY-MM-DD") : undefined}
                    onChange={(v) => set("baselineStart", v)}
                    clearable
                    aria-describedby="period-baseline-hint"
                  />
                </div>
              ) : null}
            </div>
            {judged ? (
              <p id="period-baseline-hint" className="text-xs text-muted-foreground">
                The before side starts here and runs up to the day before this starts. Leave it empty to
                compare against all earlier history.
                {baselineOk ? "" : " This date has to be before this starts."}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                <Label htmlFor="period-label">Name (optional)</Label>
                <Input id="period-label" value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder={EXAMPLE_NAME[draft.type]} maxLength={80} />
              </div>
              <div className="flex min-w-40 flex-[2] flex-col gap-1.5">
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
                {hasVerdict(tag) ? (
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
                {hasVerdict(tag) && verdicts?.get(tag.id) ? (
                  <VerdictBadge classification={verdicts.get(tag.id)!.classification} />
                ) : null}
                {isChangeType(tag.type) ? (
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
    </div>
  );
}
