import { useMemo, useState } from "react";
import { useChartView } from "@/components/dashboard/charts/ChartTable";
import type { ParsedRow } from "@/lib/analytics/buildDashboardData";
import { buildBodyTraining, hasBodyReadings } from "@/lib/analytics/bodyTraining";
import type { InBodyRow } from "@/types/inbody";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { BodyTrainingReport, type BodyTrainingSections } from "./BodyTrainingReport";
import { ReportSheet } from "./ReportSheet";
import { ChartViewControl, CoachNoteField, PeriodControl, PrintRow, fmtDate, useReportContext, useReportPeriod } from "./reportShared";

interface BodyTrainingTabProps {
  /** Every parsed row, oldest first (`Insights.allRows`): the same parse as every other view. */
  parsedRows: readonly ParsedRow[];
  scans: readonly InBodyRow[];
  weighIns: readonly WeighIn[];
  timeline: readonly TimelineEntry[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
}

/**
 * The Body and training report (docs/reports.md): body weight, lean and fat mass, days trained and the Progress headline for a period,
 * side by side. It needs an InBody file or weigh-ins, and says so when there are none. Choosing this report is the opt-in to print body
 * weight; lean and fat mass are a separate section that starts on when the athlete has InBody scans and off when they have none (R-3). Nothing here relates body to training.
 */
export function BodyTrainingTab({ parsedRows, scans, weighIns, timeline, asOf }: BodyTrainingTabProps) {
  const { today, audience, sheetAccent } = useReportContext(asOf);
  const period = useReportPeriod(today);
  const { start, end, endsToday } = period;
  const [sections, setSections] = useState<BodyTrainingSections>(() => ({ weight: true, leanFat: scans.length > 0, days: true, headline: true, entries: true }));
  const [note, setNote] = useState("");
  const [view] = useChartView();

  const available = useMemo(() => hasBodyReadings(scans, weighIns), [scans, weighIns]);
  const data = useMemo(() => (available ? buildBodyTraining(parsedRows, scans, weighIns, timeline, start, end) : null), [available, parsedRows, scans, weighIns, timeline, start, end]);

  if (!data) {
    return (
      <div className="rounded-lg border border-border p-4" data-testid="body-training-unavailable">
        <p className="text-sm font-medium">Needs an InBody file or weigh-ins.</p>
        <p className="mt-1 text-sm text-muted-foreground">Add either from Body Comp, then come back here.</p>
      </div>
    );
  }

  const periodLabel = start ? `${fmtDate(start)} – ${fmtDate(end)}` : `All time, through ${fmtDate(end)}`;
  const basis = [
    data.mix.lastLogged ? `Workout log through ${fmtDate(data.mix.lastLogged)}.` : "Workout log is empty.",
    data.lastScan ? `InBody scans through ${fmtDate(data.lastScan)}.` : null,
    data.lastWeighIn ? `Weigh-ins through ${fmtDate(data.lastWeighIn)}.` : null,
    endsToday ? null : `Report covers through ${fmtDate(end)}.`,
  ].filter(Boolean).join(" ");
  const toggle = (key: keyof BodyTrainingSections) => setSections((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-border p-4 print:hidden">
        <PeriodControl state={period} today={today} hint="The period is the report's own: it does not follow the Training date range. Progress is shown as of the end of the period." />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Sections</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.weight} onChange={() => toggle("weight")} />
            Body weight
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.leanFat} onChange={() => toggle("leanFat")} disabled={!data.hasLeanFat} />
            Lean and fat mass{!data.hasLeanFat ? " (scans only; none in this period)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.days} onChange={() => toggle("days")} />
            Days trained per month
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.headline} onChange={() => toggle("headline")} />
            Progress headline
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.entries} onChange={() => toggle("entries")} disabled={data.entries.length === 0} />
            Timeline entries{data.entries.length === 0 ? " (none in this period)" : ""}
          </label>
        </fieldset>

        <ChartViewControl />

        {audience === "coach" ? <CoachNoteField value={note} onChange={setNote} /> : null}

        <p className="text-xs text-muted-foreground">This report prints body weight. A saved copy is yours to protect: it holds health data.</p>
        <PrintRow kind="body-training" audience={audience} />
      </div>

      <ReportSheet title="Body and training report" period={periodLabel} audience={audience} today={today} basis={basis} note={audience === "coach" ? note : ""} style={sheetAccent}>
        <BodyTrainingReport data={data} sections={sections} view={view} />
      </ReportSheet>
    </div>
  );
}
