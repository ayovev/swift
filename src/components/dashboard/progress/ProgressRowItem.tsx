import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { bodyContextLines, type BodyReading } from "@/lib/analytics/insights/bodyContext";
import { crossReference, displayName, factsLine, monthYear, moveUpText, verdictText, newBestText } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession } from "@/lib/analytics/insights/verdict";
import { cn } from "@/lib/utils";
import { EvidenceChart } from "./EvidenceChart";

const PILL: Record<string, { label: string; className: string }> = {
  up: { label: "Up", className: "bg-accent-subtle text-accent-link" },
  down: { label: "Down", className: "bg-destructive/10 text-destructive" },
  "not-tested-since": { label: "Not tested since", className: "border border-border bg-muted text-foreground" },
  "no-clear-change": { label: "No clear change", className: "bg-muted text-muted-foreground" },
};

interface ProgressRowItemProps {
  row: ProgressRow;
  /** The same movement logged the other way (RX or Scaled), for the cross-reference line. */
  twin: ProgressSubject | null;
  readings: readonly BodyReading[];
  bandLb: number;
}

/**
 * One subject. A verdict row shows what it compared and the change; a subject below the gate shows a facts line and no verdict word, a
 * percentage or a pill; a move up to RX shows its reason and does not open. Body-context lines sit on the rows of Up, Down and Not tested
 * since, and on a No clear change row once it is opened. A row opens to its evidence chart.
 */
export function ProgressRowItem({ row, twin, readings, bandLb }: ProgressRowItemProps) {
  const { subject, verdict, group, moveUp, moveUpVotes } = row;
  const [open, setOpen] = useState(false);
  const isMove = !verdict && moveUpVotes && !!moveUp;
  const openable = !isMove && subject.sessions.length >= 2;
  const pill = PILL[group];
  const text = verdict ? verdictText(subject, verdict) : null;
  const earlierBest = verdict ? bestSession(subject.sessions.slice(0, subject.sessions.length - verdict.window), subject.lowerIsBetter) : null;
  const newBest = verdict && earlierBest ? newBestText(subject, verdict, earlierBest) : null;
  const showBody = group === "up" || group === "down" || group === "not-tested-since" || (group === "no-clear-change" && open);
  const body = showBody
    ? verdict
      ? bodyContextLines({ subject, state: verdict.state, change: verdict.change, from: verdict.previousBest.date, to: verdict.recentBest.date, bests: { previous: verdict.previousBest.value, recent: verdict.recentBest.value } }, readings, bandLb)
      : isMove && moveUp
        ? bodyContextLines({ subject, state: "move-up", change: null, from: moveUp.scaledDate, to: moveUp.date, bests: null }, readings, bandLb)
        : null
    : null;
  const notRecent = group === "not-recent" ? `Not recent: last logged ${monthYear(row.latest)}.` : null;

  const header = (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-sm font-medium">
        {displayName(subject)}
        {pill && (verdict || isMove) ? (
          <span className={cn("ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold", PILL[isMove ? "up" : group]?.className)}>
            {PILL[isMove ? "up" : group]?.label}
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <li className="flex flex-col gap-1 border-t border-border px-4 py-3 first:border-t-0" data-group={group}>
      {openable ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-baseline justify-between gap-3 text-left">
          {header}
          <ChevronDown className={cn("size-4 shrink-0 self-center text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      ) : (
        header
      )}
      {isMove && moveUp ? <p className="text-sm text-muted-foreground">{moveUpText(moveUp)}</p> : null}
      {text ? (
        <>
          <p className="text-sm">{text.change}</p>
          <p className="text-xs text-muted-foreground">{text.windows}</p>
          {text.longGap ? <p className="text-xs text-muted-foreground">{text.longGap}</p> : null}
          {newBest ? <p className="text-xs text-muted-foreground">{newBest}</p> : null}
        </>
      ) : null}
      {!verdict && !isMove ? <p className="text-sm text-muted-foreground">{factsLine(subject)}</p> : null}
      {notRecent ? <p className="text-xs text-muted-foreground">{notRecent}</p> : null}
      {twin ? <p className="text-xs text-muted-foreground">{crossReference(twin)}</p> : null}
      {body ? (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <p className="text-xs text-muted-foreground">{body.first}</p>
          {body.relation ? <p className="text-xs">{body.relation}</p> : null}
        </div>
      ) : null}
      {open && openable ? (
        <div className="pt-2">
          <EvidenceChart subject={subject} verdict={verdict} />
        </div>
      ) : null}
    </li>
  );
}
