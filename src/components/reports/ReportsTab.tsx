import { useId, useMemo, useState, type CSSProperties } from "react";
import dayjs from "dayjs";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/dashboard/SegmentedControl";
import { readAudience } from "@/lib/audience";
import { buildProgressReportData, sinceFromPreset, type SincePreset } from "@/lib/analytics/insights/progressReport";
import { capture } from "@/lib/posthog";
import { accentCssVars } from "@/lib/theme/palette";
import { useTheme } from "@/lib/theme/useTheme";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { ProgressReport, type ProgressSections } from "./ProgressReport";
import { ReportSheet } from "./ReportSheet";
import { COACH_NOTE_MAX } from "./reportNote";

type SinceMode = "full" | SincePreset | "custom";
const SINCE_OPTIONS = [
  { id: "full", label: "Full history" },
  { id: "4w", label: "4 weeks" },
  { id: "8w", label: "8 weeks" },
  { id: "6m", label: "6 months" },
  { id: "custom", label: "A date" },
] as const;

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
  const today = useMemo(() => asOf ?? dayjs().format("YYYY-MM-DD"), [asOf]);
  const audience = useMemo(() => readAudience() ?? "athlete", []);
  const { swatch } = useTheme();
  // The sheet is always the light page: the app's accent, with its light-mode roles.
  const sheetAccent = useMemo(() => accentCssVars(swatch, "light") as CSSProperties, [swatch]);

  const [mode, setMode] = useState<SinceMode>("full");
  const [custom, setCustom] = useState("");
  const [sections, setSections] = useState<ProgressSections>({ since: true, prs: true, verdicts: true, changes: true, body: false, notJudged: false });
  const [note, setNote] = useState("");
  const ids = { date: useId(), note: useId(), noteCount: useId() };

  const customValid = custom !== "" && dayjs(custom).isValid() && custom < today;
  const since = mode === "full" ? null : mode === "custom" ? (customValid ? custom : null) : sinceFromPreset(mode, today);
  const data = useMemo(() => buildProgressReportData(workouts, today, since, { timeline, scans, weighIns }), [workouts, today, since, timeline, scans, weighIns]);

  const subtitle = `Verdicts use your full history, as of ${dayjs(today).format("MMM D, YYYY")}.`;
  const basis = data.lastLogged ? `Workout log through ${dayjs(data.lastLogged).format("MMM D, YYYY")}.` : "Workout log is empty.";

  const toggle = (key: keyof ProgressSections) => setSections((s) => ({ ...s, [key]: !s[key] }));
  const print = () => {
    // A closed vocabulary: which report, for which audience. Never the period, the sections, the note or anything from the log.
    capture({ name: "report_generated", props: { report_kind: "progress", audience } });
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-border p-4 print:hidden">
        <div className="flex flex-col gap-2">
          <span id="report-since-label" className="text-xs font-medium text-muted-foreground">Compare with Progress as of</span>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl value={mode} onChange={setMode} options={SINCE_OPTIONS} ariaLabel="Compare with Progress as of" wrap />
            {mode === "custom" ? (
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground" htmlFor={ids.date}>
                Date
                <input
                  id={ids.date}
                  type="date"
                  max={dayjs(today).subtract(1, "day").format("YYYY-MM-DD")}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-invalid={custom !== "" && !customValid}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                />
              </label>
            ) : null}
          </div>
          {mode === "custom" && custom !== "" && !customValid ? (
            <p role="alert" className="text-sm text-destructive">Pick a date before today.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">Verdicts always use your full history. A date adds what changed since then.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Sections</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.verdicts} onChange={() => toggle("verdicts")} />
            Lifts and benchmarks
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.since} onChange={() => toggle("since")} disabled={since === null} />
            Since the chosen date{since === null ? " (choose a date first)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sections.prs} onChange={() => toggle("prs")} disabled={since === null} />
            PRs since the chosen date{since === null ? " (choose a date first)" : ""}
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

        {audience === "coach" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.note} className="text-xs font-medium text-muted-foreground">Coach note (printed at the end of the report)</label>
            <textarea
              id={ids.note}
              value={note}
              maxLength={COACH_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={ids.noteCount}
              rows={3}
              className="w-full max-w-xl rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <span id={ids.noteCount} className="text-xs text-muted-foreground">{note.length} of {COACH_NOTE_MAX} characters. Not saved: it is gone when you leave this page.</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={print}>
            <Printer className="size-4" aria-hidden="true" />
            Print or save as PDF
          </Button>
          <span className="text-xs text-muted-foreground">The report is built in this browser and goes nowhere until you save it.</span>
        </div>
      </div>

      <ReportSheet title="Progress report" subtitle={subtitle} audience={audience} today={today} basis={basis} note={audience === "coach" ? note : ""} style={sheetAccent}>
        <ProgressReport data={data} since={since} sections={sections} />
      </ReportSheet>
    </div>
  );
}
