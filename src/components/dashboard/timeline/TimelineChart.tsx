import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import dayjs from "dayjs";
import { entryEnd, entryName } from "@/lib/analytics/timeline";
import { displayName, monthSpan, monthYear } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import { dayNumber } from "@/lib/analytics/insights/verdict";
import { cn } from "@/lib/utils";
import { VerdictPill, type VerdictKind } from "../progress/verdictMark";
import type { TimelineEntry } from "@/types/timeline";

export type Selection = { kind: "entry"; id: string } | { kind: "subject"; key: string } | null;


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

/** A "Mmm YYYY" axis label in the 10px mono face needs about this much room, gap included. */
const TICK_ROOM_PX = 76;

/** A tick at each month start, spaced so at most `count` fit (six on a desktop, as many as the width allows on a phone). */
function ticks(start: string, end: string, count = 6): { date: string; label: string }[] {
  const months = Math.max(1, dayjs(end).diff(dayjs(start), "month"));
  const step = Math.max(1, Math.ceil(months / Math.max(2, count)));
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
  // The width of the entries area, so a label's room can be counted in pixels: a lane is free only when neither the bar nor its name
  // would touch the next entry's.
  const areaRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const measure = () => setWidth(areaRef.current?.clientWidth || 1000);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const { placed, lanes } = useMemo(() => {
    const px = (iso: string): number => (Math.min(100, Math.max(0, ((dayNumber(iso) - dayNumber(start)) / span) * 100)) / 100) * width;
    const items = visible
      .map((entry) => {
        const a = px(entry.startDate);
        const b = Math.max(px(entryEnd(entry, asOf)), a + 10);
        const label = (entryName(entry).length + (entry.endDate === null ? 2 : 0)) * 7 + 8;
        const inside = b - a >= label + 12;
        // Outside the bar, the label goes right when it fits, else left when that fits, else to the side with more room, cut to fit
        // with an ellipsis: on a phone a long name ("Switched to a protein-forward diet") fitted neither side and ran off the box.
        const roomRight = width - b - 6;
        const roomLeft = a - 6;
        const left = !inside && label > roomRight && (label <= roomLeft || roomLeft > roomRight);
        const fit = inside ? label : Math.min(label, Math.max(40, left ? roomLeft : roomRight));
        const lo = !inside && left ? a - fit : a;
        const hi = inside ? b : left ? b : Math.max(b, b + fit);
        return { entry, lo, hi, inside, left, maxLabel: fit < label ? fit : null };
      })
      .sort((x, y) => x.entry.startDate.localeCompare(y.entry.startDate) || x.entry.id.localeCompare(y.entry.id));
    const ends: number[] = [];
    const out = items.map((it) => {
      let lane = ends.findIndex((end) => end + 4 <= it.lo);
      if (lane === -1) lane = ends.length;
      ends[lane] = it.hi;
      return { ...it, lane };
    });
    return { placed: out, lanes: ends.length };
  }, [visible, start, span, width, asOf]);
  // As many ticks as fit the measured width: six labels overlapped on a phone once the end labels were held inside the axis.
  const axis = useMemo(() => ticks(start, end, width > 0 ? Math.min(6, Math.floor(width / TICK_ROOM_PX)) : 6), [start, end, width]);

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
          ref={areaRef}
          data-testid="entries-area"
          onClick={onEntriesClick}
          className="relative cursor-copy rounded-md border border-border bg-muted/30"
          style={{ height: Math.max(1, lanes) * 28 + 8 }}
        >
          {visible.length === 0 ? <p className="pointer-events-none px-3 py-2 text-sm text-muted-foreground">No entries in this range.</p> : null}
          {placed.map(({ entry, lane, inside, left: labelLeft, maxLabel }) => {
            const left = pct(entry.startDate);
            const right = pct(entryEnd(entry, asOf));
            const barWidth = Math.max(right - left, 0);
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
                  changed ? "bg-accent-link text-background forced-colors:border forced-colors:border-[CanvasText]" : "border border-dashed border-foreground bg-background text-foreground",
                  isSelected && "ring-2 ring-foreground"
                )}
                style={{ top: 4 + lane * 28, left: `${left}%`, width: `max(${barWidth}%, 10px)` }}
              >
                {inside ? <span className="truncate px-1.5">{name}{ongoing ? " →" : ""}</span> : null}
                {!inside ? (
                  <span
                    className={cn("absolute truncate whitespace-nowrap text-foreground", labelLeft ? "right-full mr-1.5" : "left-full ml-1.5")}
                    style={maxLabel !== null ? { maxWidth: maxLabel } : undefined}
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
          // Centred on its date, except near either end, where it is held inside the axis rather than cut off.
          <span
            key={t.date}
            className={cn(
              "absolute top-0.5 whitespace-nowrap font-mono text-[10px] text-muted-foreground",
              pct(t.date) < 8 ? "translate-x-0" : pct(t.date) > 92 ? "-translate-x-full" : "-translate-x-1/2"
            )}
            style={{ left: `${pct(t.date)}%` }}
          >
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
            const span = (list: readonly { date: string }[]): [string, string] => {
              const ds = list.map((x) => x.date).sort();
              return [ds[0]!, ds[ds.length - 1]!];
            };
            const windows = r.verdict ? { previous: span(r.verdict.previous), recent: span(r.verdict.recent) } : null;
            const first = windows ? windows.previous[0] : from;
            const last = windows ? windows.recent[1] : to;
            const outside = last < start || first > end;
            // How the lane is marked: shape and glyph per verdict (verdictMark.tsx), never the accent alone.
            const kind: VerdictKind = move ? "move-up" : r.verdict ? r.verdict.state : "up";
            const change = !move && r.verdict && r.verdict.change !== 0 ? `${r.verdict.change > 0 ? "+" : "−"}${Math.abs(r.verdict.change).toFixed(1)}%` : null;
            const isSelected = selected?.kind === "subject" && selected.key === r.subject.key;
            const name = displayName(r.subject);
            const label = (
              <span className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {outside ? (
                    "Outside this range"
                  ) : (
                    // The same pill as Progress and Overview, so a verdict looks the same wherever it is shown.
                    <span className="inline-flex items-center gap-1.5">
                      <VerdictPill kind={kind} className="ml-0" />
                      {change ? <span className="tabular">{change}</span> : null}
                    </span>
                  )}
                </span>
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
                {/* When, in words. The lane used to draw the two windows on the date axis; every drawing tried (a line between the bests,
                    then bands with the bests as dots) read as something it wasn't, so the dates are text until a better pattern is found. */}
                {!outside ? (
                  <p className="pl-0 text-xs text-muted-foreground tabular" data-compared>
                    {windows
                      ? `Compared ${monthSpan(windows.previous[0], windows.previous[1])} with ${monthSpan(windows.recent[0], windows.recent[1])}`
                      : `Last Scaled ${monthYear(from)}, first RX ${monthYear(to)}`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {verdictLanes.length === 0 ? <p className="text-sm text-muted-foreground">No lift or benchmark has a verdict yet.</p> : null}
      </section>
    </div>
  );
}
