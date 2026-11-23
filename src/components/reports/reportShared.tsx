import { useId, useMemo, useState, type CSSProperties } from "react";
import dayjs from "dayjs";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/dashboard/SegmentedControl";
import { readAudience, type Audience } from "@/lib/audience";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/lib/analytics/insights/period";
import { reportPeriod } from "@/lib/analytics/insights/reportPeriod";
import { capture, type ReportKind } from "@/lib/posthog";
import { accentCssVars } from "@/lib/theme/palette";
import { useTheme } from "@/lib/theme/useTheme";
import { COACH_NOTE_MAX } from "./reportNote";

/**
 * What every report's view shares (docs/reports.md): the report date and audience, the period control, the coach note, and the print
 * button. A report's own view adds its sections and its sheet body; nothing here knows what a report prints.
 */

export const fmtDate = (iso: string): string => dayjs(iso).format("MMM D, YYYY");

/** The report date (today, unless a test says otherwise), the audience, and the sheet's light-mode accent. */
export function useReportContext(asOf?: string): { today: string; audience: Audience; sheetAccent: CSSProperties } {
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);
  const audience = useMemo(() => readAudience() ?? "athlete", []);
  const { swatch } = useTheme();
  // The sheet is always the light page: the app's accent, with its light-mode roles.
  const sheetAccent = useMemo(() => accentCssVars(swatch, "light") as CSSProperties, [swatch]);
  return { today, audience, sheetAccent };
}

/**
 * The period a report covers. It uses the app's one set of presets (tests/presets.test.ts), is not the Training range and is not
 * stored (R-15). An invalid custom period is reported as all time until it is fixed, with the reason shown beside the control.
 */
export function useReportPeriod(today: string) {
  const [preset, setPreset] = useState<PeriodPreset>("all_time");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const chosen = reportPeriod(preset, today, custom);
  const invalid = chosen === "invalid";
  const period = chosen === "invalid" ? { start: null, end: today } : chosen;
  return { preset, setPreset, custom, setCustom, invalid, start: period.start, end: period.end, endsToday: period.end === today };
}

export type ReportPeriodState = ReturnType<typeof useReportPeriod>;

/** The footer's basis: the log's last day, and where the report stops when that is not today. */
export function basisText(lastLogged: string | null, end: string, endsToday: boolean): string {
  return `${lastLogged ? `Workout log through ${fmtDate(lastLogged)}.` : "Workout log is empty."}${endsToday ? "" : ` Report covers through ${fmtDate(end)}.`}`;
}

export function PeriodControl({ state, today, hint }: { state: ReportPeriodState; today: string; hint: string }) {
  const ids = { from: useId(), to: useId() };
  const { preset, setPreset, custom, setCustom, invalid } = state;
  return (
    <div className="flex flex-col gap-2">
      <span id="report-period-label" className="text-xs font-medium text-muted-foreground">Period</span>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl value={preset} onChange={setPreset} options={PERIOD_OPTIONS} ariaLabel="Period" wrap />
        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <label className="flex items-center gap-1.5" htmlFor={ids.from}>
              From
              <input
                id={ids.from}
                type="date"
                max={today}
                value={custom.start}
                onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                aria-invalid={invalid}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-1.5" htmlFor={ids.to}>
              To
              <input
                id={ids.to}
                type="date"
                max={today}
                value={custom.end}
                onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                aria-invalid={invalid}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>
        ) : null}
      </div>
      {invalid ? <p role="alert" className="text-sm text-destructive">The start must be before the end, and the end cannot be after today.</p> : null}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The coach's note, for the coach audience only. Plain text, never stored (R-4): it is gone when the view is. */
export function CoachNoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ids = { note: useId(), count: useId() };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.note} className="text-xs font-medium text-muted-foreground">Coach note (printed at the end of the report)</label>
      <textarea
        id={ids.note}
        value={value}
        maxLength={COACH_NOTE_MAX}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={ids.count}
        rows={3}
        className="w-full max-w-xl rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      />
      <span id={ids.count} className="text-xs text-muted-foreground">{value.length} of {COACH_NOTE_MAX} characters. Not saved: it is gone when you leave this page.</span>
    </div>
  );
}

/** Opens the print dialog and records only which report was generated and for whom: never the period, the sections, the note or anything from the log. */
export function PrintRow({ kind, audience }: { kind: ReportKind; audience: Audience }) {
  const print = () => {
    capture({ name: "report_generated", props: { report_kind: kind, audience } });
    window.print();
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* A filled button is only a fill, which forced colors drops: the border keeps it a button there. */}
      <Button type="button" onClick={print} className="forced-colors:border-2 forced-colors:border-[ButtonText]">
        <Printer className="size-4" aria-hidden="true" />
        Print or save as PDF
      </Button>
      <span className="text-xs text-muted-foreground">The report is built in this browser and goes nowhere until you save it.</span>
    </div>
  );
}
