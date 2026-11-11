import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "./charts/chartUtils";
import { cn } from "@/lib/utils";

export interface WorkoutListRow {
  date: string;
  title: string;
  /** The keyword or movement that put this workout in this bucket. */
  reason: string;
  /** Optional trailing detail — the M/W/G split on modality tabs. */
  detail?: string;
  /** The text that matched, marked in the opened row's title and description. Omit when the reason isn't text from the workout. */
  highlight?: readonly string[];
}

/** Rows shown before any "Show more": enough to judge the classifier at a glance, without a click. */
export const INITIAL_ROWS = 10;
const PAGE_SIZE = 50;

/**
 * `text` with every case-insensitive occurrence of each phrase wrapped in <mark>. Plain substring search, like the classifier's own
 * engine (matcher.ts), so glued text such as "21-15-9DeadliftsPull-ups" still marks "deadlift".
 */
export function Highlighted({ text, phrases }: { text: string; phrases: readonly string[] }) {
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const p of phrases) {
    const q = p.trim().toLowerCase();
    if (!q) continue;
    for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) hits.push([i, i + q.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [a, b] of hits) {
    if (a < at) continue;
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="rounded-sm bg-accent-subtle text-foreground">
        {text.slice(a, b)}
      </mark>
    );
    at = b;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * The audit list.
 *
 * Showing WHY each workout was classified is the point: the classifier is a
 * keyword heuristic, not ground truth, and an athlete whose gym names workouts
 * unusually needs to be able to see that for themselves rather than trust a
 * number. So the first INITIAL_ROWS show without a click (the list used to sit
 * closed behind "Show all 1,032 workouts"), and each row opens, as on Workouts,
 * to the workout's description with the matched text marked. Long lists are
 * paged rather than rendered whole — some domains match over a thousand workouts.
 */
export function WorkoutList({
  rows,
  emptyMessage,
  reasonLabel = "matched on",
  scope,
  describe,
}: {
  rows: WorkoutListRow[];
  emptyMessage: string;
  reasonLabel?: string;
  /**
   * The list has been narrowed to a picked chart point (ChartPick.tsx): `rows` are already only that point's workouts, and a line
   * above it names the point with a way back to every workout.
   */
  scope?: { label: string; onClear: () => void } | undefined;
  /** A workout's description by its date and title, for an opened row. Omit and rows don't open. */
  describe?: ((date: string, title: string) => string | undefined) | undefined;
}) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(INITIAL_ROWS);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // A new pick starts the list from its top again.
  useEffect(() => {
    setVisible(INITIAL_ROWS);
  }, [scope?.label]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const toggle = (key: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
        {scope ? (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 text-sm">
            <span>
              Only <span className="font-medium">{scope.label}</span>
            </span>
            <button type="button" onClick={scope.onClear} className="inline-flex min-h-11 items-center text-accent-link underline-offset-2 hover:underline sm:min-h-8">
              Show every workout
            </button>
          </p>
        ) : null}
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(INITIAL_ROWS);
            }}
            placeholder="Filter by workout name or keyword"
            aria-label="Filter workouts"
            className={cn(
              "h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          />
        </div>

        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Workouts classified here, with the {reasonLabel} value for each
            </caption>
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {/* On a phone the date moves under the title, as on Workouts, so the table fits without scrolling sideways. */}
                <th scope="col" className="hidden px-3 py-2 text-left font-medium sm:table-cell">Date</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Workout</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{reasonLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visible).map((row, i) => {
                const key = `${row.date}-${row.title}-${i}`;
                const description = describe?.(row.date, row.title);
                const isOpen = opened.has(key);
                const marks = row.highlight ?? [];
                return (
                  <Fragment key={key}>
                    <tr className="border-t border-border align-top">
                      <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground tabular sm:table-cell">
                        {formatShortDate(row.date)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          aria-expanded={description ? isOpen : undefined}
                          disabled={!description}
                          className={cn("flex w-full items-start gap-1.5 text-left", description && "cursor-pointer")}
                        >
                          <ChevronRight
                            className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90", !description && "invisible")}
                            aria-hidden="true"
                          />
                          <span>
                            <span className="block text-xs text-muted-foreground tabular sm:hidden">{formatShortDate(row.date)}</span>
                            {row.title ? isOpen ? <Highlighted text={row.title} phrases={marks} /> : row.title : <span className="text-muted-foreground">Untitled</span>}
                            {row.detail ? (
                              <span className="ml-2 text-xs text-muted-foreground tabular">{row.detail}</span>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Badge variant="secondary" className="font-normal">
                          {row.reason}
                        </Badge>
                      </td>
                    </tr>
                    {isOpen && description ? (
                      <tr className="border-t border-border bg-muted/30">
                        <td colSpan={3} className="whitespace-pre-line px-3 py-3 pl-9 text-sm text-muted-foreground" data-description>
                          <Highlighted text={description} phrases={marks} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No workouts match that filter.</p>
        ) : null}

        {visible < filtered.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
            </Button>
            <span className="text-xs text-muted-foreground tabular">
              Showing {visible.toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
          </div>
        ) : null}
    </div>
  );
}
