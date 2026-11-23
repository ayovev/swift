import dayjs from "dayjs";
import { VerdictPill, headlineLabelClass, type VerdictKind } from "@/components/dashboard/progress/verdictMark";
import { displayName, moveUpText, noHeadlineText, verdictText } from "@/lib/analytics/insights/display";
import { entryFactsLines, entryLeftOut, entryShortfall, entrySummary } from "@/lib/analytics/insights/entryDisplay";
import { entryName, entrySpanText } from "@/lib/analytics/timeline";
import { AREA_LABEL, INITIATION_LABEL } from "@/types/timeline";
import { headlineSentence, type ProgressRow } from "@/lib/analytics/insights/headline";
import type { ProgressReportData } from "@/lib/analytics/insights/progressReport";
import { sinceStateLabel, type SinceState } from "@/lib/analytics/insights/sinceDate";

/** Which optional sections of the Progress report are printed (docs/reports.md, R-3). The headline is always there. */
export interface ProgressSections {
  since: boolean;
  /** PRs after the comparison date. */
  prs: boolean;
  verdicts: boolean;
  /** The Timeline entries that touch the period, with a before and after for each the athlete changed. */
  changes: boolean;
  /** Body weight over each entry's span. Off by default (docs/reports.md, R-3). */
  body: boolean;
  notJudged: boolean;
}

/** A ceiling on the PR list, so a long run of PRs does not take the page; "and N more" says what was left off. */
export const PRS_SHOWN = 20;

const STATE_WORD: Record<string, string> = { up: "Up", down: "Down", "not-tested-since": "Not tested since", "no-clear-change": "No clear change" };

const longDate = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

/** The pill kind for a state that is a verdict; the others print as plain words. */
const PILL: Partial<Record<SinceState, VerdictKind>> = {
  up: "up",
  down: "down",
  "not-tested-since": "not-tested-since",
  "no-clear-change": "no-clear-change",
  "move-up": "move-up",
};

function StateMark({ state }: { state: SinceState }) {
  const kind = PILL[state];
  // The pill carries its own left margin for sitting beside a name; in a cell it stands alone.
  return kind ? <VerdictPill kind={kind} className="ml-0" /> : <span className="text-muted-foreground">{sinceStateLabel(state)}</span>;
}

function verdictKindOf(row: ProgressRow): VerdictKind | null {
  if (row.moveUpVotes) return "move-up";
  return row.group === "up" || row.group === "down" || row.group === "not-tested-since" || row.group === "no-clear-change" ? row.group : null;
}

const KIND_ORDER: VerdictKind[] = ["up", "move-up", "down", "not-tested-since", "no-clear-change"];

/**
 * The Progress report's body: the headline, optionally what changed since a chosen date, each lift and benchmark's verdict, and the
 * subjects too thin or too old to judge. Wording and numbers are Progress's own (`display.ts`); "est. 1RM" is on every lift sentence.
 */
