import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { entryBodyWeightLine, entryFactsLines, entryLeftOut, entryShortfall, entrySummary, overlapsLine } from "@/lib/analytics/insights/entryDisplay";
import { entryVerdict } from "@/lib/analytics/insights/entryVerdict";
import type { BodyReading } from "@/lib/analytics/insights/bodyContext";
import { displayName, verdictText } from "@/lib/analytics/insights/display";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { entryName, entrySpanText, overlappingEntries } from "@/lib/analytics/timeline";
import { AREA_LABEL, INITIATION_LABEL, type TimelineEntry } from "@/types/timeline";

const STATE_WORD: Record<string, string> = { up: "Up", down: "Down", "not-tested-since": "Not tested since", "no-clear-change": "No clear change" };

interface EntryDetailProps {
  entry: TimelineEntry;
  all: readonly TimelineEntry[];
  subjects: readonly ProgressSubject[];
  readings: readonly BodyReading[];
  bandLb: number;
  asOf: string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * One entry: its kind, area, dates and note, then (only for something the athlete changed) the lifts and benchmarks compared before and
 * during it, body weight once over its span, and the entries it overlaps. Something that happened shows no comparison. Nothing here is a
 * cause: the sentences state what was logged.
 */
export function EntryDetail({ entry, all, subjects, readings, bandLb, asOf, onEdit, onDelete }: EntryDetailProps) {
  const changed = entry.initiation === "changed";
  const verdict = useMemo(() => (changed ? entryVerdict(entry, subjects, asOf) : null), [changed, entry, subjects, asOf]);
  const overlaps = overlapsLine(overlappingEntries(entry, all, asOf).map(entryName));
  const body = entryBodyWeightLine(entry, readings, bandLb, asOf);
  const summary = verdict ? entrySummary(verdict) : null;
  const facts = verdict && !verdict.label ? entryFactsLines(verdict, entry, asOf) : null;
  const so = entry.endDate === null ? " so far" : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold">{entryName(entry)}</h3>
          <p className="text-sm text-muted-foreground">
            {INITIATION_LABEL[entry.initiation]} · {AREA_LABEL[entry.area]}
          </p>
          <p className="text-sm">{entrySpanText(entry)}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      {entry.note ? <p className="text-sm">{entry.note}</p> : null}

      {verdict ? (
        <section aria-label="Before and after" className="flex flex-col gap-2 border-t border-border pt-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Before and after{so}</h4>
          {summary ? (
            <>
              <p className="text-sm">{summary}</p>
              {entryLeftOut(verdict) ? <p className="text-xs text-muted-foreground">{entryLeftOut(verdict)}</p> : null}
              <ul className="flex flex-col gap-1 text-sm">
                {verdict.compared.map((r) => (
                  <li key={r.subject.key}>
                    <span className="font-medium">{displayName(r.subject)}</span>
                    {r.verdict ? <span className="text-muted-foreground"> · {STATE_WORD[r.verdict.state]}, {verdictText(r.subject, r.verdict).change}</span> : null}
                  </li>
                ))}
                {verdict.moveUps.map((m) => (
                  <li key={m.subject.key}>
                    <span className="font-medium">{displayName(m.subject)}</span>
                    <span className="text-muted-foreground"> · Moved up to RX</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No before and after yet</p>
              <p className="text-sm text-muted-foreground">{entryShortfall(verdict)}</p>
              {facts && facts.lines.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {facts.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {facts.more > 0 ? <li>and {facts.more} more</li> : null}
                </ul>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          None. Something that happened is shown beside your results for context and gets no before and after comparison.
        </p>
      )}

      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
      {overlaps ? <p className="text-sm text-muted-foreground">{overlaps}</p> : null}
    </div>
  );
}
