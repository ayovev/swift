import { useMemo, useState } from "react";
import { buildProgressReportData } from "@/lib/analytics/insights/progressReport";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { ProgressReport, type ProgressSections } from "./ProgressReport";
import { ReportSheet } from "./ReportSheet";
import { CoachNoteField, PeriodControl, PrintRow, basisText, fmtDate, useReportContext, useReportPeriod } from "./reportShared";

interface ReportsTabProps {
  workouts: readonly SugarWodRow[];
  /** The athlete's Timeline entries, for "Changes you made". */
  timeline?: readonly TimelineEntry[];
  /** InBody scans and manual weigh-ins, for body weight over an entry's span (off unless the section is turned on). */
  scans?: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
}

/**
 * Reports (docs/reports.md): choose what a report covers, preview it, print it. Phase 1 has one report, Progress. Everything here is local:
 * the report is built from the loaded log, nothing about it is stored (R-15), and the browser's print dialog saves the PDF (R-5).
 *
 * The controls and the page around the sheet are `print:hidden` (Dashboard.tsx hides its own chrome on this view), so what prints is the sheet.
 */
// Stable empties, so an omitted prop does not rebuild the report on every render.
const NO_ENTRIES: readonly TimelineEntry[] = [];
const NO_SCANS: readonly InBodyRow[] = [];
const NO_WEIGH_INS: readonly WeighIn[] = [];

export function ReportsTab({ workouts, timeline = NO_ENTRIES, scans = NO_SCANS, weighIns = NO_WEIGH_INS, asOf }: ReportsTabProps) {
  const { today, audience, sheetAccent } = useReportContext(asOf);
  const period = useReportPeriod(today);
  const { start: since, end, endsToday } = period;
  const [sections, setSections] = useState<ProgressSections>({ since: true, prs: true, verdicts: true, changes: true, body: false, notJudged: false });
  const [note, setNote] = useState("");

  const data = useMemo(() => buildProgressReportData(workouts, end, since, { timeline, scans, weighIns }), [workouts, end, since, timeline, scans, weighIns]);
  const periodLabel = since ? `${fmtDate(since)} – ${fmtDate(end)}` : `All time, through ${fmtDate(end)}`;
  const toggle = (key: keyof ProgressSections) => setSections((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-border p-4 print:hidden">
        <PeriodControl
          state={period}
          today={today}
          hint="All time prints Progress as of today. A period prints Progress as of its end and what changed since its start. Verdicts always use your full history up to the end."
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Sections</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.verdicts} onChange={() => toggle("verdicts")} />
            Lifts and benchmarks
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.since} onChange={() => toggle("since")} disabled={since === null} />
            What changed in the period{since === null ? " (choose a period first)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.prs} onChange={() => toggle("prs")} disabled={since === null} />
            PRs in the period{since === null ? " (choose a period first)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.changes} onChange={() => toggle("changes")} disabled={timeline.length === 0} />
            Changes you made (Timeline entries){timeline.length === 0 ? " (none on your Timeline)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.body} onChange={() => toggle("body")} disabled={timeline.length === 0 || !data.hasBodyReadings} />
            Body weight over each entry{!data.hasBodyReadings ? " (needs InBody scans or weigh-ins)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.notJudged} onChange={() => toggle("notJudged")} />
            Not judged (too few sessions, or not recent)
          </label>
        </fieldset>

        {audience === "coach" ? <CoachNoteField value={note} onChange={setNote} /> : null}

        <PrintRow kind="progress" audience={audience} />
      </div>

      <ReportSheet title="Progress report" period={periodLabel} audience={audience} today={today} basis={basisText(data.lastLogged, end, endsToday)} note={audience === "coach" ? note : ""} style={sheetAccent}>
        <ProgressReport data={data} since={since} endsToday={endsToday} sections={sections} />
      </ReportSheet>
    </div>
  );
}
