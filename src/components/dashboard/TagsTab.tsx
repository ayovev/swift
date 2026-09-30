import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeTag, parseTagsJson, serializeTags, tagLabel } from "@/lib/analytics/contextTags";
import { downloadTextFile } from "@/lib/download";
import { capture } from "@/lib/posthog";
import { TAG_TYPES, type ContextTag, type TagType } from "@/types/tag";
import type { DateWindow } from "@/types/compare";
import type { DataSource } from "@/App";

interface TagsTabProps {
  tags: ContextTag[];
  source: DataSource;
  /** A range dragged out on a chart, to pre-fill the form. */
  initialWindow: DateWindow | null;
  onAdd: (tag: Omit<ContextTag, "id">) => void;
  onUpdate: (tag: ContextTag) => void;
  onDelete: (id: string) => void;
  /** Called with the merged list after an import. */
  onReplace: (tags: ContextTag[]) => void;
}

const TYPE_LABEL: Record<TagType, string> = {
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
}

function emptyDraft(window: DateWindow | null): Draft {
  return { type: "cut", label: "", startDate: window?.start ?? "", endDate: window?.end ?? "", ongoing: false, note: "" };
}

function draftOf(tag: ContextTag): Draft {
  return {
    type: tag.type,
    label: tag.label ?? "",
    startDate: tag.startDate,
    endDate: tag.endDate ?? "",
    ongoing: tag.endDate === null,
    note: tag.note ?? "",
  };
}

/**
 * Stretches of time the two exports can't see: a cut, an injury, a trip.
 * Tags shade the time-series charts and are named in any plateau or
 * alignment read they overlap; they never change a number. Stored in the
 * browser only, so the export and import here are the backup.
 */
export function TagsTab({ tags, source, initialWindow, onAdd, onUpdate, onDelete, onReplace }: TagsTabProps) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialWindow));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const endOk = draft.ongoing || (draft.endDate !== "" && draft.endDate >= draft.startDate);
  const canSubmit = draft.startDate !== "" && endOk;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const fields = {
      type: draft.type,
      ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
      startDate: draft.startDate,
      endDate: draft.ongoing ? null : draft.endDate,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
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
    downloadTextFile("swift-tags.json", serializeTags(tags));
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
    setImportMessage(`Imported ${result.tags.length} ${result.tags.length === 1 ? "tag" : "tags"}. Tags you already had were updated.`);
    capture({ name: "interaction_used", props: { interaction: "tags_imported" } });
  };

  const sorted = [...tags].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Mark a stretch of time — a cut, an injury, a trip — so a plateau or alignment read that
            overlaps it says so. Tags shade the charts and are named where they apply; they never
            change a number. You can also drag across a chart and choose Tag this range.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Tags are stored in this browser only. Clearing site data or using Start over deletes
            them, so export a copy if you want to keep them.
            {source === "sample" ? " Tags added while sample data is showing are not stored." : ""}
          </p>

          <form onSubmit={submit} className="flex flex-col gap-3" aria-label={editingId ? "Edit tag" : "Add a tag"}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tag-type">Type</Label>
                <select
                  id="tag-type"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value as TagType)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TAG_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tag-start">Starts</Label>
                <Input id="tag-start" type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-9 w-44" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tag-end">Ends</Label>
                <Input
                  id="tag-end"
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
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="tag-label">Name (optional)</Label>
                <Input id="tag-label" value={draft.label} onChange={(e) => set("label", e.target.value)} placeholder="Spring cut" maxLength={80} />
              </div>
              <div className="flex flex-[2] flex-col gap-1.5">
                <Label htmlFor="tag-note">Note (optional)</Label>
                <Input id="tag-note" value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={300} />
              </div>
              <Button type="submit" size="sm" className="h-9" disabled={!canSubmit}>
                {editingId ? "Save changes" : "Add tag"}
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
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          </CardContent>
        </Card>
      ) : (
        sorted.map((tag) => (
          <Card key={tag.id}>
            <CardHeader className="flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">{tagLabel(tag)}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{describeTag(tag)}</p>
                {tag.note ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{tag.note}</p> : null}
              </div>
              <div className="flex gap-1">
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
              Export tags
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Import tags
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Import tags from a JSON file"
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
