import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatShortDate } from "./charts/chartUtils";
import { cn } from "@/lib/utils";

export interface WorkoutListRow {
  date: string;
  title: string;
  /** The keyword or movement that put this workout in this bucket. */
  reason: string;
  /** Optional trailing detail — the M/W/G split on modality tabs. */
  detail?: string;
}

const PAGE_SIZE = 50;

/**
 * The collapsible audit list.
 *
 * Showing WHY each workout was classified is the point: the classifier is a
 * keyword heuristic, not ground truth, and an athlete whose gym names workouts
 * unusually needs to be able to see that for themselves rather than trust a
 * number. Long lists are paged rather than rendered whole — some domains match
 * over a thousand workouts.
 */
export function WorkoutList({
  rows,
  emptyMessage,
  reasonLabel = "matched on",
  scope,
}: {
  rows: WorkoutListRow[];
  emptyMessage: string;
  reasonLabel?: string;
  /**
   * The list has been narrowed to a picked chart point (ChartPick.tsx): `rows` are already only that point's workouts, the list opens,
   * and a line above it names the point with a way back to every workout.
   */
  scope?: { label: string; onClear: () => void } | undefined;
}) {
  const [open, setOpen] = useState(false);
  // Picking a point is asking to see its workouts, so the list opens; clearing leaves it as the athlete had it.
  useEffect(() => {
    if (scope) {
      setOpen(true);
      setVisible(PAGE_SIZE);
    }
  }, [scope?.label]);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
          {/* Narrowed to a picked point, the rows are that point's, not all of them. */}
          {open ? "Hide" : "Show"}{" "}
          {scope
            ? rows.length === 1
              ? "this workout"
              : `these ${rows.length.toLocaleString()} workouts`
            : `all ${rows.length.toLocaleString()} ${rows.length === 1 ? "workout" : "workouts"}`}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4">
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
              setVisible(PAGE_SIZE);
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
                <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Workout</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{reasonLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visible).map((row, i) => (
                <tr key={`${row.date}-${row.title}-${i}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular">
                    {formatShortDate(row.date)}
                  </td>
                  <td className="px-3 py-2">
                    {row.title || <span className="text-muted-foreground">Untitled</span>}
                    {row.detail ? (
                      <span className="ml-2 text-xs text-muted-foreground tabular">{row.detail}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Badge variant="secondary" className="font-normal">
                      {row.reason}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No workouts match that filter.</p>
        ) : null}

        {visible < filtered.length ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
