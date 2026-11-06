import { useMemo, type MouseEvent } from "react";
import dayjs from "dayjs";
import { entryEnd, packLanes } from "@/lib/analytics/timeline";
import { displayName } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import { dayNumber } from "@/lib/analytics/insights/verdict";
import { cn } from "@/lib/utils";
import { entryName } from "@/lib/analytics/timeline";
import type { TimelineEntry } from "@/types/timeline";

export type Selection = { kind: "entry"; id: string } | { kind: "subject"; key: string } | null;

const STATE_LABEL: Record<string, string> = { up: "Up", down: "Down", "not-tested-since": "Not tested since", "no-clear-change": "No clear change" };
const LINE: Record<string, string> = {
  up: "bg-accent-link",
  down: "bg-destructive",
  "not-tested-since": "bg-amber-500",
  "no-clear-change": "bg-muted-foreground/60",
};

/** The groups that have a lane, in the front door's order. */
export const LANE_GROUPS = ["up", "down", "not-tested-since", "no-clear-change"] as const;

interface TimelineChartProps {
  entries: readonly TimelineEntry[];
  rows: readonly ProgressRow[];
  /** First and last day of the axis, YYYY-MM-DD. */
  start: string;
  end: string;
  /** The reference date: an ongoing entry runs to it. */
  asOf: string;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  /** A click on an empty spot of the entries area. */
  onAddAt: (date: string) => void;
}

/** A tick at each month start, spaced so about six fit. */
function ticks(start: string, end: string): { date: string; label: string }[] {
  const months = Math.max(1, dayjs(end).diff(dayjs(start), "month"));
  const step = Math.max(1, Math.ceil(months / 6));
  const out: { date: string; label: string }[] = [];
  let d = dayjs(start).startOf("month");
  if (d.isBefore(dayjs(start), "day")) d = d.add(1, "month");
  for (; !d.isAfter(dayjs(end), "day"); d = d.add(step, "month")) out.push({ date: d.format("YYYY-MM-DD"), label: d.format("MMM YYYY") });
  return out;
}

/**
 * One time axis, two bands. Entries are bars stacked in lanes on top (overlapping entries take separate lanes, so overlap is visible
 * with no rule); the verdicts are lanes below, each a line from the previous best to the recent best. HTML laid out by percentages, not
 * SVG, so the text keeps its size on a phone. Entries and lines are clipped to the axis; a subject wholly outside it reads "Outside
 * this range". An entry never changes a lane, a state or a number.
 */
export function TimelineChart({ entries, rows, start, end, asOf, selected, onSelect, onAddAt }: TimelineChartProps) {
  const span = Math.max(1, dayNumber(end) - dayNumber(start));
  const pct = (iso: string): number => Math.min(100, Math.max(0, ((dayNumber(iso) - dayNumber(start)) / span) * 100));

  const visible = useMemo(() => entries.filter((e) => e.startDate <= end && entryEnd(e, asOf) >= start), [entries, start, end, asOf]);
  const { placed, lanes } = useMemo(() => packLanes(visible, asOf), [visible, asOf]);
  const axis = useMemo(() => ticks(start, end), [start, end]);

  const verdictLanes = rows.filter((r) => (LANE_GROUPS as readonly string[]).includes(r.group) && (r.verdict || (r.moveUpVotes && r.moveUp)));

  const onEntriesClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const date = dayjs(start).add(Math.round(f * span), "day").format("YYYY-MM-DD");
    onAddAt(date > asOf ? asOf : date);
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Entries" className="flex flex-col gap-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entries</h2>
        {/* Clicking the empty part of this area starts a new entry on that day; the Add to timeline button is the way that always works. */}
        <div
          data-testid="entries-area"
          onClick={onEntriesClick}
          className="relative cursor-copy rounded-md border border-border bg-muted/30"
          style={{ height: Math.max(1, lanes) * 28 + 8 }}
        >
          {visible.length === 0 ? <p className="pointer-events-none px-3 py-2 text-sm text-muted-foreground">No entries in this range.</p> : null}
          {placed.map(({ entry, lane }) => {
            const left = pct(entry.startDate);
            const right = pct(entryEnd(entry, asOf));
            const width = Math.max(right - left, 0);
            const inside = width >= 14;
            const changed = entry.initiation === "changed";
            const isSelected = selected?.kind === "entry" && selected.id === entry.id;
            const name = entryName(entry);
            const ongoing = entry.endDate === null;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${name}, ${changed ? "something I changed" : "something that happened"}${ongoing ? ", ongoing" : ""}`}
                onClick={() => onSelect({ kind: "entry", id: entry.id })}
                className={cn(
                  "absolute flex h-6 items-center overflow-visible rounded text-xs leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  changed ? "bg-accent-link text-background" : "border border-dashed border-foreground bg-background text-foreground",
                  isSelected && "ring-2 ring-foreground"
                )}
                style={{ top: 4 + lane * 28, left: `${left}%`, width: `max(${width}%, 10px)` }}
              >
                {inside ? <span className="truncate px-1.5">{name}{ongoing ? " →" : ""}</span> : null}
                {!inside ? (
                  <span
                    className={cn("absolute whitespace-nowrap text-foreground", left + width > 75 ? "right-full mr-1.5" : "left-full ml-1.5")}
                  >
                    {name}
                    {ongoing ? " →" : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div aria-hidden className="relative h-5 border-t border-border">
        {axis.map((t) => (
          <span key={t.date} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground" style={{ left: `${pct(t.date)}%` }}>
            {t.label}
          </span>
        ))}
      </div>

      <section aria-label="Verdicts" className="flex flex-col gap-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verdicts</h2>
        <ul className="flex flex-col">
          {verdictLanes.map((r) => {
            const move = !r.verdict && r.moveUp;
            const from = r.verdict ? r.verdict.previousBest.date : (r.moveUp as NonNullable<typeof r.moveUp>).scaledDate;
            const to = r.verdict ? r.verdict.recentBest.date : (r.moveUp as NonNullable<typeof r.moveUp>).date;
            const outside = to < start || from > end;
            const state = r.verdict ? r.verdict.state : "up";
            const text = move ? "Moved up to RX" : `${STATE_LABEL[state]} ${r.verdict && r.verdict.change !== 0 ? `${r.verdict.change > 0 ? "+" : "−"}${Math.abs(r.verdict.change).toFixed(1)}%` : ""}`.trim();
            const isSelected = selected?.kind === "subject" && selected.key === r.subject.key;
            const name = displayName(r.subject);
            const label = (
              <span className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{outside ? "Outside this range" : text}</span>
              </span>
            );
            return (
              <li key={r.subject.key} data-lane={r.subject.key} className={cn("flex flex-col gap-1 border-t border-border py-1.5 first:border-t-0", isSelected && "bg-accent-subtle")}>
                {move ? (
                  label
                ) : (
                  <button type="button" aria-pressed={isSelected} onClick={() => onSelect({ kind: "subject", key: r.subject.key })} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {label}
                  </button>
                )}
                <div className="relative h-3">
                  {!outside ? (
                    <>
                      <span className={cn("absolute top-1/2 h-0.5 -translate-y-1/2", LINE[state])} style={{ left: `${pct(from)}%`, width: `${Math.max(pct(to) - pct(from), 0)}%` }} />
                      {from >= start ? <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: `${pct(from)}%` }} /> : null}
                      {to <= end ? <span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", LINE[state])} style={{ left: `${pct(to)}%` }} /> : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {verdictLanes.length === 0 ? <p className="text-sm text-muted-foreground">No lift or benchmark has a verdict yet.</p> : null}
      </section>
    </div>
  );
}
