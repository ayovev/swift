import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { bodyContextLines, type BodyReading } from "@/lib/analytics/insights/bodyContext";
import { crossReference, displayName, factsLine, monthYear, moveUpText, verdictText, newBestText } from "@/lib/analytics/insights/display";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import type { ProgressSubject } from "@/lib/analytics/insights/sessions";
import { bestSession } from "@/lib/analytics/insights/verdict";
import { cn } from "@/lib/utils";
import { EvidenceChart } from "./EvidenceChart";
import { VerdictPill, type VerdictKind } from "./verdictMark";


interface ProgressRowItemProps {
  row: ProgressRow;
  /** The same movement logged the other way (RX or Scaled), for the cross-reference line. */
  twin: ProgressSubject | null;
  readings: readonly BodyReading[];
  bandLb: number;
  /** Opens this subject on the Timeline. Offered under the opened chart of a subject that has a lane there. */
  onSeeOnTimeline?: (subjectKey: string) => void;
  /** Start opened and scrolled into view: the row was reached from Overview's "What moved". */
  focused?: boolean;
}

/**
 * One subject. A verdict row shows what it compared and the change; a subject below the gate shows a facts line and no verdict word, a
 * percentage or a pill; a move up to RX shows its reason and does not open. A row opens to its evidence chart.
 *
 * Collapsed, a verdict row is its name and pill, the change and the windows compared
 * (and the long-gap caveat when there is one, since it qualifies the verdict). Everything else (the new best, the RX or Scaled
 * cross-reference, the body-context lines) opens with the chart: a row of five to seven lines buried the verdict, and ten of them
 * made a page of text with the evidence hidden. A move up to RX does not open, so its lines stay on the row.
 *
 * No inline chart on the collapsed row: a dot sparkline and then a change bar on a shared scale were both tried here and removed. At
 * that size neither added anything the row's words don't say, and both read as clutter. The evidence is the opened chart.
 */
export function ProgressRowItem({ row, twin, readings, bandLb, onSeeOnTimeline, focused = false }: ProgressRowItemProps) {
  const { subject, verdict, group, moveUp, moveUpVotes } = row;
  const isMove = !verdict && moveUpVotes && !!moveUp;
  const openable = !isMove && subject.sessions.length >= 2;
  const [open, setOpen] = useState(focused && openable);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // jsdom has no scrollIntoView; a real browser does.
    if (focused) ref.current?.scrollIntoView?.({ block: "start" });
  }, [focused]);
  // Only the four verdict groups carry a pill; a subject below the gate or not recent shows none.
  const pill = group === "up" || group === "down" || group === "not-tested-since" || group === "no-clear-change";
  const text = verdict ? verdictText(subject, verdict) : null;
  const earlierBest = verdict ? bestSession(subject.sessions.slice(0, subject.sessions.length - verdict.window), subject.lowerIsBetter) : null;
  const newBest = verdict && earlierBest ? newBestText(subject, verdict, earlierBest) : null;
  // With a verdict, the detail lines open with the chart; a row that can't open keeps them.
  const detailShown = !verdict || !openable || open;
  const showBody = detailShown && (group === "up" || group === "down" || group === "not-tested-since" || group === "no-clear-change" || isMove);
  const body = showBody
    ? verdict
      ? bodyContextLines({ subject, state: verdict.state, change: verdict.change, from: verdict.previousBest.date, to: verdict.recentBest.date, bests: { previous: verdict.previousBest.value, recent: verdict.recentBest.value } }, readings, bandLb)
      : isMove && moveUp
        ? bodyContextLines({ subject, state: "move-up", change: null, from: moveUp.scaledDate, to: moveUp.date, bests: null }, readings, bandLb)
        : null
    : null;
  const notRecent = group === "not-recent" ? `Not recent: last logged ${monthYear(row.latest)}.` : null;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-sm font-medium">
        {displayName(subject)}
        {pill && (verdict || isMove) ? <VerdictPill kind={(isMove ? "move-up" : group) as VerdictKind} /> : null}
      </span>
    </div>
  );

  return (
    <li ref={ref} className="flex flex-col gap-1 border-t border-border px-4 py-3 first:border-t-0" data-group={group}>
      {openable ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="min-w-0 flex-1">{header}</span>
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
          {newBest && detailShown ? <p className="text-xs text-muted-foreground">{newBest}</p> : null}
        </>
      ) : null}
      {!verdict && !isMove ? <p className="text-sm text-muted-foreground">{factsLine(subject)}</p> : null}
      {notRecent ? <p className="text-xs text-muted-foreground">{notRecent}</p> : null}
      {twin && detailShown ? <p className="text-xs text-muted-foreground">{crossReference(twin)}</p> : null}
      {body ? (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <p className="text-xs text-muted-foreground">{body.first}</p>
          {body.relation ? <p className="text-xs">{body.relation}</p> : null}
        </div>
      ) : null}
      {open && openable ? (
        <div className="pt-2">
          <EvidenceChart subject={subject} verdict={verdict} />
          {/* A subject has a lane on the Timeline only with a verdict in one of the four open or clear groups: not a facts line, not "not recent". */}
          {verdict && group !== "not-recent" && group !== "few" && onSeeOnTimeline ? (
            <button type="button" onClick={() => onSeeOnTimeline(subject.key)} className="mt-1 text-sm text-accent-link underline underline-offset-2">
              See on timeline
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
