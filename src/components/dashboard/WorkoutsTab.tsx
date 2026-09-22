import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModalityBar } from "./charts/ModalityBar";
import { FIXED_MODALITY_COLORS, formatShortDate } from "./charts/chartUtils";
import { cn } from "@/lib/utils";
import { MODALITY_LIST, MODALITY_SHORT_LABELS, type ModalityData } from "@/types/modality";

const PAGE_SIZE = 50;

/**
 * The running list of every logged workout, each row paired with its M/W/G
 * split as a stacked progress bar — see ModalityBar. Unlike WorkoutList (an
 * audit trail scoped to one domain or modality, collapsed behind "show all"),
 * this tab's whole point IS the list, so it renders open by default.
 *
 * Each row expands in place to the workout's full description and score —
 * data already sitting in ParsedRow.raw and unused elsewhere in this tab, so
 * no new parsing or fetch is involved, just surfacing it on click.
 */
export function WorkoutsTab({ data }: { data: ModalityData }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.all_workouts;
    return data.all_workouts.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.movements.some((m) => m.toLowerCase().includes(q))
    );
  }, [data.all_workouts, query]);

  const rows = filtered.slice(0, visible);
  const total = data.all_workouts.length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workouts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every workout in this export, most recent first, with its proportional split across
            metabolic conditioning, weightlifting and gymnastics.
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
            {MODALITY_LIST.map((m) => (
              <span key={m} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: FIXED_MODALITY_COLORS[m] }}
                  aria-hidden="true"
                />
                {MODALITY_SHORT_LABELS[m]}
              </span>
            ))}
            {data.unclassified_count > 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                Not classified
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="relative">
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
              placeholder="Filter by workout name or movement"
              aria-label="Filter workouts"
              className={cn(
                "h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
            />
          </div>

          {total === 0 ? (
            <p className="text-sm text-muted-foreground">No workouts in this export.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Every logged workout with its metabolic/weightlifting/gymnastics split; each row
                  expands to the full description and score
                </caption>
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Workout</th>
                    <th scope="col" className="w-48 px-3 py-2 text-left font-medium sm:w-64">
                      M / W / G
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w, i) => {
                    const key = `${w.date}-${w.title}-${i}`;
                    const isOpen = expanded.has(key);
                    const hasDetail = w.description || w.result || w.rx || w.pr;
                    return (
                      <Fragment key={key}>
                        <tr className="border-t border-border align-top">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular">
                            {formatShortDate(w.date)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggle(key)}
                              aria-expanded={isOpen}
                              disabled={!hasDetail}
                              className={cn(
                                "flex w-full items-start gap-1.5 text-left",
                                hasDetail && "cursor-pointer"
                              )}
                            >
                              <ChevronRight
                                className={cn(
                                  "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
                                  isOpen && "rotate-90",
                                  !hasDetail && "invisible"
                                )}
                                aria-hidden="true"
                              />
                              <span>
                                <div>{w.title || <span className="text-muted-foreground">Untitled</span>}</div>
                                {w.movements.length > 0 ? (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {w.movements.join(", ")}
                                  </div>
                                ) : null}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <ModalityBar split={w.split} classified={w.classified} />
                            <div className="mt-1 text-xs text-muted-foreground tabular">
                              {w.classified
                                ? `M ${w.split.M.toFixed(0)} / W ${w.split.W.toFixed(0)} / G ${w.split.G.toFixed(0)}`
                                : "not classified"}
                            </div>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-t border-border bg-muted/30">
                            <td colSpan={3} className="px-3 py-3 pl-9">
                              {w.description ? (
                                <p className="max-w-2xl text-sm leading-relaxed">{w.description}</p>
                              ) : (
                                <p className="text-sm text-muted-foreground">No description logged.</p>
                              )}
                              {w.result || w.rx || w.pr ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs">
                                  {w.pr ? (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      PR
                                    </Badge>
                                  ) : null}
                                  {w.result ? (
                                    <span className="font-medium tabular">{w.result}</span>
                                  ) : null}
                                  {w.rx ? (
                                    <span className="uppercase tracking-wide text-muted-foreground">
                                      {w.rx.toLowerCase()}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && total > 0 ? (
            <p className="text-sm text-muted-foreground">No workouts match that filter.</p>
          ) : null}

          {visible < filtered.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
