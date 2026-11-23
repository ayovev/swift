import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { SwiftMark } from "@/components/SwiftMark";
import { TIME_AXIS_PROPS } from "@/components/dashboard/charts/chartUtils";
import { VerdictPill, headlineLabelClass, type VerdictKind } from "@/components/dashboard/progress/verdictMark";
import { displayName, verdictText } from "@/lib/analytics/insights/display";
import { classifySubjects, headlineSentence, type ProgressRow } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { monthlyDaysTrained } from "@/lib/analytics/overview";
import { getPipeline, loadPipeline } from "@/lib/analytics/pipeline";
import type { SugarWodRow } from "@/types/sugarwod";
import "./report.css";

/**
 * PROTOTYPE, not the feature. It exists to answer the print questions in docs/reports.md before any product UI is built: does a
 * Recharts chart size correctly in print, do rows and cards break cleanly across pages, does a footer repeat on every page, and does
 * the sheet stay light in dark mode. It reads the same pure functions Progress does (classifySubjects, verdictText) and nothing else;
 * there is no period, no Timeline section and no brand yet.
 */
const KIND_OF: Record<string, VerdictKind | null> = {
  up: "up",
  down: "down",
  "not-tested-since": "not-tested-since",
  "no-clear-change": "no-clear-change",
};

function verdictKindOf(row: ProgressRow): VerdictKind | null {
  if (row.moveUpVotes) return "move-up";
  return KIND_OF[row.group] ?? null;
}

export function ProgressReportPrototype({ rows, today }: { rows: SugarWodRow[]; today: string }) {
  const [pipelineReady, setPipelineReady] = useState(getPipeline() !== null);
  useEffect(() => {
    void loadPipeline().then(() => setPipelineReady(true));
  }, []);

  const { subjects } = useMemo(() => buildProgressSubjects(rows), [rows]);
  const { rows: classified, headline } = useMemo(() => classifySubjects(subjects, today), [subjects, today]);
  const days = useMemo(() => {
    const pipeline = getPipeline();
    if (!pipeline) return [];
    return monthlyDaysTrained(pipeline.buildInsights(rows).allRows, today);
  }, [rows, today, pipelineReady]);

  const judged = classified.filter((r) => verdictKindOf(r) !== null);
  const latest = rows.reduce((max, r) => {
    const d = dayjs(r.date, "MM/DD/YYYY");
    return d.isValid() && d.format("YYYY-MM-DD") > max ? d.format("YYYY-MM-DD") : max;
  }, "");

  return (
    <div className="min-h-svh bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-4 text-sm">
        <span className="text-muted-foreground">Print prototype (dev only)</span>
        <button type="button" onClick={() => window.print()} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
          Print
        </button>
      </div>

      <article className="report-sheet mx-auto max-w-[8.5in] bg-background p-[0.6in] shadow-sm">
        <table className="report-table w-full">
          <tbody>
            <tr>
              <td className="align-top">
        <header className="flex items-start justify-between border-b-2 border-primary pb-3">
          <div>
            <h1 className="text-2xl font-semibold">Progress report</h1>
            <p className="text-sm text-muted-foreground">Verdicts use full history as of {dayjs(today).format("MMM D, YYYY")}.</p>
          </div>
          <SwiftMark />
        </header>

        <section className="report-card mt-5">
          <h2 className="report-heading text-lg font-semibold">
            <span className={headline.label ? headlineLabelClass(headline.label) : ""}>{headline.label ?? "No headline yet"}</span>
          </h2>
          {headline.label ? (
            <p className="mt-1 text-sm">{headlineSentence(headline.label, headline.up, headline.down, headline.noClearChange)}</p>
          ) : null}
        </section>

        <section className="report-card mt-6">
          <h2 className="report-heading text-lg font-semibold">Days trained per month</h2>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" {...TIME_AXIS_PROPS} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Bar dataKey="days" fill="var(--primary)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="report-heading text-lg font-semibold">Lifts and benchmarks</h2>
          <ul className="mt-2 divide-y divide-border">
            {judged.map((row) => {
              const kind = verdictKindOf(row)!;
              const text = row.verdict ? verdictText(row.subject, row.verdict) : null;
              return (
                <li key={row.subject.key} className="report-row py-2 text-sm">
                  <span className="font-medium">{displayName(row.subject)}</span>
                  <VerdictPill kind={kind} />
                  {text ? <p className="mt-0.5 text-muted-foreground">{text.change}</p> : null}
                  {text ? <p className="text-xs text-muted-foreground">{text.windows}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="report-card mt-6">
          <h2 className="report-heading text-lg font-semibold">Coach note</h2>
          <p className="mt-1 text-sm text-muted-foreground">(Prototype: the note goes here, at the end, under its own heading.)</p>
        </section>

              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>
                <footer className="report-footer mt-6 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>
                    Workout log through {latest ? dayjs(latest).format("MMM D, YYYY") : "n/a"}. Report date {dayjs(today).format("MMM D, YYYY")}.
                  </span>
                  <SwiftMark />
                </footer>
              </td>
            </tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}
