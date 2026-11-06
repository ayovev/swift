import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EMPTY_ENTRY_INPUT, entryFromInput, inputFromEntry, validateEntryInput, type EntryInput } from "@/lib/analytics/timeline";
import {
  AREAS,
  AREA_LABEL,
  INITIATIONS,
  INITIATION_HINT,
  INITIATION_LABEL,
  NAME_MAX_CHARS,
  NOTE_MAX_CHARS,
  type TimelineEntry,
} from "@/types/timeline";
import { DatePickerField } from "../DatePickerField";

interface EntryDialogProps {
  open: boolean;
  /** The entry being edited, or null for a new one. */
  entry: TimelineEntry | null;
  /** A start date to prefill a new entry with (a click on an empty spot of the chart). */
  startDate?: string;
  today: string;
  onSave: (entry: Omit<TimelineEntry, "id">, existingId: string | null) => void;
  onClose: () => void;
}

/** The placeholder follows the two choices and maps to nothing: it is a hint, not a default. */
function namePlaceholder(input: EntryInput): string {
  if (input.initiation === "changed" && input.area === "nutrition") return "e.g. Spring cut";
  if (input.initiation === "happened" && input.area === "health") return "e.g. Shoulder tweak";
  return "e.g. Spring cut, Shoulder tweak, Two weeks abroad";
}

/**
 * The one entry form, new or edit. Classify first (kind, then area), then dates, then name and note. Nothing is pre-selected, the start
 * date included, so a hasty tap cannot misfile an entry. Every failing rule is listed in a plain sentence and nothing is saved until
 * there are none.
 */
export function EntryDialog({ open, entry, startDate, today, onSave, onClose }: EntryDialogProps) {
  const [input, setInput] = useState<EntryInput>(EMPTY_ENTRY_INPUT);
  const [reasons, setReasons] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setInput(entry ? inputFromEntry(entry) : { ...EMPTY_ENTRY_INPUT, startDate: startDate ?? "" });
    setReasons([]);
  }, [open, entry, startDate]);

  const set = <K extends keyof EntryInput>(key: K, value: EntryInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateEntryInput(input, today);
    setReasons(found);
    if (found.length > 0) return;
    const { id: _id, ...rest } = entryFromInput(input, "");
    onSave(rest, entry?.id ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[100svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "Add to timeline"}</DialogTitle>
          <DialogDescription>What happened or what you changed, and when.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What kind of entry is it?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INITIATIONS.map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    input.initiation === kind && "border-accent-link bg-accent-subtle"
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input type="radio" name="kind" value={kind} checked={input.initiation === kind} onChange={() => set("initiation", kind)} className="accent-[var(--accent-link,currentColor)]" />
                    {INITIATION_LABEL[kind]}
                  </span>
                  <span className="text-xs text-muted-foreground">{INITIATION_HINT[kind]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What does it touch?</legend>
            <div className="flex flex-wrap gap-2">
              {AREAS.map((area) => (
                <label
                  key={area}
                  className={cn(
                    "cursor-pointer rounded-full border border-border px-3 py-1 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    input.area === area && "border-accent-link bg-accent-subtle text-accent-link"
                  )}
                >
                  <input type="radio" name="area" value={area} checked={input.area === area} onChange={() => set("area", area)} className="sr-only" />
                  {AREA_LABEL[area]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-start">Starts</Label>
              <DatePickerField id="entry-start" value={input.startDate} onChange={(v) => set("startDate", v)} max={today} placeholder="Start date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-end">Ends</Label>
              <DatePickerField id="entry-end" value={input.endDate} onChange={(v) => set("endDate", v)} min={input.startDate || undefined} disabled={input.ongoing} placeholder="End date" />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={input.ongoing} onCheckedChange={(v) => set("ongoing", v === true)} aria-label="Ongoing" />
                Ongoing
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-name">Name (optional)</Label>
            <input
              id="entry-name"
              value={input.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={namePlaceholder(input)}
              maxLength={NAME_MAX_CHARS * 2}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-note">Note (optional)</Label>
            <textarea
              id="entry-note"
              value={input.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className={cn("self-end font-mono text-xs text-muted-foreground", input.note.length > NOTE_MAX_CHARS && "text-destructive")}>
              {input.note.length}/{NOTE_MAX_CHARS}
            </span>
          </div>

          {reasons.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-0.5 text-sm text-destructive">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{entry ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
