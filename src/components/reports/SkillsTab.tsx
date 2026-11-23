import { useMemo, useState } from "react";
import type { ParsedRow } from "@/lib/analytics/buildDashboardData";
import { buildSkills } from "@/lib/analytics/skills";
import { ReportSheet } from "./ReportSheet";
import { SkillsReport } from "./SkillsReport";
import { CoachNoteField, PeriodControl, PrintRow, basisText, fmtDate, useReportContext, useReportPeriod } from "./reportShared";

interface SkillsTabProps {
  /** Every parsed row, oldest first (`Insights.allRows`): the same parse as every other view, never a second `parseRows()`. */
  parsedRows: readonly ParsedRow[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
}

/**
 * The Skills report (docs/reports.md, "Skills report"): which movements the athlete has done as prescribed, and which are new in the
 * period. Needs only the SugarWOD log. A check is the log's claim (a workout flagged RX that includes the movement), never a grade.
 */
export function SkillsTab({ parsedRows, asOf }: SkillsTabProps) {
  const { today, audience, sheetAccent } = useReportContext(asOf);
  const period = useReportPeriod(today);
  const { start, end, endsToday } = period;
  const [showOpen, setShowOpen] = useState(true);
  const [note, setNote] = useState("");

  const data = useMemo(() => buildSkills(parsedRows, start, end), [parsedRows, start, end]);
  const periodLabel = start ? `${fmtDate(start)} – ${fmtDate(end)}` : `All time, through ${fmtDate(end)}`;
  const subtitle = "Movements done as prescribed (RX).";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-border p-4 print:hidden">
        <PeriodControl
          state={period}
          today={today}
          hint="A skill counts as done when a workout with it was logged RX on or before the end. A period also shows what was done before its start, and what is new in it."
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Sections</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showOpen} onChange={() => setShowOpen((v) => !v)} />
            Show skills not yet done
          </label>
        </fieldset>

        {audience === "coach" ? <CoachNoteField value={note} onChange={setNote} /> : null}

        <PrintRow kind="skills" audience={audience} />
      </div>

      <ReportSheet title="Skills report" period={periodLabel} subtitle={subtitle} audience={audience} today={today} basis={basisText(data.lastLogged, end, endsToday)} note={audience === "coach" ? note : ""} style={sheetAccent}>
        <SkillsReport data={data} showOpen={showOpen} />
      </ReportSheet>
    </div>
  );
}
