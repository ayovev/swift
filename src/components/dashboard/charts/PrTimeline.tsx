import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "./chartUtils";
import type { PrTimelineEntry } from "@/types/dashboard";

const INITIAL_VISIBLE = 12;

/** Chronological PR history, most recent first. */
export function PrTimeline({ prs }: { prs: PrTimelineEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  const ordered = useMemo(
    () => [...prs].sort((a, b) => b.date.localeCompare(a.date)),
    [prs]
  );

  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">No PRs are flagged in this export.</p>;
  }

  const visible = expanded ? ordered : ordered.slice(0, INITIAL_VISIBLE);

  return (
    <div>
      <ol className="relative flex flex-col gap-0 border-l border-border pl-5">
        {visible.map((pr, i) => (
          <li key={`${pr.date}-${i}`} className="relative py-2">
            <span
              className="absolute -left-[1.4rem] top-3.5 size-2 rounded-full bg-primary ring-4 ring-background"
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium">{pr.barbell_lift ?? pr.title}</span>
              <span className="text-sm text-accent-link tabular">{pr.display || "—"}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(pr.date)}</span>
          </li>
        ))}
      </ol>

      {ordered.length > INITIAL_VISIBLE ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 gap-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <Trophy className="size-3.5" aria-hidden="true" />
          {expanded ? "Show fewer" : `Show all ${ordered.length} PRs`}
        </Button>
      ) : null}
    </div>
  );
}
