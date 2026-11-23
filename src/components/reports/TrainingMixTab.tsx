import { useMemo, useState } from "react";
import { ChartViewToggle, useChartView } from "@/components/dashboard/charts/ChartTable";
import type { ParsedRow } from "@/lib/analytics/buildDashboardData";
import { buildTrainingMix } from "@/lib/analytics/trainingMix";
import { ReportSheet } from "./ReportSheet";
import { TrainingMixReport, type TrainingMixSections } from "./TrainingMixReport";
import { CoachNoteField, PeriodControl, PrintRow, basisText, fmtDate, useReportContext, useReportPeriod } from "./reportShared";

interface TrainingMixTabProps {
  /** Every parsed row, oldest first (`Insights.allRows`): the same parse as every other view, never a second `parseRows()`. */
  parsedRows: readonly ParsedRow[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
}

/**
 * The Training mix report (docs/reports.md): how much was trained and what it was made of, for a period. Needs only the SugarWOD log. It
 * is built on the Training views' own builders over the period's rows (`trainingMix.ts`), so it never disagrees with them. Charts follow
 * the app's chart-or-table preference, so a table twin is one switch away and prints when chosen.
 */
export function TrainingMixTab({ parsedRows, asOf }: TrainingMixTabProps) {
  const { today, audience, sheetAccent } = useReportContext(asOf);
  const period = useReportPeriod(today);
  const { start, end, endsToday } = period;
  const [sections, setSections] = useState<TrainingMixSections>({ days: true, mix: true, domains: true, movements: true });
  const [note, setNote] = useState("");
  const [view] = useChartView();

  const data = useMemo(() => buildTrainingMix(parsedRows, start, end), [parsedRows, start, end]);
  const periodLabel = start ? `${fmtDate(start)} – ${fmtDate(end)}` : `All time, through ${fmtDate(end)}`;
  const subtitle = "Workouts, domains, movements and the M/W/G split.";
  const toggle = (key: keyof TrainingMixSections) => setSections((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-border p-4 print:hidden">
        <PeriodControl state={period} today={today} hint="The period is the report's own: it does not follow the Training date range. All time covers every workout up to today." />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Sections</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.days} onChange={() => toggle("days")} />
            Days trained per month
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.mix} onChange={() => toggle("mix")} />
            M/W/G split per month
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.domains} onChange={() => toggle("domains")} />
            The ten domains
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.movements} onChange={() => toggle("movements")} />
            Most-used movements
          </label>
        </fieldset>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Charts</span>
          <ChartViewToggle className="self-start" />
          <span className="text-xs text-muted-foreground">Shows every chart, here and elsewhere in Swift, as a table. What you see is what prints.</span>
        </div>

        {audience === "coach" ? <CoachNoteField value={note} onChange={setNote} /> : null}

        <PrintRow kind="training-mix" audience={audience} />
      </div>

      <ReportSheet title="Training mix report" period={periodLabel} subtitle={subtitle} audience={audience} today={today} basis={basisText(data.lastLogged, end, endsToday)} note={audience === "coach" ? note : ""} style={sheetAccent}>
        <TrainingMixReport data={data} sections={sections} view={view} />
      </ReportSheet>
    </div>
  );
}
