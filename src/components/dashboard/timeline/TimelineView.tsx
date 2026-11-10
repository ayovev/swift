import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { readingsFromInBody, weightBandLb } from "@/lib/analytics/insights/bodyReadings";
import { displayName, verdictText } from "@/lib/analytics/insights/display";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { entryName } from "@/lib/analytics/timeline";
import { pooledReadings, pooledScanRows } from "@/lib/analytics/weighIns";
import { capture } from "@/lib/posthog";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { EvidenceChart } from "../progress/EvidenceChart";
import { SegmentedControl } from "../SegmentedControl";
import { EntryDetail } from "./EntryDetail";
import { EntryDialog } from "./EntryDialog";
import { LANE_GROUPS, TimelineChart, type Selection } from "./TimelineChart";

/**
 * How much of the axis is shown. A zoom, named as one: it changes what fits on screen, never a verdict or which sessions count,
 * and "Last year" beside "the date range doesn't apply here" read as the date range it isn't.
 */
type RangeId = "all" | "year" | "6m";
const RANGES: { id: RangeId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "year", label: "1 year" },
  { id: "6m", label: "6 months" },
];

interface TimelineViewProps {
  workouts: readonly SugarWodRow[];
  scans: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
  timeline: readonly TimelineEntry[];
  /** Returns the new entry's id, so it can be selected. */
  onAddEntry: (entry: Omit<TimelineEntry, "id">) => string;
  onUpdateEntry: (entry: TimelineEntry) => void;
  onDeleteEntry: (id: string) => void;
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
  /** A subject to open on arrival (the front door's "See on timeline"). */
  initialSubjectKey?: string | null;
}

/**
 * The Timeline: one axis with the athlete's entries stacked above the verdicts, and a single Selected panel beneath. The panel holds one
 * thing at a time (a hint, an entry or a subject). The entry form is a dialog; deleting asks first. Nothing here changes a verdict.
 */
export function TimelineView({ workouts, scans, weighIns = [], timeline, onAddEntry, onUpdateEntry, onDeleteEntry, asOf, initialSubjectKey = null }: TimelineViewProps) {
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);
  const { subjects } = useMemo(() => buildProgressSubjects(workouts), [workouts]);
  const { rows } = useMemo(() => classifySubjects(subjects, today), [subjects, today]);
  const readings = useMemo(() => pooledReadings(readingsFromInBody(scans), weighIns), [scans, weighIns]);
  const band = useMemo(() => weightBandLb(pooledScanRows(scans, weighIns)), [scans, weighIns]);

  const [range, setRange] = useState<RangeId>("all");
  const [selected, setSelected] = useState<Selection>(initialSubjectKey ? { kind: "subject", key: initialSubjectKey } : null);
  const [dialog, setDialog] = useState<{ entry: TimelineEntry | null; startDate?: string } | null>(null);
  const [deleting, setDeleting] = useState<TimelineEntry | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const laneRows = useMemo(() => {
    const order = new Map(LANE_GROUPS.map((g, i) => [g as string, i]));
    return rows
      .filter((r) => order.has(r.group))
      .sort((a, b) => (order.get(a.group) as number) - (order.get(b.group) as number));
  }, [rows]);

  const { start, end } = useMemo(() => {
    const end = today;
    if (range === "year") return { start: dayjs(today).subtract(1, "year").format("YYYY-MM-DD"), end };
    if (range === "6m") return { start: dayjs(today).subtract(6, "month").format("YYYY-MM-DD"), end };
    let first = today;
    for (const r of laneRows) {
      const from = r.verdict ? r.verdict.previousBest.date : r.moveUp?.scaledDate;
      if (from && from < first) first = from;
    }
    for (const e of timeline) if (e.startDate < first) first = e.startDate;
    return { start: first === today ? dayjs(today).subtract(1, "year").format("YYYY-MM-DD") : first, end };
  }, [range, today, laneRows, timeline]);

  const selectedEntry = selected?.kind === "entry" ? timeline.find((e) => e.id === selected.id) ?? null : null;
  const selectedRow = selected?.kind === "subject" ? rows.find((r) => r.subject.key === selected.key) ?? null : null;

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const select = (next: Selection) => {
    setSelected(next);
    if (next?.kind === "subject") capture({ name: "interaction_used", props: { interaction: "timeline_subject_opened" } });
  };

  const save = (entry: Omit<TimelineEntry, "id">, existingId: string | null) => {
    if (existingId) {
      onUpdateEntry({ ...entry, id: existingId });
      setSelected({ kind: "entry", id: existingId });
      capture({ name: "interaction_used", props: { interaction: "entry_edited" } });
    } else {
      setSelected({ kind: "entry", id: onAddEntry(entry) });
      capture({ name: "interaction_used", props: { interaction: "entry_added" } });
    }
    setDialog(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    onDeleteEntry(deleting.id);
    capture({ name: "interaction_used", props: { interaction: "entry_deleted" } });
    if (selected?.kind === "entry" && selected.id === deleting.id) setSelected(null);
    setDeleting(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
          <span id="timeline-zoom" className="text-xs font-medium text-muted-foreground">
            Zoom
          </span>
          <SegmentedControl
            value={range}
            onChange={(next) => {
              setRange(next);
              capture({ name: "interaction_used", props: { interaction: "timeline_range_changed" } });
            }}
            options={RANGES}
            ariaLabel="Zoom"
          />
        </div>
        <Button type="button" onClick={() => setDialog({ entry: null })}>
          <Plus className="size-4" aria-hidden />
          Add to timeline
        </Button>
      </div>

      <TimelineChart
        entries={timeline}
        rows={laneRows}
        start={start}
        end={end}
        asOf={today}
        selected={selected}
        onSelect={select}
        onAddAt={(date) => setDialog({ entry: null, startDate: date })}
      />

      <section ref={panelRef} aria-label="Selected" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected</h2>
        {selectedEntry ? (
          <EntryDetail
            entry={selectedEntry}
            all={timeline}
            subjects={subjects}
            readings={readings}
            bandLb={band}
            asOf={today}
            onEdit={() => setDialog({ entry: selectedEntry })}
            onDelete={() => setDeleting(selectedEntry)}
          />
        ) : selectedRow ? (
          <SubjectDetail row={selectedRow} start={start} end={end} />
        ) : (
          <p className="text-sm text-muted-foreground">Select an entry or a subject on the chart, or add to the timeline.</p>
        )}
      </section>

      <EntryDialog
        open={dialog !== null}
        entry={dialog?.entry ?? null}
        {...(dialog?.startDate ? { startDate: dialog.startDate } : {})}
        today={today}
        onSave={save}
        onClose={() => setDialog(null)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${entryName(deleting)}" will be removed from the timeline. Your workouts are not affected.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubjectDetail({ row, start, end }: { row: NonNullable<ReturnType<typeof classifySubjects>["rows"][number]>; start: string; end: string }) {
  const { subject, verdict } = row;
  const text = verdict ? verdictText(subject, verdict) : null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">{displayName(subject)}</h3>
      {text ? (
        <>
          <p className="text-sm">{text.change}</p>
          <p className="text-xs text-muted-foreground">{text.windows}</p>
        </>
      ) : null}
      {/* The chart keeps the timeline's own axis, so a dot sits where it does above; a session outside the range falls off the edge. */}
      <EvidenceChart subject={subject} verdict={verdict} domain={{ start, end }} />
    </div>
  );
}