export function ProgressReport({ data, since, endsToday, sections }: { data: ProgressReportData; since: string | null; endsToday: boolean; sections: ProgressSections }) {
  const { headline, comparison, rows } = data;
  const end = data.today;
  // A period that runs to today reads "since"; a closed one names both ends.
  const span = (start: string): string => (endsToday ? `since ${longDate(start)}` : `from ${longDate(start)} to ${longDate(end)}`);
  const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

  const judged = rows
    .map((row) => ({ row, kind: verdictKindOf(row) }))
    .filter((x): x is { row: ProgressRow; kind: VerdictKind } => x.kind !== null)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const notJudged = rows.filter((r) => verdictKindOf(r) === null);

  // Only subjects that carry a verdict or a vote on either date, and that changed or were logged since. "Not logged yet" to "Fewer than 6 sessions"
  // is a subject starting out, not a change a report should lead with; those subjects are still listed under "Not judged" when that section is on.
  const stated = (s: SinceState): boolean => PILL[s] !== undefined;
  const sinceRows = comparison ? comparison.rows.filter((r) => (stated(r.then) || stated(r.now)) && (r.changed || r.sessionsSince > 0)) : [];
  const sinceSorted = [...sinceRows].sort((a, b) => Number(b.changed) - Number(a.changed));

  return (
    <>
      <section className="report-card">
        <h3 className="report-heading text-lg font-semibold">
          <span className={headline.label ? headlineLabelClass(headline.label) : ""}>{headline.label ?? "No headline yet"}</span>
        </h3>
        <p className="mt-1 text-sm">
          {headline.label ? headlineSentence(headline.label, headline.up, headline.down, headline.noClearChange) : noHeadlineText(headline)}
        </p>
        {since ? <p className="mt-1 text-sm text-muted-foreground">Compared {span(since)}.</p> : null}
      </section>

      {comparison && sections.since ? (
        <section data-testid="report-since">
          <h3 className="report-heading text-lg font-semibold">{upper(span(comparison.since))}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Then: {comparison.headlineThen.label ?? "no headline"}. {endsToday ? "Now" : "At the end"}: {comparison.headlineNow.label ?? "no headline"}. Each row is Progress as it stood on {longDate(comparison.since)}, against {endsToday ? "today" : longDate(end)}.
          </p>
          {sinceSorted.length > 0 ? (
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <caption className="sr-only">Lifts and benchmarks that changed or were logged {span(comparison.since)}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="py-1 pr-2 font-medium">Lift or benchmark</th>
                  <th scope="col" className="py-1 pr-2 font-medium">Then</th>
                  <th scope="col" className="py-1 pr-2 font-medium">{endsToday ? "Now" : "At the end"}</th>
                  <th scope="col" className="py-1 text-right font-medium">Sessions since</th>
                </tr>
              </thead>
              <tbody>
                {sinceSorted.map((r) => (
                  <tr key={r.key} className="report-row border-b border-border">
                    <th scope="row" className="py-1.5 pr-2 font-medium">{displayName(r.subject)}</th>
                    <td className="py-1.5 pr-2"><StateMark state={r.then} /></td>
                    <td className="py-1.5 pr-2"><StateMark state={r.now} /></td>
                    <td className="py-1.5 text-right tabular-nums">{r.sessionsSince}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm">Nothing changed and nothing new was logged for any lift or benchmark.</p>
          )}
        </section>
      ) : null}

      {since && sections.prs ? (
        <section data-testid="report-prs">
          <h3 className="report-heading text-lg font-semibold">PRs {span(since)}</h3>
          {data.prs.length > 0 ? (
            <>
              <ul className="mt-2 divide-y divide-border text-sm">
                {data.prs.slice(0, PRS_SHOWN).map((pr, i) => (
                  <li key={`${pr.date}-${pr.title}-${i}`} className="report-row flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
                    <span>
                      <span className="font-medium">{pr.title}</span>
                      {pr.display ? <span className="text-muted-foreground">: {pr.display}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{longDate(pr.date)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                PRs as flagged in SugarWOD.{data.prs.length > PRS_SHOWN ? ` ${data.prs.length - PRS_SHOWN} more not shown.` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm">No PRs were flagged in SugarWOD in this period.</p>
          )}
        </section>
      ) : null}

      {sections.verdicts ? (
        <section data-testid="report-verdicts">
          <h3 className="report-heading text-lg font-semibold">Lifts and benchmarks</h3>
          {judged.length > 0 ? (
            <ul className="mt-2 divide-y divide-border">
              {judged.map(({ row, kind }) => {
                const text = row.verdict ? verdictText(row.subject, row.verdict) : null;
                return (
                  <li key={row.subject.key} className="report-row py-2 text-sm">
                    <span className="font-medium">{displayName(row.subject)}</span>
                    <VerdictPill kind={kind} />
                    {text ? (
                      <>
                        <p className="mt-0.5 text-muted-foreground">{text.change}</p>
                        <p className="text-xs text-muted-foreground">{text.windows}</p>
                      </>
                    ) : row.moveUp ? (
                      <p className="mt-0.5 text-muted-foreground">{moveUpText(row.moveUp)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm">No lift or benchmark has a verdict yet.</p>
          )}
        </section>
      ) : null}

      {sections.changes && data.changes.length > 0 ? (
        <section data-testid="report-changes">
          <h3 className="report-heading text-lg font-semibold">Changes you made</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Entries from your Timeline{since ? ` that touch the period ${span(since)}` : ""}. A comparison covers sessions before an entry against sessions during it, and states what was logged, not a cause.
          </p>
          <ul className="mt-2 flex flex-col gap-4">
            {data.changes.map(({ entry, verdict, bodyLine }) => {
              const summary = verdict ? entrySummary(verdict) : null;
              const facts = verdict && !verdict.label ? entryFactsLines(verdict, entry, data.today) : null;
              return (
                <li key={entry.id} className="report-card text-sm" data-testid="report-change">
                  <h4 className="font-semibold">{entryName(entry)}</h4>
                  <p className="text-muted-foreground">
                    {INITIATION_LABEL[entry.initiation]} · {AREA_LABEL[entry.area]} · {entrySpanText(entry)}
                  </p>
                  {verdict ? (
                    summary ? (
                      <>
                        <p className="mt-1">{summary}</p>
                        {entryLeftOut(verdict) ? <p className="text-xs text-muted-foreground">{entryLeftOut(verdict)}</p> : null}
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {verdict.compared.map((r) =>
                            r.verdict ? (
                              <li key={r.subject.key} className="report-row">
                                <span className="font-medium">{displayName(r.subject)}</span>
                                <span className="text-muted-foreground"> · {STATE_WORD[r.verdict.state]}, {verdictText(r.subject, r.verdict).change}</span>
                              </li>
                            ) : null
                          )}
                          {verdict.moveUps.map((m) => (
                            <li key={m.subject.key} className="report-row">
                              <span className="font-medium">{displayName(m.subject)}</span>
                              <span className="text-muted-foreground"> · Moved up to RX</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 font-medium">No before and after yet</p>
                        <p className="text-muted-foreground">{entryShortfall(verdict)}</p>
                        {facts && facts.lines.length > 0 ? (
                          <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                            {facts.lines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                            {facts.more > 0 ? <li>and {facts.more} more</li> : null}
                          </ul>
                        ) : null}
                      </>
                    )
                  ) : (
                    <p className="mt-1 text-muted-foreground">Shown for context, with no before and after.</p>
                  )}
                  {sections.body && bodyLine ? <p className="mt-1 text-muted-foreground">{bodyLine}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {sections.notJudged && notJudged.length > 0 ? (
        <section data-testid="report-not-judged" className="report-card">
          <h3 className="report-heading text-lg font-semibold">Not judged</h3>
          <ul className="mt-2 text-sm">
            {notJudged.map((r) => (
              <li key={r.subject.key} className="report-row py-0.5">
                <span className="font-medium">{displayName(r.subject)}</span>
                <span className="text-muted-foreground">: {sinceStateLabel(r.group)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
